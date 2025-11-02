import { NextRequest } from "next/server"
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse, successResponse } from "@/lib/utils/api-response"
import { logger } from "@/lib/utils/logger"

export const dynamic = 'force-dynamic'

// POST - Transfer team ownership
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: teamId } = await params

  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const body = await request.json()
    const { new_owner_id } = body

    if (!new_owner_id) {
      return errorResponse("new_owner_id is required", 400)
    }

    // Use service client for permission checks
    const serviceClient = await createSupabaseServiceClient()

    // Check if current user is the owner
    const { data: currentMember } = await serviceClient
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .single()

    if (!currentMember || currentMember.role !== 'owner') {
      return errorResponse("Only the team owner can transfer ownership", 403)
    }

    // Check if new owner is a member of the team
    const { data: newOwnerMember } = await serviceClient
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", new_owner_id)
      .single()

    if (!newOwnerMember) {
      return errorResponse("New owner must be a member of the team", 400)
    }

    // Perform the transfer
    // 1. Update new owner to 'owner' role
    const { error: updateNewOwnerError } = await serviceClient
      .from("team_members")
      .update({ role: 'owner' })
      .eq("team_id", teamId)
      .eq("user_id", new_owner_id)

    if (updateNewOwnerError) {
      logger.error('[Transfer Ownership] Error updating new owner:', updateNewOwnerError)
      throw updateNewOwnerError
    }

    // 2. Downgrade current owner to 'admin'
    const { error: updateCurrentOwnerError } = await serviceClient
      .from("team_members")
      .update({ role: 'admin' })
      .eq("team_id", teamId)
      .eq("user_id", user.id)

    if (updateCurrentOwnerError) {
      logger.error('[Transfer Ownership] Error downgrading current owner:', updateCurrentOwnerError)
      throw updateCurrentOwnerError
    }

    // 3. Update team.created_by to reflect new owner
    const { error: updateTeamError } = await serviceClient
      .from("teams")
      .update({ created_by: new_owner_id })
      .eq("id", teamId)

    if (updateTeamError) {
      logger.error('[Transfer Ownership] Error updating team creator:', updateTeamError)
      throw updateTeamError
    }

    // 4. Log activity
    const { data: newOwnerProfile } = await serviceClient
      .from("user_profiles")
      .select("email, full_name")
      .eq("id", new_owner_id)
      .single()

    await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/teams/${teamId}/activity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('cookie') || ''
      },
      body: JSON.stringify({
        activity_type: 'member_role_changed',
        description: `Ownership transferred to ${newOwnerProfile?.full_name || newOwnerProfile?.email || 'new owner'}`,
        metadata: {
          old_owner_id: user.id,
          new_owner_id: new_owner_id,
          old_role: 'owner',
          new_role: 'owner'
        }
      })
    })

    return jsonResponse({
      message: "Ownership transferred successfully",
      new_owner_id: new_owner_id
    })
  } catch (error: any) {
    logger.error('[Transfer Ownership] Error:', {
      message: error?.message,
      stack: error?.stack
    })
    return errorResponse(error.message || "Failed to transfer ownership", 500)
  }
}
