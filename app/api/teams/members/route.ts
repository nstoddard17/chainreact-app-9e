import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from "@/lib/utils/api-response"
import { logger } from "@/lib/utils/logger"

export const dynamic = 'force-dynamic'

// GET - List team members
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    // Get user's profile to find their organization
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!profile?.organization_id) {
      return jsonResponse({ members: [] })
    }

    // Get all members of the organization
    const { data: members, error } = await supabase
      .from('user_profiles')
      .select(`
        user_id,
        username,
        email,
        role,
        created_at,
        updated_at
      `)
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: false })

    if (error) throw error

    return jsonResponse({ members: members || [] })
  } catch (error: any) {
    logger.error('[Team Members API] Error fetching team members:', { error })
    return errorResponse(error.message || "Failed to fetch team members", 500)
  }
}

// POST - Invite a new team member
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const body = await request.json()
    const { email, role = 'member' } = body

    if (!email) {
      return errorResponse("Email is required", 400)
    }

    // Get user's profile to find their organization
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .single()

    if (!profile?.organization_id) {
      return errorResponse("You are not part of an organization", 403)
    }

    // Check if user has permission to invite (must be owner or admin)
    if (!['owner', 'admin'].includes(profile.role)) {
      return errorResponse("You don't have permission to invite members", 403)
    }

    // Create invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('team_invitations')
      .insert({
        organization_id: profile.organization_id,
        email,
        role,
        invited_by: user.id,
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      })
      .select()
      .single()

    if (inviteError) throw inviteError

    // TODO: Send invitation email

    return jsonResponse({ invitation }, 201)
  } catch (error: any) {
    logger.error('[Team Members API] Error inviting team member:', { error })
    return errorResponse(error.message || "Failed to invite team member", 500)
  }
}

// DELETE - Remove a team member
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const { searchParams } = new URL(request.url)
    const memberUserId = searchParams.get('userId')

    if (!memberUserId) {
      return errorResponse("User ID is required", 400)
    }

    // Get user's profile to check permissions
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .single()

    if (!profile?.organization_id) {
      return errorResponse("You are not part of an organization", 403)
    }

    // Check if user has permission (must be owner or admin)
    if (!['owner', 'admin'].includes(profile.role)) {
      return errorResponse("You don't have permission to remove members", 403)
    }

    // Can't remove yourself
    if (memberUserId === user.id) {
      return errorResponse("You cannot remove yourself from the team", 400)
    }

    // Remove user from organization
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ organization_id: null })
      .eq('user_id', memberUserId)
      .eq('organization_id', profile.organization_id)

    if (updateError) throw updateError

    return jsonResponse({ success: true })
  } catch (error: any) {
    logger.error('[Team Members API] Error removing team member:', { error })
    return errorResponse(error.message || "Failed to remove team member", 500)
  }
}
