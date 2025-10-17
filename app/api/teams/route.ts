import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from "@/lib/utils/api-response"

export const dynamic = 'force-dynamic'

// GET - List user's teams
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    // Get organization_id from query params (optional)
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organization_id')

    // Build query
    let query = supabase
      .from('teams')
      .select(`
        *,
        team_members!inner(
          role,
          joined_at
        )
      `)
      .eq('team_members.user_id', user.id)

    // Filter by organization if specified
    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }

    const { data: teams, error } = await query.order('created_at', { ascending: false })

    if (error) throw error

    return jsonResponse({ teams: teams || [] })
  } catch (error: any) {
    console.error('Error fetching teams:', error)
    return errorResponse(error.message || "Failed to fetch teams", 500)
  }
}

// POST - Create a new team
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const body = await request.json()
    const { name, description, organization_id } = body

    if (!name || name.trim().length === 0) {
      return errorResponse("Team name is required", 400)
    }

    if (!organization_id) {
      return errorResponse("Organization ID is required", 400)
    }

    // Verify user belongs to the organization
    const { data: membership, error: membershipError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organization_id)
      .eq('user_id', user.id)
      .single()

    if (membershipError || !membership) {
      return errorResponse("You don't have access to this organization", 403)
    }

    // Create the team
    const { data: team, error: createError } = await supabase
      .from('teams')
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        organization_id,
        created_by: user.id,
      })
      .select()
      .single()

    if (createError) throw createError

    // The trigger will automatically add the creator as owner
    // Fetch the complete team with member info
    const { data: completeTeam, error: fetchError } = await supabase
      .from('teams')
      .select(`
        *,
        team_members(
          id,
          role,
          joined_at,
          user_id
        )
      `)
      .eq('id', team.id)
      .single()

    if (fetchError) throw fetchError

    return jsonResponse({ team: completeTeam }, 201)
  } catch (error: any) {
    console.error('Error creating team:', error)
    return errorResponse(error.message || "Failed to create team", 500)
  }
}
