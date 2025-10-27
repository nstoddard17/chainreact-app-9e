import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: organizationId } = await params
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    // Check if user has access to this organization (via org-level role or team membership)
    const { data: orgMember } = await serviceClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .maybeSingle()

    const { data: userTeams } = await serviceClient
      .from("teams")
      .select("id")
      .eq("organization_id", organizationId)
      .in("id",
        serviceClient
          .from("team_members")
          .select("team_id")
          .eq("user_id", user.id)
      )

    if (!orgMember && (!userTeams || userTeams.length === 0)) {
      return errorResponse("Access denied - not a member of this organization", 403)
    }

    // Get all teams in the organization with their members
    const { data: teams, error: teamsError } = await serviceClient
      .from("teams")
      .select(`
        id,
        name,
        slug,
        team_members(
          user_id,
          role,
          created_at,
          user:users(id, email, username)
        )
      `)
      .eq("organization_id", organizationId)

    if (teamsError) {
      logger.error("Error fetching teams:", teamsError)
      return errorResponse("Failed to fetch members", 500)
    }

    // Collect all unique members from all teams
    const memberMap = new Map()
    teams?.forEach((team: any) => {
      team.team_members?.forEach((tm: any) => {
        if (!memberMap.has(tm.user_id)) {
          memberMap.set(tm.user_id, {
            id: tm.user_id,
            user_id: tm.user_id,
            user: tm.user,
            role: tm.role,
            created_at: tm.created_at,
            teams: [{ id: team.id, name: team.name, slug: team.slug, role: tm.role }]
          })
        } else {
          const existing = memberMap.get(tm.user_id)
          existing.teams.push({ id: team.id, name: team.name, slug: team.slug, role: tm.role })
          // Keep the highest role (owner > admin > member > viewer)
          const roleHierarchy = { owner: 4, admin: 3, member: 2, viewer: 1 }
          if ((roleHierarchy[tm.role as keyof typeof roleHierarchy] || 0) > (roleHierarchy[existing.role as keyof typeof roleHierarchy] || 0)) {
            existing.role = tm.role
          }
        }
      })
    })

    const members = Array.from(memberMap.values())

    // Also fetch organization-level members (users with org-level roles)
    const { data: orgMembers, error: orgMembersError } = await serviceClient
      .from("organization_members")
      .select(`
        *,
        user:users(id, email, username)
      `)
      .eq("organization_id", organizationId)

    if (orgMembersError) {
      logger.error("Error fetching organization members:", orgMembersError)
    }

    // Add org-level members to the response
    const orgLevelMembers = orgMembers?.map(om => ({
      id: om.user_id,
      user_id: om.user_id,
      user: om.user,
      role: om.role,
      org_level_role: om.role, // Mark as org-level role
      created_at: om.created_at,
      teams: [] // Org-level members might not be in any specific team
    })) || []

    // Merge with team members, but mark users who have both
    orgLevelMembers.forEach(orgMember => {
      const existingMember = members.find(m => m.user_id === orgMember.user_id)
      if (existingMember) {
        existingMember.org_level_role = orgMember.role
      } else {
        members.push(orgMember)
      }
    })

    return jsonResponse({ members })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error", 500)
  }
}

// POST - Add organization-level member
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: organizationId } = await params
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const body = await request.json()
    const { user_id, email, role } = body

    // Validate role
    const validRoles = ['owner', 'admin', 'manager', 'hr', 'finance']
    if (!role || !validRoles.includes(role)) {
      return errorResponse(`Invalid role. Must be one of: ${validRoles.join(', ')}`, 400)
    }

    // Check if current user has permission (owner or admin)
    const { data: currentUserMember } = await serviceClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (!currentUserMember || !['owner', 'admin'].includes(currentUserMember.role)) {
      return errorResponse("You don't have permission to add organization members", 403)
    }

    // Only owners can add other owners
    if (role === 'owner' && currentUserMember.role !== 'owner') {
      return errorResponse("Only organization owners can add other owners", 403)
    }

    // Get user_id from email if not provided
    let targetUserId = user_id
    if (!targetUserId && email) {
      const { data: targetUser, error: getUserError } = await serviceClient.auth.admin.listUsers()
      const foundUser = targetUser?.users.find(u => u.email === email)
      if (!foundUser) {
        return errorResponse("User not found with that email", 404)
      }
      targetUserId = foundUser.id
    }

    if (!targetUserId) {
      return errorResponse("Either user_id or email is required", 400)
    }

    // Check if user is already an org member
    const { data: existingMember } = await serviceClient
      .from("organization_members")
      .select("id, role")
      .eq("organization_id", organizationId)
      .eq("user_id", targetUserId)
      .maybeSingle()

    if (existingMember) {
      return errorResponse(`User already has the org-level role: ${existingMember.role}`, 409)
    }

    // Add the member
    const { data: newMember, error: insertError } = await serviceClient
      .from("organization_members")
      .insert({
        organization_id: organizationId,
        user_id: targetUserId,
        role
      })
      .select()
      .single()

    if (insertError) {
      logger.error('Error adding organization member:', insertError)
      return errorResponse("Failed to add organization member", 500)
    }

    return jsonResponse({ member: newMember }, { status: 201 })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error", 500)
  }
}
