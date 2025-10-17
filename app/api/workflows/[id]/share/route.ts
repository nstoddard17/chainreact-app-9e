import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from "@/lib/utils/api-response"

export const dynamic = 'force-dynamic'

// GET - Get teams workflow is shared with
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createSupabaseServerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const workflowId = params.id

    // Get teams this workflow is shared with
    const { data: shares, error } = await supabase
      .from('workflow_teams')
      .select(`
        *,
        team:teams(
          id,
          name,
          description
        )
      `)
      .eq('workflow_id', workflowId)
      .order('shared_at', { ascending: false })

    if (error) throw error

    return jsonResponse({ shares: shares || [] })
  } catch (error: any) {
    console.error('Error fetching workflow shares:', error)
    return errorResponse(error.message || "Failed to fetch workflow shares", 500)
  }
}

// POST - Share workflow to teams
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createSupabaseServerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const workflowId = params.id
    const body = await request.json()
    const { teamIds } = body

    if (!Array.isArray(teamIds) || teamIds.length === 0) {
      return errorResponse("Team IDs are required", 400)
    }

    // Verify workflow ownership
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('id, user_id')
      .eq('id', workflowId)
      .eq('user_id', user.id)
      .single()

    if (workflowError || !workflow) {
      return errorResponse("Workflow not found or access denied", 404)
    }

    // Verify user belongs to all specified teams
    const { data: userTeams, error: teamsError } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .in('team_id', teamIds)

    if (teamsError) throw teamsError

    const userTeamIds = new Set(userTeams?.map(t => t.team_id) || [])
    const invalidTeamIds = teamIds.filter(id => !userTeamIds.has(id))

    if (invalidTeamIds.length > 0) {
      return errorResponse("You don't have access to some of the specified teams", 403)
    }

    // Share to teams (using upsert to handle duplicates)
    const shares = teamIds.map(teamId => ({
      workflow_id: workflowId,
      team_id: teamId,
      shared_by: user.id,
    }))

    const { data: createdShares, error: shareError } = await supabase
      .from('workflow_teams')
      .upsert(shares, {
        onConflict: 'workflow_id,team_id',
        ignoreDuplicates: false
      })
      .select(`
        *,
        team:teams(
          id,
          name,
          description
        )
      `)

    if (shareError) throw shareError

    return jsonResponse({ shares: createdShares || [] }, 201)
  } catch (error: any) {
    console.error('Error sharing workflow:', error)
    return errorResponse(error.message || "Failed to share workflow", 500)
  }
}

// DELETE - Unshare workflow from team
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createSupabaseServerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const workflowId = params.id
    const { searchParams } = new URL(request.url)
    const teamId = searchParams.get('teamId')

    if (!teamId) {
      return errorResponse("Team ID is required", 400)
    }

    // Delete the share
    const { error: deleteError } = await supabase
      .from('workflow_teams')
      .delete()
      .eq('workflow_id', workflowId)
      .eq('team_id', teamId)

    if (deleteError) throw deleteError

    return jsonResponse({ success: true })
  } catch (error: any) {
    console.error('Error unsharing workflow:', error)
    return errorResponse(error.message || "Failed to unshare workflow", 500)
  }
}
