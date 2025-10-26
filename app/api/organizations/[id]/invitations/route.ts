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
    logger.debug('Invitations API: Starting request for organization:', organizationId)
    
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      logger.debug('Invitations API: User not authenticated')
      return errorResponse("Unauthorized" , 401)
    }

    logger.debug('Invitations API: User authenticated:', user.id)

    // Check if user is an admin of any team in this organization
    const { data: adminTeams } = await serviceClient
      .from("teams")
      .select(`
        id,
        team_members!inner(role)
      `)
      .eq("organization_id", organizationId)
      .eq("team_members.user_id", user.id)
      .eq("team_members.role", "admin")

    logger.debug('Invitations API: Admin teams check result:', { adminTeams })

    if (!adminTeams || adminTeams.length === 0) {
      logger.debug('Invitations API: Access denied - user is not an admin')
      return errorResponse("Insufficient permissions - only team admins can view invitations", 403)
    }

    logger.debug('Invitations API: User is admin, fetching invitations')

    // Get pending invitations
    const { data: invitations, error } = await serviceClient
      .from("organization_invitations")
      .select("*")
      .eq("organization_id", organizationId)
      .is("accepted_at", null) // Use IS NULL instead of = null
      .order("created_at", { ascending: false })

    logger.debug('Invitations API: Fetch result:', { invitations, error })

    if (error) {
      logger.error("Error fetching invitations:", error)
      return errorResponse("Failed to fetch invitations" , 500)
    }

    return jsonResponse(invitations || [])
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error" , 500)
  }
}

export async function DELETE(
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
      return errorResponse("Unauthorized" , 401)
    }

    const { searchParams } = new URL(request.url)
    const invitationId = searchParams.get('invitationId')

    if (!invitationId) {
      return errorResponse("Invitation ID is required" , 400)
    }

    // Check if user is an admin of any team in this organization
    const { data: adminTeams } = await serviceClient
      .from("teams")
      .select(`
        id,
        team_members!inner(role)
      `)
      .eq("organization_id", organizationId)
      .eq("team_members.user_id", user.id)
      .eq("team_members.role", "admin")

    if (!adminTeams || adminTeams.length === 0) {
      return errorResponse("Insufficient permissions - only team admins can delete invitations", 403)
    }

    // Delete the invitation
    const { error: deleteError } = await serviceClient
      .from("organization_invitations")
      .delete()
      .eq("id", invitationId)
      .eq("organization_id", organizationId)

    if (deleteError) {
      logger.error("Error deleting invitation:", deleteError)
      return errorResponse("Failed to delete invitation" , 500)
    }

    return jsonResponse({ success: true })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error" , 500)
  }
}
