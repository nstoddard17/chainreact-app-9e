import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

interface ChatMessage {
  id?: string
  flowId: string
  userId: string
  role: 'user' | 'assistant' | 'status'
  text: string
  subtext?: string
  createdAt?: string
  meta?: Record<string, any>
  sequence?: number
}

const mapMessageRow = (row: any) => ({
  id: row.id,
  flowId: row.flow_id,
  role: row.role,
  text: row.content ?? '',
  subtext: row.metadata?.subtext ?? undefined,
  meta: row.metadata ?? {},
  createdAt: row.created_at,
  sequence: row.sequence ?? undefined,
})

/**
 * GET /api/workflows/[id]/chat
 * Fetch chat history for a workflow
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: flowId } = await context.params
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const rpcPayload = {
      p_flow_id: flowId,
      p_limit: limit,
      p_offset: offset,
      p_user_id: user.id
    }

    let { data, error } = await supabase.rpc('get_agent_chat_history', rpcPayload)

    if (error?.code === 'PGRST202') {
      // Fallback for older function signature without p_user_id
      const fallbackPayload = {
        p_flow_id: flowId,
        p_limit: limit,
        p_offset: offset
      }
      const fallback = await supabase.rpc('get_agent_chat_history', fallbackPayload)
      data = fallback.data
      error = fallback.error
    }

    if (error) {
      logger.error('Failed to fetch chat history', { error, flowId })
      return NextResponse.json({ error: 'Failed to fetch chat history' }, { status: 500 })
    }

    const messages = (data || []).map(mapMessageRow)

    return NextResponse.json({ messages })
  } catch (error: any) {
    logger.error('Chat history fetch error', { error })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/workflows/[id]/chat
 * Add a message to chat history
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

    // Note: No session check here - RLS policies will enforce auth at database level

    const { id: flowId } = await context.params
    const body = await request.json()
    const { role, text, subtext, meta } = body as Partial<ChatMessage>

    if (!role || !text) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!['user', 'assistant', 'status'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    // Insert message (table uses 'content' and 'metadata' column names)
    // RLS policies will enforce auth
    const metadata = {
      ...(meta ?? {}),
      ...(subtext !== undefined ? { subtext } : {})
    }

    const { data, error } = await supabase
      .from('agent_chat_messages')
      .insert({
        flow_id: flowId,
        role,
        content: text,
        metadata
      })
      .select()
      .single()

    if (error) {
      logger.error('Failed to insert chat message', { error, flowId })
      return NextResponse.json({ error: 'Failed to save message' }, { status: 500 })
    }

    return NextResponse.json({ message: mapMessageRow(data) })
  } catch (error: any) {
    logger.error('Chat message insert error', { error })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PATCH /api/workflows/[id]/chat
 * Update a status message (for in-place updates)
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

    // Note: No session check here - RLS policies will enforce auth at database level

    const { id: flowId } = await context.params
    const body = await request.json()
    const { messageId, text, subtext, meta } = body

    if (!messageId) {
      return NextResponse.json({ error: 'Missing messageId' }, { status: 400 })
    }

    // Update message (RLS will enforce auth)
    const updates: Record<string, any> = {}
    if (text !== undefined) {
      updates.content = text
    }

    if (meta !== undefined || subtext !== undefined) {
      updates.metadata = {
        ...(meta ?? {}),
        ...(subtext !== undefined ? { subtext } : {}),
      }
    }

    const { data, error } = await supabase
      .from('agent_chat_messages')
      .update(updates)
      .eq('id', messageId)
      .eq('flow_id', flowId)
      .select()
      .single()

    if (error) {
      logger.error('Failed to update chat message', { error, messageId })
      return NextResponse.json({ error: 'Failed to update message' }, { status: 500 })
    }

    return NextResponse.json({ message: mapMessageRow(data) })
  } catch (error: any) {
    logger.error('Chat message update error', { error })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
