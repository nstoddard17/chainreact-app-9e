/**
 * Discord HITL Webhook Handler
 * Receives Discord messages and routes them to active HITL conversations
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'
import { processConversationMessage } from '@/lib/workflows/actions/hitl/conversation'
import { sendDiscordThreadMessage } from '@/lib/workflows/actions/hitl/discord'
import { processConversationLearnings } from '@/lib/workflows/actions/hitl/memoryService'
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

    // Find HITL conversation for this channel (active or timeout)
    const supabase = await createSupabaseServerClient()

    const { data: conversation, error } = await supabase
      .from('hitl_conversations')
      .select('*')
      .eq('channel_id', channelId)
      .in('status', ['active', 'timeout'])  // Look for active OR timed-out conversations
      .single()

    if (error || !conversation) {
      // No active or timed-out conversation in this channel - ignore
      return NextResponse.json({ ok: true, message: 'No active conversation' })
    }

    // ============================================
    // HANDLE TIMED-OUT CONVERSATIONS (REACTIVATION)
    // ============================================
    if (conversation.status === 'timeout') {
      logger.info('Found timed-out HITL conversation', {
        conversationId: conversation.id,
        executionId: conversation.execution_id,
        channelId
      })

      const lowerMessage = content.toLowerCase().trim()

      // Check if user wants to reactivate
      const reactivationKeywords = ['continue', 'resume', 'reactivate', 'restart']
      const wantsToReactivate = reactivationKeywords.some(keyword =>
        lowerMessage.includes(keyword)
      )

      if (!wantsToReactivate) {
        // User didn't say a reactivation keyword
        await sendDiscordThreadMessage(
          conversation.user_id,
          channelId,
          "⏱️ **This conversation has timed out.**\n\n" +
          "If you'd like to continue where we left off, please reply with **'continue'** to reactivate it."
        )
        return NextResponse.json({ ok: true, message: 'Awaiting reactivation keyword' })
      }

      // Get workflow execution to check its status
      const { data: execution, error: execError } = await supabase
        .from('workflow_executions')
        .select('*')
        .eq('id', conversation.execution_id)
        .single()

      if (execError || !execution) {
        logger.error('Failed to find execution for timed-out conversation', { error: execError })
        return NextResponse.json({ error: 'Execution not found' }, { status: 404 })
      }

      const resumeData = execution.resume_data as any
      const hitlConfig = resumeData?.hitl_config || {}
      const timeoutMinutes = conversation.timeout_minutes || hitlConfig.timeout || 60

      // Check if workflow already completed (auto-proceeded)
      if (execution.status === 'completed') {
        await sendDiscordThreadMessage(
          conversation.user_id,
          channelId,
          "❌ **This workflow has already completed.**\n\n" +
          "When the conversation timed out, the workflow was configured to proceed automatically. " +
          "The remaining steps have already been executed.\n\n" +
          "_You'll need to start a new workflow to perform this action again._"
        )
        return NextResponse.json({ ok: true, message: 'Workflow already completed' })
      }

      // Check if workflow was cancelled
      if (execution.status === 'cancelled') {
        // Reactivate the workflow back to paused state
        await supabase
          .from('workflow_executions')
          .update({
            status: 'paused',
            paused_node_id: conversation.node_id,
            error: null,  // Clear the timeout error
            paused_at: conversation.started_at  // Keep original paused time
          })
          .eq('id', execution.id)

        logger.info('Workflow reactivated from cancelled state', {
          executionId: execution.id,
          conversationId: conversation.id
        })
      }

      // Reactivate the conversation
      await supabase
        .from('hitl_conversations')
        .update({
          status: 'active',
          timeout_at: new Date(Date.now() + timeoutMinutes * 60 * 1000),  // Reset timeout
          updated_at: new Date().toISOString()
        })
        .eq('id', conversation.id)

      // Send reactivation confirmation
      await sendDiscordThreadMessage(
        conversation.user_id,
        channelId,
        "✅ **Conversation Reactivated!**\n\n" +
        "Let's continue where we left off. Here's the context:\n\n" +
        "---\n\n" +
        conversation.context_data +
        "\n\n---\n\n" +
        `You have **${timeoutMinutes} minutes** to respond before this times out again.\n\n` +
        "What would you like to do?"
      )

      logger.info('HITL conversation reactivated', {
        conversationId: conversation.id,
        executionId: execution.id,
        newTimeoutAt: new Date(Date.now() + timeoutMinutes * 60 * 1000).toISOString()
      })

      return NextResponse.json({
        ok: true,
        action: 'reactivated',
        conversationId: conversation.id
      })
    }

    // ============================================
    // ACTIVE CONVERSATION - NORMAL PROCESSING
    // ============================================
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

    // Process message through AI (use stored system prompt with memory + knowledge base)
    const { aiResponse, shouldContinue, extractedVariables, summary } =
      await processConversationMessage(
        content,
        conversationHistory,
        hitlConfig,
        contextData,
        conversation.system_prompt || undefined // Use enhanced prompt with memory
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

      // Extract and save learnings from this conversation (async, don't block workflow)
      processConversationLearnings(
        conversation.id,
        conversation.user_id,
        conversation.workflow_id,
        conversationHistory,
        contextData,
        {
          enableMemory: hitlConfig.enableMemory,
          memoryCategories: hitlConfig.memoryCategories,
          memoryStorageDocument: hitlConfig.memoryStorageDocument,
          cacheInDatabase: hitlConfig.cacheInDatabase
        }
      ).catch(error => {
        // Log error but don't fail the workflow
        logger.error('Failed to process learnings (non-blocking)', { error: error.message })
      })

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
