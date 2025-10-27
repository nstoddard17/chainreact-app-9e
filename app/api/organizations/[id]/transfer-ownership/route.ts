import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'

/**
 * POST /api/organizations/[id]/transfer-ownership
 * Transfer organization ownership to another member
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const orgId = params.id
    const body = await request.json()
    const { new_owner_id } = body

    if (!new_owner_id) {
      return errorResponse("new_owner_id is required", 400)
    }

    // Check if current user is the owner
    const { data: currentUserMember } = await serviceClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
      .single()

    if (!currentUserMember || currentUserMember.role !== 'owner') {
      return errorResponse("Only the organization owner can transfer ownership", 403)
    }

    // Check if new owner is already a member
    const { data: newOwnerMember } = await serviceClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", orgId)
      .eq("user_id", new_owner_id)
      .maybeSingle()

    if (!newOwnerMember) {
      return errorResponse("New owner must be an existing organization member", 400)
    }

    if (newOwnerMember.role === 'owner') {
      return errorResponse("User is already the owner", 400)
    }

    // Can't transfer to yourself
    if (new_owner_id === user.id) {
      return errorResponse("You are already the owner", 400)
    }

    // Perform the transfer in a transaction-like manner
    // 1. Change current owner to admin
    const { error: demoteError } = await serviceClient
      .from("organization_members")
      .update({ role: 'admin' })
      .eq("organization_id", orgId)
      .eq("user_id", user.id)

    if (demoteError) {
      logger.error('Error demoting current owner:', demoteError)
      return errorResponse("Failed to transfer ownership", 500)
    }

    // 2. Change new owner to owner role
    const { error: promoteError } = await serviceClient
      .from("organization_members")
      .update({ role: 'owner' })
      .eq("organization_id", orgId)
      .eq("user_id", new_owner_id)

    if (promoteError) {
      logger.error('Error promoting new owner:', promoteError)
      // Try to rollback the demotion
      await serviceClient
        .from("organization_members")
        .update({ role: 'owner' })
        .eq("organization_id", orgId)
        .eq("user_id", user.id)

      return errorResponse("Failed to transfer ownership", 500)
    }

    // 3. Update the organization owner_id (for backward compatibility)
    const { error: updateOrgError } = await serviceClient
      .from("organizations")
      .update({ owner_id: new_owner_id })
      .eq("id", orgId)

    if (updateOrgError) {
      logger.error('Error updating organization owner_id:', updateOrgError)
      // This is not critical, just log it
    }

    return jsonResponse({
      success: true,
      message: "Ownership transferred successfully",
      new_owner_id,
      old_owner_id: user.id
    })
  } catch (error) {
    logger.error('Unexpected error:', error)
    return errorResponse("Internal server error", 500)
  }
}
