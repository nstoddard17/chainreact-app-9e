import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'

/**
 * GET /api/billing/task-history
 *
 * Returns paginated billing events for the authenticated user.
 * All data comes from persisted task_billing_events — no recomputation.
 *
 * Query params:
 *   cursor   - ISO timestamp for cursor-based pagination
 *   limit    - max results (default 25, max 100)
 *   source   - filter by source (execution, retry, ai_creation, reset)
 *   workflow_id - filter by workflow
 */
export async function GET(request: Request) {
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Not authenticated", 401)
    }

    const url = new URL(request.url)
    const cursor = url.searchParams.get('cursor')
    const limitParam = Math.min(parseInt(url.searchParams.get('limit') || '25', 10), 100)
    const sourceFilter = url.searchParams.get('source')
    const workflowFilter = url.searchParams.get('workflow_id')

    let query = supabase
      .from('task_billing_events')
      .select('id, user_id, event_type, amount, balance_after, tasks_limit_snapshot, source, execution_id, workflow_id, node_breakdown, metadata, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limitParam)

    if (cursor) {
      query = query.lt('created_at', cursor)
    }

    if (sourceFilter) {
      query = query.eq('source', sourceFilter)
    }

    if (workflowFilter) {
      query = query.eq('workflow_id', workflowFilter)
    }

    const { data: events, error: queryError } = await query

    if (queryError) {
      logger.error('[TaskHistory] Query failed', { error: queryError.message })
      return errorResponse("Failed to fetch task history", 500)
    }

    // Collect workflow IDs to batch-fetch names
    const workflowIds = [...new Set(
      (events || [])
        .map((e: any) => e.workflow_id)
        .filter(Boolean)
    )]

    let workflowNames: Record<string, string> = {}
    if (workflowIds.length > 0) {
      const { data: workflows } = await supabase
        .from('workflows')
        .select('id, name')
        .in('id', workflowIds)

      if (workflows) {
        workflowNames = Object.fromEntries(
          workflows.map((w: any) => [w.id, w.name])
        )
      }
    }

    // Normalize response shape
    const normalized = (events || []).map((event: any) => {
      const meta = event.metadata || {}
      const isRetry = meta.is_retry === true || event.source === 'retry'

      return {
        id: event.id,
        createdAt: event.created_at,
        eventType: event.event_type,
        source: event.source,
        tasksCharged: event.amount,
        balanceAfter: event.balance_after,
        tasksLimit: event.tasks_limit_snapshot,
        workflowId: event.workflow_id,
        workflowName: event.workflow_id ? (workflowNames[event.workflow_id] || null) : null,
        executionId: event.execution_id,
        isRetry,
        originalExecutionId: isRetry ? (meta.original_execution_id || null) : null,
        nodeBreakdown: event.node_breakdown,
        metadata: {
          flatCost: meta.flat_cost ?? null,
          chargedCost: meta.charged_cost ?? null,
          loopExpansionEnabled: meta.loop_expansion_enabled ?? null,
          loopDetails: meta.loop_details ?? [],
          mode: meta.mode ?? null,
        },
      }
    })

    const nextCursor = normalized.length === limitParam
      ? normalized[normalized.length - 1].createdAt
      : null

    return jsonResponse({
      events: normalized,
      nextCursor,
      hasMore: nextCursor !== null,
    })
  } catch (error: any) {
    logger.error('[TaskHistory] Unexpected error', { error: error.message })
    return errorResponse("Failed to fetch task history", 500)
  }
}
