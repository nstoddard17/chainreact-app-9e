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
 * Fetches workflows for the current user based on workspace context.
 *
 * Query Parameters:
 * - workspace_type: 'personal' | 'team' | 'organization' (default: 'personal')
 * - workspace_id: UUID of team or organization (required for team/org)
 *
 * Returns workflows that the user has permission to access.
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

    // Parse workspace context from query parameters
    const { searchParams } = new URL(request.url)
    const workspaceType = searchParams.get('workspace_type') || 'personal'
    const workspaceId = searchParams.get('workspace_id')

    logger.debug('[API /api/workflows] GET request', {
      workspaceType,
      workspaceId,
      userId: user.id
    })

    // Validate workspace parameters
    if ((workspaceType === 'team' || workspaceType === 'organization') && !workspaceId) {
      return errorResponse('workspace_id is required for team/organization context', 400)
    }

    if (!['personal', 'team', 'organization'].includes(workspaceType)) {
      return errorResponse('Invalid workspace_type. Must be personal, team, or organization', 400)
    }

    // Use service role client to query workflows with permissions
    const supabaseService = await createSupabaseServiceClient()

    let query = supabaseService
      .from("workflows")
      .select(`
        *,
        permissions:workflow_permissions(permission, user_id)
      `)

    // Filter by workspace context
    if (workspaceType === 'personal') {
      query = query
        .eq('workspace_type', 'personal')
        .eq('user_id', user.id)
    } else if (workspaceType === 'team') {
      query = query
        .eq('workspace_type', 'team')
        .eq('workspace_id', workspaceId)
    } else if (workspaceType === 'organization') {
      query = query
        .eq('workspace_type', 'organization')
        .eq('workspace_id', workspaceId)
    }

    query = query.order("updated_at", { ascending: false })

    const { data: workflows, error } = await query

    logger.debug('[API /api/workflows] Query result', {
      workspaceType,
      count: workflows?.length || 0,
      error
    })

    if (error) {
      logger.error('[API /api/workflows] Database error:', error)
      return errorResponse(error.message , 500)
    }

    // Process workflows and add user_permission field
    const processedWorkflows = workflows?.map((workflow: any) => {
      const { permissions, ...workflowData } = workflow

      // permissions is an array from the LEFT JOIN
      // Find the permission for the current user
      const userPermission = Array.isArray(permissions)
        ? permissions.find((p: any) => p.user_id === user.id)?.permission
        : permissions?.permission

      return {
        ...workflowData,
        user_permission: userPermission || null
      }
    })

    return jsonResponse(processedWorkflows)
  } catch (error: any) {
    logger.error('[API /api/workflows] Exception:', error)
    return errorResponse("Internal server error" , 500)
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
      workspace_id = null
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
        nodes: [],
        connections: [],
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
