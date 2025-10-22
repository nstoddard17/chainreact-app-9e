import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from "@/lib/utils/api-response"

export const dynamic = 'force-dynamic'

// GET - Get team details with members
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const teamId = params.id

    // Get team with members
    const { data: team, error } = await supabase
      .from('teams')
      .select(`
        *,
        team_members(
          id,
          role,
          joined_at,
          user_id,
          user:user_profiles(
            user_id,
            username,
            email
          )
        )
      `)
      .eq('id', teamId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return errorResponse("Team not found", 404)
      }
      throw error
    }

    return jsonResponse({ team })
  } catch (error: any) {
    console.error('Error fetching team:', error)
    return errorResponse(error.message || "Failed to fetch team", 500)
  }
}

// PUT - Update team
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const teamId = params.id
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
    console.error('Error updating team:', error)
    return errorResponse(error.message || "Failed to update team", 500)
  }
}

// DELETE - Delete team
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const teamId = params.id

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
    console.error('Error deleting team:', error)
    return errorResponse(error.message || "Failed to delete team", 500)
  }
}
