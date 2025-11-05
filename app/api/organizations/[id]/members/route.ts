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

    // Check if user has access to this organization (org member)
    const { data: orgMember } = await serviceClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (!orgMember) {
      return errorResponse("Access denied - not a member of this organization", 403)
    }

    // OPTIMIZATION: Use organization_members table directly
    // Fetch organization members and user profiles in parallel
    const { data: orgMembers, error: orgMembersError } = await serviceClient
      .from("organization_members")
      .select("user_id, role, created_at")
      .eq("organization_id", organizationId)

    if (orgMembersError) {
      logger.error("Error fetching organization members:", orgMembersError)
      return errorResponse("Failed to fetch members", 500)
    }

    // Get unique user IDs
    const userIds = [...new Set(orgMembers?.map(m => m.user_id) || [])]

    // Fetch user data from both user_profiles and auth.users in parallel
    const [profilesResult, authResult] = await Promise.all([
      serviceClient
        .from("user_profiles")
        .select("user_id, email, username, full_name, display_name")
        .in("user_id", userIds),
      serviceClient.auth.admin.listUsers()
    ])

    const userProfiles = profilesResult.data || []
    const authUsers = authResult.data.users?.filter(u => userIds.includes(u.id)) || []

    // Create profile lookup map
    const profileMap = new Map(userProfiles.map(p => [p.user_id, p]))

    // Create user lookup map for O(1) access, preferring user_profiles over auth metadata
    const userMap = new Map(
      authUsers.map(u => {
        const profile = profileMap.get(u.id)
        return [
          u.id,
          {
            user_id: u.id,
            email: profile?.email || u.email || 'No email',
            username: profile?.display_name || profile?.full_name || profile?.username || u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split('@')[0] || 'Unknown'
          }
        ]
      })
    )

    // Build members array with user details
    const members = orgMembers?.map(om => ({
      id: om.user_id,
      user_id: om.user_id,
      user: userMap.get(om.user_id) || { user_id: om.user_id, email: 'Unknown', username: null },
      role: om.role,
      org_level_role: om.role, // Mark as org-level role
      created_at: om.created_at,
      teams: [] // Organization members are org-level, not team-specific
    })) || []

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
