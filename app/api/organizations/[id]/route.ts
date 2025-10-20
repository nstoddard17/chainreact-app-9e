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
      return errorResponse("Unauthorized" , 401)
    }

    // Get organization with service client
    const { data: organization, error } = await serviceClient
      .from("organizations")
      .select(`
        *,
        organization_members(user_id, role)
      `)
      .eq("id", id)
      .single()

    if (error) {
      logger.error("Error fetching organization:", error)
      return errorResponse("Failed to fetch organization" , 500)
    }

    // Check if user has access to this organization
    const userMember = organization.organization_members?.find((member: any) => member.user_id === user.id)
    if (!userMember) {
      return errorResponse("Access denied" , 403)
    }

    // Fetch teams count separately
    const { count: teamCount } = await serviceClient
      .from("teams")
      .select("id", { count: 'exact', head: true })
      .eq("organization_id", id)

    // Return organization with user's role
    const result = {
      ...organization,
      role: userMember.role,
      member_count: organization.organization_members?.length || 1,
      team_count: teamCount || 0
    }

    return jsonResponse(result)
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error" , 500)
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
      return errorResponse("Unauthorized" , 401)
    }

    const body = await request.json()
    const { name, description, billing_email, billing_address, owner_id } = body

    // Check if user is organization owner
    const { data: organization, error: checkError } = await serviceClient
      .from("organizations")
      .select("owner_id, is_personal")
      .eq("id", id)
      .single()

    if (checkError || !organization) {
      return errorResponse("Organization not found" , 404)
    }

    if (organization.owner_id !== user.id) {
      return errorResponse("Only organization owners can update settings" , 403)
    }

    // Prevent ownership transfer of personal workspaces
    if (organization.is_personal && owner_id && owner_id !== organization.owner_id) {
      return errorResponse("Personal workspace ownership cannot be transferred" , 403)
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
      return errorResponse("Failed to update organization" , 500)
    }

    return jsonResponse(updatedOrg)
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error" , 500)
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
      return errorResponse("Unauthorized" , 401)
    }

    // Check if user is organization owner and if it's a personal workspace
    const { data: organization, error: checkError } = await serviceClient
      .from("organizations")
      .select("owner_id, name, is_personal")
      .eq("id", id)
      .single()

    if (checkError || !organization) {
      return errorResponse("Organization not found" , 404)
    }

    if (organization.owner_id !== user.id) {
      return errorResponse("Only organization owners can delete organizations" , 403)
    }

    // Prevent deletion of personal workspaces
    if (organization.is_personal) {
      return errorResponse("Personal workspaces cannot be deleted" , 403)
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

    // 2. Delete organization members
    const { error: membersError } = await serviceClient
      .from("organization_members")
      .delete()
      .eq("organization_id", id)

    if (membersError) {
      logger.error("Error deleting members:", membersError)
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

    // 4. Finally, delete the organization
    const { error: deleteError } = await serviceClient
      .from("organizations")
      .delete()
      .eq("id", id)

    if (deleteError) {
      logger.error("Error deleting organization:", deleteError)
      return errorResponse("Failed to delete organization" , 500)
    }

    return jsonResponse({ 
      message: `Organization "${organization.name}" has been permanently deleted`,
      organizationId: id 
    })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error" , 500)
  }
}