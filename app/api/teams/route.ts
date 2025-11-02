import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from "@/lib/utils/api-response"
import { logger } from "@/lib/utils/logger"

export const dynamic = 'force-dynamic'

// GET - List user's teams
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      logger.error('[Teams API] Auth error:', authError)
      return errorResponse("Unauthorized", 401)
    }

    logger.debug('[Teams API] Fetching teams for user:', { userId: user.id })

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
      logger.debug('[Teams API] Filtering by organization:', organizationId)
      query = query.eq('organization_id', organizationId)
    }

    const { data: teams, error } = await query.order('created_at', { ascending: false })

    if (error) {
      logger.error('[Teams API] Supabase query error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      })
      throw error
    }

    logger.debug('[Teams API] Successfully fetched teams:', { count: teams?.length || 0 })
    return jsonResponse({ teams: teams || [] })
  } catch (error: any) {
    logger.error('[Teams API] Error fetching teams:', {
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
      code: error?.code,
      stack: error?.stack
    })
    return errorResponse(error.message || "Failed to fetch teams", 500)
  }
}

// POST - Create a new team
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const body = await request.json()
    const { name, description, organization_id } = body

    if (!name || name.trim().length === 0) {
      return errorResponse("Team name is required", 400)
    }

    // Generate slug from name
    const baseSlug = name.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

    // Add random suffix to ensure uniqueness
    const randomSuffix = Math.random().toString(36).substring(2, 8)
    const slug = `${baseSlug}-${randomSuffix}`

    // If organization_id is provided, verify user belongs to the organization
    if (organization_id) {
      const { data: membership, error: membershipError } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', organization_id)
        .eq('user_id', user.id)
        .single()

      if (membershipError || !membership) {
        return errorResponse("You don't have access to this organization", 403)
      }
    }

    // Create the team (can be standalone if no organization_id)
    // Using service role client to bypass RLS - security is enforced at API layer
    const { createSupabaseServiceClient } = await import("@/utils/supabase/server")
    const serviceSupabase = await createSupabaseServiceClient()

    const { data: team, error: createError } = await serviceSupabase
      .from('teams')
      .insert({
        name: name.trim(),
        slug: slug,
        description: description?.trim() || null,
        organization_id: organization_id || null,
        created_by: user.id,
      })
      .select()
      .single()

    if (createError) throw createError

    // Add the creator as owner in team_members
    const { error: memberError } = await serviceSupabase
      .from('team_members')
      .insert({
        team_id: team.id,
        user_id: user.id,
        role: 'owner'
      })

    if (memberError) {
      logger.error("Error adding team creator to team_members:", memberError)
      // Clean up the team if we can't add the member
      await serviceSupabase.from('teams').delete().eq('id', team.id)
      throw new Error("Failed to add team creator as member")
    }

    // Return the created team with member_count
    return NextResponse.json({
      team: {
        ...team,
        member_count: 1,
        user_role: 'owner'
      }
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating team:', error)
    return errorResponse(error.message || "Failed to create team", 500)
  }
}
