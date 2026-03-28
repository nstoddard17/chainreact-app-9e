import { NextRequest } from 'next/server'
import { errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'
import type { AgentEvalEvent } from '@/lib/eval/agentEvalTypes'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse('Unauthorized', 401)
    }

    const body = await request.json()
    const events: AgentEvalEvent[] = body?.events

    if (!Array.isArray(events) || events.length === 0) {
      return errorResponse('events array required', 400)
    }

    if (events.length > 100) {
      return errorResponse('Max 100 events per batch', 400)
    }

    const supabaseAdmin = await createSupabaseServiceClient()

    // Map events to DB rows, enforcing user_id from auth
    const rows = events.map((e) => ({
      event_name: e.event_name,
      category: e.category,
      session_id: e.session_id,
      conversation_id: e.conversation_id,
      user_id: user.id,
      flow_id: e.flow_id || null,
      agent_version: e.agent_version,
      session_outcome: e.session_outcome || null,
      planner_path: e.planner_path || null,
      llm_model: e.llm_model || null,
      turn_number: e.turn_number ?? 0,
      prompt_type: e.prompt_type || null,
      time_since_last_turn_ms: e.time_since_last_turn_ms ?? null,
      metadata: e.metadata ?? {},
    }))

    const { error: insertError } = await supabaseAdmin
      .from('agent_eval_events' as any)
      .insert(rows)

    if (insertError) {
      logger.error('[AgentEval] Insert failed', { error: insertError.message })
      return errorResponse('Failed to store events', 500)
    }

    return successResponse({ inserted: rows.length })
  } catch (error: any) {
    logger.error('[AgentEval] Events route error', { error: error.message })
    return errorResponse('Internal server error', 500)
  }
}
