/**
 * Discord HITL Webhook Handler
 * Receives Discord messages and routes them to active HITL conversations
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'
import { processConversationMessage } from '@/lib/workflows/actions/hitl/conversation'
import { sendDiscordThreadMessage } from '@/lib/workflows/actions/hitl/discord'
import type { ConversationMessage } from '@/lib/workflows/actions/hitl/types'

/**
 * POST /api/webhooks/discord/hitl
 * Handles incoming Discord messages for HITL conversations
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json()

    logger.info('Discord HITL webhook received', {
      type: payload.t,
      channelId: payload.d?.channel_id
    })

    // Only process MESSAGE_CREATE events
    if (payload.t !== 'MESSAGE_CREATE') {
      return NextResponse.json({ ok: true, message: 'Not a message event' })
    }

    const message = payload.d

    // Ignore bot messages (prevent loops)
    if (message.author?.bot) {
      return NextResponse.json({ ok: true, message: 'Bot message ignored' })
    }

    const channelId = message.channel_id
    const content = message.content
    const authorId = message.author?.id
    const authorName = message.author?.username

    if (!channelId || !content) {
      return NextResponse.json({ ok: true, message: 'Missing required fields' })
    }

    // Find active HITL conversation for this channel
    const supabase = await createSupabaseServerClient()

    const { data: conversation, error } = await supabase
      .from('hitl_conversations')
      .select('*')
      .eq('channel_id', channelId)
      .eq('status', 'active')
      .single()

    if (error || !conversation) {
      // No active conversation in this channel - ignore
      return NextResponse.json({ ok: true, message: 'No active conversation' })
    }

    logger.info('Found active HITL conversation', {
      conversationId: conversation.id,
      executionId: conversation.execution_id,
      channelId
    })

    // Get the workflow execution to access resume_data
    const { data: execution, error: execError } = await supabase
      .from('workflow_executions')
      .select('*')
      .eq('id', conversation.execution_id)
      .single()

    if (execError || !execution || !execution.resume_data) {
      logger.error('Failed to find execution or resume data', { error: execError })
      return NextResponse.json({ error: 'Execution not found' }, { status: 404 })
    }

    const resumeData = execution.resume_data as any
    const hitlConfig = resumeData.hitl_config
    const contextData = resumeData.context_data

    // Add user message to conversation history
    const conversationHistory: ConversationMessage[] = conversation.conversation_history || []
    conversationHistory.push({
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    })

    // Process message through AI
    const { aiResponse, shouldContinue, extractedVariables, summary } =
      await processConversationMessage(
        content,
        conversationHistory,
        hitlConfig,
        contextData
      )

    // Add AI response to history
    conversationHistory.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date().toISOString()
    })

    // Send AI response back to Discord
    await sendDiscordThreadMessage(conversation.user_id, channelId, aiResponse)

    if (shouldContinue) {
      // User is ready to continue - finalize conversation and resume workflow
      logger.info('Continuation signal detected - resuming workflow', {
        conversationId: conversation.id,
        executionId: conversation.execution_id,
        extractedVariables
      })

      // Mark conversation as completed
      await supabase
        .from('hitl_conversations')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          conversation_history: conversationHistory,
          extracted_variables: extractedVariables
        })
        .eq('id', conversation.id)

      // Update execution status to running and pass extracted variables forward
      const outputData = {
        ...resumeData.input,
        hitlStatus: 'continued',
        conversationSummary: summary || 'User approved',
        messagesCount: conversationHistory.length,
        duration: Math.round(
          (new Date().getTime() - new Date(conversation.started_at).getTime()) / 1000
        ),
        extractedVariables: extractedVariables || {},
        conversationHistory
      }

      await supabase
        .from('workflow_executions')
        .update({
          status: 'running',
          paused_node_id: null,
          paused_at: null,
          resume_data: {
            ...resumeData,
            output: outputData
          }
        })
        .eq('id', conversation.execution_id)

      // Trigger workflow resume (this would need to be implemented in workflow engine)
      // For now, log that it needs to be picked up by the execution engine
      logger.info('Workflow ready to resume', {
        executionId: conversation.execution_id,
        pausedNodeId: execution.paused_node_id,
        output: outputData
      })

      // Send final message to Discord
      await sendDiscordThreadMessage(
        conversation.user_id,
        channelId,
        '✅ **Workflow continuing!** Thanks for the input.'
      )

      return NextResponse.json({
        ok: true,
        action: 'resumed',
        executionId: conversation.execution_id
      })
    } else {
      // Continue conversation - update history
      await supabase
        .from('hitl_conversations')
        .update({
          conversation_history: conversationHistory,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversation.id)

      return NextResponse.json({
        ok: true,
        action: 'continue_conversation'
      })
    }

  } catch (error: any) {
    logger.error('Discord HITL webhook error', { error: error.message })
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
