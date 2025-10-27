import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

/**
 * PUT /api/organizations/[id]/members/[memberId]
 * Update a member's organization-level role
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const { id: organizationId, memberId } = await params
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const body = await request.json()
    const { role } = body

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
      return errorResponse("You don't have permission to change member roles", 403)
    }

    // Only owners can assign owner role
    if (role === 'owner' && currentUserMember.role !== 'owner') {
      return errorResponse("Only organization owners can assign the owner role", 403)
    }

    // Can't change your own role
    if (memberId === user.id) {
      return errorResponse("You cannot change your own role", 400)
    }

    // Update the member's role
    const { data: updatedMember, error: updateError } = await serviceClient
      .from("organization_members")
      .update({ role })
      .eq("organization_id", organizationId)
      .eq("user_id", memberId)
      .select()
      .single()

    if (updateError) {
      logger.error('Error updating member role:', updateError)
      return errorResponse("Failed to update member role", 500)
    }

    return jsonResponse({ member: updatedMember })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error", 500)
  }
}

/**
 * DELETE /api/organizations/[id]/members/[memberId]
 * Remove a member's organization-level role
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const { id: organizationId, memberId } = await params
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    // Check if current user has permission (owner or admin)
    const { data: currentUserMember } = await serviceClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (!currentUserMember || !['owner', 'admin'].includes(currentUserMember.role)) {
      return errorResponse("You don't have permission to remove members", 403)
    }

    // Get target member's role
    const { data: targetMember } = await serviceClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", memberId)
      .maybeSingle()

    if (!targetMember) {
      return errorResponse("Member not found", 404)
    }

    // Can't remove yourself
    if (memberId === user.id) {
      return errorResponse("You cannot remove yourself. Transfer ownership first if you're the owner.", 400)
    }

    // Only owners can remove other owners
    if (targetMember.role === 'owner' && currentUserMember.role !== 'owner') {
      return errorResponse("Only owners can remove other owners", 403)
    }

    // Can't remove the last owner
    if (targetMember.role === 'owner') {
      const { count } = await serviceClient
        .from("organization_members")
        .select("id", { count: 'exact', head: true })
        .eq("organization_id", organizationId)
        .eq("role", "owner")

      if (count === 1) {
        return errorResponse("Cannot remove the last owner. Transfer ownership first.", 400)
      }
    }

    // Remove the member
    const { error: deleteError } = await serviceClient
      .from("organization_members")
      .delete()
      .eq("organization_id", organizationId)
      .eq("user_id", memberId)

    if (deleteError) {
      logger.error('Error removing member:', deleteError)
      return errorResponse("Failed to remove member", 500)
    }

    return jsonResponse({ success: true })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error", 500)
  }
}
