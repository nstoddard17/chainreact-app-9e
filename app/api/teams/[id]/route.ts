import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from "@/lib/utils/api-response"
import { logger } from "@/lib/utils/logger"

export const dynamic = 'force-dynamic'

// GET - Get team details with members
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      logger.error('[Teams API] Unauthorized - no user', { authError })
      return errorResponse("Unauthorized", 401)
    }

    const { id: teamId } = await params

    // Use service client to bypass RLS for membership check
    // This is safe because we're already authenticated and checking against the authenticated user's ID
    const serviceClient = await createSupabaseServiceClient()

    // First, verify user is a member of this team (bypass RLS to avoid circular policy issues)
    const { data: membership, error: membershipError } = await serviceClient
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .single()

    if (membershipError || !membership) {
      return errorResponse("Team not found", 404)
    }

    // Now fetch team details using the same service client (bypasses RLS to get billing fields)
    const { data: team, error } = await serviceClient
      .from('teams')
      .select('*')
      .eq('id', teamId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return errorResponse("Team not found", 404)
      }
      throw error
    }

    // Get member count (use service client to ensure we get accurate count)
    const { count } = await serviceClient
      .from('team_members')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)

    // For standalone teams, inherit billing from owner's profile
    // For org teams, they'll inherit from the organization
    let billingInfo = null
    if (!team.organization_id && team.created_by) {
      // Standalone team - fetch owner's billing info
      const { data: ownerProfile } = await serviceClient
        .from('user_profiles')
        .select('plan, credits')
        .eq('id', team.created_by)
        .single()

      if (ownerProfile) {
        billingInfo = {
          plan: ownerProfile.plan || 'free',
          credits: ownerProfile.credits || 0,
          billing_source: 'owner' // Indicates billing is inherited from owner
        }
      }
    } else if (team.organization_id) {
      // Organization team - indicate billing comes from org
      billingInfo = {
        billing_source: 'organization' // Frontend should fetch org billing
      }
    }

    return jsonResponse({
      ...team,
      member_count: count || 0,
      user_role: membership.role,
      billing: billingInfo
    })
  } catch (error: any) {
    logger.error('[Teams API] Error fetching team:', { error })
    return errorResponse(error.message || "Failed to fetch team", 500)
  }
}

// PUT - Update team
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const { id: teamId } = await params
    const body = await request.json()
    const { name, description } = body

    if (!name || name.trim().length === 0) {
      return errorResponse("Team name is required", 400)
    }

    // Update the team
    const { data: team, error: updateError } = await supabase
      .from('teams')
      .update({
        name: name.trim(),
        description: description?.trim() || null,
      })
      .eq('id', teamId)
      .select()
      .single()

    if (updateError) {
      if (updateError.code === 'PGRST116') {
        return errorResponse("Team not found", 404)
      }
      throw updateError
    }

    return jsonResponse({ team })
  } catch (error: any) {
    logger.error('[Teams API] Error updating team:', { error })
    return errorResponse(error.message || "Failed to update team", 500)
  }
}

// DELETE - Delete team
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const { id: teamId } = await params

    // Delete the team (cascade will handle members and workflow shares)
    const { error: deleteError } = await supabase
      .from('teams')
      .delete()
      .eq('id', teamId)

    if (deleteError) {
      if (deleteError.code === 'PGRST116') {
        return errorResponse("Team not found", 404)
      }
      throw deleteError
    }

    return jsonResponse({ success: true })
  } catch (error: any) {
    logger.error('[Teams API] Error deleting team:', { error })
    return errorResponse(error.message || "Failed to delete team", 500)
  }
}
