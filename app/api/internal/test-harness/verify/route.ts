/**
 * Webhook Test Harness — Verification API
 *
 * Internal-only endpoint used by the webhook test runner to verify
 * that a test webhook was received, matched, and executed.
 *
 * Queries using testRunId as the canonical correlation key:
 *   1. webhook_events (request_id) — receipt proof
 *   2. workflow_execution_sessions (execution_context JSONB) — match + execution proof
 *
 * Security: Guarded by X-Internal-Key header.
 * This is a harness-only surface — not a general introspection API.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

export async function GET(request: NextRequest) {
  // Guard: require internal API key
  const internalKey = process.env.INTERNAL_API_KEY
  const providedKey = request.headers.get('x-internal-key')

  if (!internalKey) {
    return errorResponse('INTERNAL_API_KEY not configured', 500)
  }

  if (providedKey !== internalKey) {
    return errorResponse('Unauthorized', 401)
  }

  // Get testRunId from query params
  const testRunId = request.nextUrl.searchParams.get('testRunId')
  if (!testRunId) {
    return errorResponse('Missing testRunId query parameter', 400)
  }

  const supabase = getSupabase()

  // Query both layers in parallel
  const [receiptResult, executionResult] = await Promise.all([
    // Layer 1: Receipt — webhook_events by request_id
    supabase
      .from('webhook_events')
      .select('id, provider, request_id, event_type, status, created_at')
      .eq('request_id', testRunId)
      .order('created_at', { ascending: true }),

    // Layer 2 + 3: Match + Execution — workflow_execution_sessions
    supabase
      .from('workflow_execution_sessions')
      .select('id, workflow_id, status, session_type, created_at, execution_context')
      .or(`execution_context.cs.{"webhookEvent":{"metadata":{"requestId":"${testRunId}"}}},execution_context.cs.{"metadata":{"requestId":"${testRunId}"}}`),
  ])

  // Parse receipt results
  const events = receiptResult.data || []
  const hasReceipt = events.length > 0

  // Parse execution results
  const executionSessions = (executionResult.data || []).map((session) => ({
    sessionId: session.id,
    workflowId: session.workflow_id,
    status: session.status,
    sessionType: session.session_type,
    createdAt: session.created_at,
  }))

  // Match count = number of execution sessions created for this testRunId
  const workflowsTriggered = executionSessions.length

  // Build matched workflows list
  const matchedWorkflows = executionSessions.map((s) => ({
    workflowId: s.workflowId,
    sessionType: s.sessionType,
  }))

  return jsonResponse({
    receipt: {
      received: hasReceipt,
      webhookEventId: events[0]?.id ?? null,
      eventCount: events.length,
    },
    match: {
      workflowsTriggered,
      processingStatus: hasReceipt ? 'processed' : null,
      matchedWorkflows,
    },
    execution: {
      sessions: executionSessions,
    },
  })
}
