import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

// Use service role client to bypass RLS for chat operations
const getServiceClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY!
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

interface ChatMessage {
  id?: string
  flowId: string
  userId?: string
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
    const supabase = getServiceClient()

    const { id: flowId } = await context.params
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Fetch chat history using service role (bypasses RLS)
    const { data, error } = await supabase
      .rpc('get_agent_chat_history', {
        p_flow_id: flowId,
        p_limit: limit,
        p_offset: offset
      })

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
    const supabase = getServiceClient()

    const { id: flowId } = await context.params

    let body
    try {
      body = await request.json()
    } catch (jsonError: any) {
      // Catch JSON parsing errors (e.g., truncated payloads)
      logger.error('Failed to parse request JSON', {
        error: jsonError.message,
        position: jsonError.message.match(/position (\d+)/)?.[1],
        flowId
      })
      return NextResponse.json({
        error: 'Invalid JSON in request body. The payload may be too large or malformed.',
        details: jsonError.message
      }, { status: 400 })
    }

    const { role, text, subtext, meta } = body as Partial<ChatMessage>

    if (!role || !text?.trim()) {
      return NextResponse.json({ error: 'Message content cannot be empty' }, { status: 400 })
    }

    if (!['user', 'assistant', 'status'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    // Insert message using service role (bypasses RLS)
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
    const supabase = getServiceClient()

    const { id: flowId } = await context.params
    const body = await request.json()
    const { messageId, text, subtext, meta } = body

    if (!messageId) {
      return NextResponse.json({ error: 'Missing messageId' }, { status: 400 })
    }

    // Reject empty content updates
    if (text !== undefined && !text?.trim()) {
      return NextResponse.json({ error: 'Message content cannot be empty' }, { status: 400 })
    }

    // Update message using service role (bypasses RLS)
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
