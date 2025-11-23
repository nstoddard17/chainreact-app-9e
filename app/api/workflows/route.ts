import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/workflows
 *
 * Fetches ALL workflows the user has access to (unified view).
 * This includes:
 * - Personal workflows (user_id = current user)
 * - Team workflows (user is team member)
 * - Organization workflows (user is organization member)
 * - Shared workflows (via workflow_permissions)
 *
 * Query Parameters (OPTIONAL - for filtering):
 * - filter_context: 'personal' | 'team' | 'organization' (optional filter)
 * - workspace_id: UUID of team or organization (required if filter_context is team/org)
 *
 * Returns all workflows in a unified view, grouped by frontend.
 */
export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Not authenticated" , 401)
    }

    // Parse OPTIONAL filter parameters
    const { searchParams } = new URL(request.url)
    const filterContext = searchParams.get('filter_context') // OPTIONAL
    const workspaceId = searchParams.get('workspace_id')

    logger.debug('[API /api/workflows] GET request', {
      filterContext: filterContext || 'ALL (unified view)',
      workspaceId,
      userId: user.id
    })

    // Use service role client to query workflows
    const supabaseService = await createSupabaseServiceClient()

    let workflows: any[] = []

    // Apply OPTIONAL filter if provided
    if (filterContext && filterContext !== 'all') {
      let query = supabaseService
        .from("workflows")
        .select('*')

      if (filterContext === 'personal') {
        query = query
          .eq('workspace_type', 'personal')
          .eq('user_id', user.id)
      } else if (filterContext === 'team' && workspaceId) {
        query = query
          .eq('workspace_type', 'team')
          .eq('workspace_id', workspaceId)
      } else if (filterContext === 'organization' && workspaceId) {
        query = query
          .eq('workspace_type', 'organization')
          .eq('workspace_id', workspaceId)
      }

      query = query.order("updated_at", { ascending: false })
      const { data, error } = await query

      if (error) {
        logger.error('[API /api/workflows] Database error:', error)
        return errorResponse(error.message, 500)
      }

      workflows = data || []
    } else {
      // NO FILTER - Fetch ALL workflows user has access to
      // Fetch in parallel: personal, team, and organization workflows

      const queries = []

      // 1. Personal workflows
      queries.push(
        supabaseService
          .from("workflows")
          .select('*')
          .eq('workspace_type', 'personal')
          .eq('user_id', user.id)
      )

      // 2. Team workflows
      const { data: teamMemberships } = await supabaseService
        .from('team_members')
        .select('team_id')
        .eq('user_id', user.id)

      const teamIds = teamMemberships?.map(m => m.team_id) || []

      if (teamIds.length > 0) {
        queries.push(
          supabaseService
            .from("workflows")
            .select('*')
            .eq('workspace_type', 'team')
            .in('workspace_id', teamIds)
        )
      }

      // 3. Organization workflows
      const { data: orgMemberships } = await supabaseService
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)

      const orgIds = orgMemberships?.map(m => m.organization_id) || []

      if (orgIds.length > 0) {
        queries.push(
          supabaseService
            .from("workflows")
            .select('*')
            .eq('workspace_type', 'organization')
            .in('workspace_id', orgIds)
        )
      }

      // Execute all queries in parallel
      const results = await Promise.all(queries)

      // Combine results
      workflows = results.flatMap(result => result.data || [])

      // Sort by updated_at
      workflows.sort((a, b) => {
        const aTime = new Date(a.updated_at).getTime()
        const bTime = new Date(b.updated_at).getTime()
        return bTime - aTime // Descending
      })
    }

    const error = null

    logger.debug('[API /api/workflows] Query result', {
      filterContext: filterContext || 'ALL',
      count: workflows?.length || 0,
      error
    })

    if (error) {
      logger.error('[API /api/workflows] Database error:', error)
      return errorResponse(error.message , 500)
    }

    // Return workflows directly (permissions join removed due to missing foreign key)
    return successResponse({ data: workflows })
  } catch (error: any) {
    logger.error('[API /api/workflows] Exception:', error)
    return errorResponse(error.message || "Internal server error", 500)
  }
}

/**
 * POST /api/workflows
 *
 * Creates a new workflow with workspace context.
 *
 * Body Parameters:
 * - name: string (required)
 * - description: string
 * - workspace_type: 'personal' | 'team' | 'organization' (default: 'personal')
 * - workspace_id: UUID (required for team/org)
 * - folder_id: UUID (optional)
 * - status: string (default: 'draft')
 */
export async function POST(request: Request) {
  const cookieStore = await cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Not authenticated" , 401)
    }

    const body = await request.json()
    const {
      name,
      description,
      organization_id,
      status,
      folder_id,
      workspace_type = 'personal',
      workspace_id = null,
      nodes = [],
      connections = []
    } = body

    logger.debug('[API /api/workflows] POST request', {
      name,
      workspace_type,
      workspace_id,
      userId: user.id
    })

    // Validate workspace parameters
    if ((workspace_type === 'team' || workspace_type === 'organization') && !workspace_id) {
      return errorResponse('workspace_id is required for team/organization workflows', 400)
    }

    // If no folder_id is provided, use the user's default folder
    let targetFolderId = folder_id
    if (!targetFolderId) {
      const { data: defaultFolder } = await supabase
        .from("workflow_folders")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_default", true)
        .single()

      targetFolderId = defaultFolder?.id || null
    }

    // Insert workflow with workspace context
    const { data: workflow, error } = await supabase
      .from("workflows")
      .insert({
        name,
        description,
        organization_id: organization_id || null,
        folder_id: targetFolderId,
        user_id: user.id,
        workspace_type,
        workspace_id,
        created_by: user.id,
        last_modified_by: user.id,
        nodes: Array.isArray(nodes) ? nodes : [],
        connections: Array.isArray(connections) ? connections : [],
        status: status || "draft",
      })
      .select()
      .single()

    if (error) {
      logger.error('[API /api/workflows] Insert error:', error)
      return errorResponse(error.message , 500)
    }

    // Grant admin permission to the creator
    const { error: permissionError } = await supabase
      .from("workflow_permissions")
      .insert({
        workflow_id: workflow.id,
        user_id: user.id,
        permission: 'admin',
        granted_by: user.id
      })

    if (permissionError) {
      logger.error('[API /api/workflows] Permission grant error:', permissionError)
      // Don't fail the request, just log it
    }

    logger.debug('[API /api/workflows] Workflow created', {
      id: workflow.id,
      workspace_type,
      permission_granted: !permissionError
    })

    return successResponse({ workflow })
  } catch (error: any) {
    logger.error('[API /api/workflows] Exception:', error)
    return errorResponse("Internal server error" , 500)
  }
}
