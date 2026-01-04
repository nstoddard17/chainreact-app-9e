import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { errorResponse } from '@/lib/utils/api-response'

const DEFAULT_TIMEOUT_MS = 60000
const POLL_INTERVAL_MS = 1000
const PING_INTERVAL_MS = 10000

type TriggerStreamEvent =
  | { type: 'ready'; sessionId: string; status: string; expiresAt?: string; timestamp: number }
  | { type: 'trigger_received'; sessionId: string; data: any; timestamp: number }
  | { type: 'executing'; sessionId: string; executionId: string; timestamp: number }
  | { type: 'timeout'; sessionId: string; timestamp: number }
  | { type: 'ended'; sessionId: string; status: string; timestamp: number }
  | { type: 'error'; sessionId: string; message: string; timestamp: number }
  | { type: 'ping'; sessionId: string; timestamp: number }

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseRouteHandlerClient()
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return errorResponse('Not authenticated', 401)
  }

  const url = new URL(request.url)
  const sessionId = url.searchParams.get('sessionId')
  const workflowId = url.searchParams.get('workflowId')
  const timeoutMs = Number(url.searchParams.get('timeoutMs') || DEFAULT_TIMEOUT_MS)

  if (!sessionId) {
    return errorResponse('Missing sessionId', 400)
  }

  const { data: session } = await admin
    .from('workflow_test_sessions')
    .select('id, workflow_id, user_id, status, expires_at')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session || session.user_id !== user.id || (workflowId && session.workflow_id !== workflowId)) {
    return errorResponse('Test session not found', 404)
  }

  const encoder = new TextEncoder()
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  const sendEvent = async (event: TriggerStreamEvent) => {
    const data = `data: ${JSON.stringify(event)}\n\n`
    await writer.write(encoder.encode(data))
  }

  const startTime = Date.now()
  let lastPingAt = 0

  const pollLoop = async () => {
    try {
      await sendEvent({
        type: 'ready',
        sessionId,
        status: session.status,
        expiresAt: session.expires_at,
        timestamp: Date.now(),
      })

      while (Date.now() - startTime < timeoutMs) {
        if (request.signal.aborted) {
          break
        }

        const { data: current } = await admin
          .from('workflow_test_sessions')
          .select('status, trigger_data, execution_id, expires_at')
          .eq('id', sessionId)
          .maybeSingle()

        if (!current) {
          await sendEvent({
            type: 'error',
            sessionId,
            message: 'Test session not found',
            timestamp: Date.now(),
          })
          return
        }

        if (current.status === 'trigger_received' && current.trigger_data) {
          await sendEvent({
            type: 'trigger_received',
            sessionId,
            data: current.trigger_data,
            timestamp: Date.now(),
          })
          return
        }

        if (current.status === 'executing' && current.execution_id) {
          await sendEvent({
            type: 'executing',
            sessionId,
            executionId: current.execution_id,
            timestamp: Date.now(),
          })
        }

        const isExpired = current.expires_at && new Date(current.expires_at) <= new Date()
        if (isExpired) {
          await admin
            .from('workflow_test_sessions')
            .update({
              status: 'expired',
              ended_at: new Date().toISOString(),
            })
            .eq('id', sessionId)

          await sendEvent({
            type: 'timeout',
            sessionId,
            timestamp: Date.now(),
          })
          return
        }

        if (Date.now() - lastPingAt >= PING_INTERVAL_MS) {
          await sendEvent({ type: 'ping', sessionId, timestamp: Date.now() })
          lastPingAt = Date.now()
        }

        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
      }

      await admin
        .from('workflow_test_sessions')
        .update({
          status: 'expired',
          ended_at: new Date().toISOString(),
        })
        .eq('id', sessionId)

      await sendEvent({
        type: 'timeout',
        sessionId,
        timestamp: Date.now(),
      })
    } catch (error: any) {
      await sendEvent({
        type: 'error',
        sessionId,
        message: error?.message || 'Stream error',
        timestamp: Date.now(),
      })
    } finally {
      try {
        await writer.close()
      } catch {
        // ignore close errors
      }
    }
  }

  pollLoop()

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
