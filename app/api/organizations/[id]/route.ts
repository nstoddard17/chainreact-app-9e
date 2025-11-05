import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    // Try to get as organization first
    const { data: organization, error: orgError } = await serviceClient
      .from("organizations")
      .select("*")
      .eq("id", id)
      .single()

    // If not found as organization, try as workspace (personal workspace)
    if (orgError || !organization) {
      const { data: workspace, error: workspaceError } = await serviceClient
        .from("workspaces")
        .select("*")
        .eq("id", id)
        .single()

      if (workspaceError || !workspace) {
        logger.error("Error fetching organization/workspace:", orgError || workspaceError)
        return errorResponse("Organization or workspace not found", 404)
      }

      // Check if user owns this workspace
      if (workspace.owner_id !== user.id) {
        return errorResponse("Access denied - not the workspace owner", 403)
      }

      // Return workspace formatted as organization-like object
      const result = {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        description: workspace.description,
        avatar_url: workspace.avatar_url,
        settings: workspace.settings,
        owner_id: workspace.owner_id,
        created_at: workspace.created_at,
        updated_at: workspace.updated_at,
        user_role: 'owner',
        member_count: 1,
        team_count: 0,
        is_workspace: true
      }

      return jsonResponse(result)
    }

    // It's an organization - check team membership
    const { data: userTeams } = await serviceClient
      .from("teams")
      .select(`
        id,
        team_members!inner(role)
      `)
      .eq("organization_id", id)
      .eq("team_members.user_id", user.id)

    if (!userTeams || userTeams.length === 0) {
      return errorResponse("Access denied - not a member of this organization", 403)
    }

    // Get user's highest role
    const roleHierarchy = { owner: 4, admin: 3, member: 2, viewer: 1 }
    let highestRole = 'viewer'
    userTeams.forEach((team: any) => {
      team.team_members?.forEach((tm: any) => {
        if ((roleHierarchy[tm.role as keyof typeof roleHierarchy] || 0) > (roleHierarchy[highestRole as keyof typeof roleHierarchy] || 0)) {
          highestRole = tm.role
        }
      })
    })

    // Fetch teams count
    const { count: teamCount } = await serviceClient
      .from("teams")
      .select("id", { count: 'exact', head: true })
      .eq("organization_id", id)

    // Get unique member count across all teams
    const { data: teamMembers } = await serviceClient
      .from("teams")
      .select(`
        team_members(user_id)
      `)
      .eq("organization_id", id)

    const uniqueMembers = new Set<string>()
    teamMembers?.forEach((team: any) => {
      team.team_members?.forEach((tm: any) => {
        uniqueMembers.add(tm.user_id)
      })
    })

    // Get billing information from organization owner's profile
    const { data: ownerProfile } = await serviceClient
      .from("user_profiles")
      .select("plan, credits")
      .eq("id", organization.owner_id)
      .single()

    // Return organization with user's role and billing info
    const result = {
      ...organization,
      user_role: highestRole,
      member_count: uniqueMembers.size,
      team_count: teamCount || 0,
      billing: ownerProfile ? {
        plan: ownerProfile.plan || 'free',
        credits: ownerProfile.credits || 0,
        billing_source: 'owner' as const
      } : undefined
    }

    return jsonResponse(result)
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error", 500)
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const body = await request.json()
    const { name, description, billing_email, billing_address } = body

    // Check if user is organization owner
    const { data: organization, error: checkError } = await serviceClient
      .from("organizations")
      .select("owner_id")
      .eq("id", id)
      .single()

    if (checkError || !organization) {
      return errorResponse("Organization not found", 404)
    }

    if (organization.owner_id !== user.id) {
      return errorResponse("Only organization owners can update settings", 403)
    }

    // Update organization
    const { data: updatedOrg, error: updateError } = await serviceClient
      .from("organizations")
      .update({
        name,
        description,
        billing_email,
        billing_address
      })
      .eq("id", id)
      .select()
      .single()

    if (updateError) {
      logger.error("Error updating organization:", updateError)
      return errorResponse("Failed to update organization", 500)
    }

    return jsonResponse(updatedOrg)
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error", 500)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    // Check if user is organization owner
    const { data: organization, error: checkError } = await serviceClient
      .from("organizations")
      .select("owner_id, name")
      .eq("id", id)
      .single()

    if (checkError || !organization) {
      return errorResponse("Organization not found", 404)
    }

    if (organization.owner_id !== user.id) {
      return errorResponse("Only organization owners can delete organizations", 403)
    }

    // Delete all related data in the correct order (due to foreign key constraints)

    // 1. Delete organization invitations
    const { error: invitationsError } = await serviceClient
      .from("organization_invitations")
      .delete()
      .eq("organization_id", id)

    if (invitationsError) {
      logger.error("Error deleting invitations:", invitationsError)
    }

    // 2. Delete team members (teams will cascade delete via ON DELETE CASCADE)
    const { data: teams } = await serviceClient
      .from("teams")
      .select("id")
      .eq("organization_id", id)

    if (teams && teams.length > 0) {
      const teamIds = teams.map(t => t.id)
      const { error: teamMembersError } = await serviceClient
        .from("team_members")
        .delete()
        .in("team_id", teamIds)

      if (teamMembersError) {
        logger.error("Error deleting team members:", teamMembersError)
      }
    }

    // 3. Delete audit logs (if they exist)
    try {
      const { error: auditError } = await serviceClient
        .from("audit_logs")
        .delete()
        .eq("organization_id", id)

      if (auditError) {
        logger.error("Error deleting audit logs:", auditError)
      }
    } catch (error) {
      // Table might not exist, ignore error
      logger.debug("Audit logs table not found, skipping deletion")
    }

    // 4. Finally, delete the organization (teams will cascade delete)
    const { error: deleteError } = await serviceClient
      .from("organizations")
      .delete()
      .eq("id", id)

    if (deleteError) {
      logger.error("Error deleting organization:", deleteError)
      return errorResponse("Failed to delete organization", 500)
    }

    return jsonResponse({
      message: `Organization "${organization.name}" has been permanently deleted`,
      organizationId: id
    })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error", 500)
  }
}
