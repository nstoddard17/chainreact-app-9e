/**
 * Human-in-the-Loop Action Handler
 * Pauses workflow execution for conversational human input
 */

import { createSupabaseServerClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'
import type { ActionResult } from '../core/executeWait'
import type { HITLConfig } from './types'
import { sendDiscordHITLMessage } from './discord'
import { resolveValue } from '../core/resolveValue'

/**
 * Execute HITL action - pause workflow and initiate conversation
 */
export async function executeHITL(
  config: HITLConfig,
  userId: string,
  input: Record<string, any>,
  context?: any
): Promise<ActionResult> {
  try {
    if (!context?.workflowId || !context?.nodeId) {
      throw new Error('Workflow ID and Node ID are required for HITL actions')
    }

    if (!context?.executionId) {
      throw new Error('Execution ID is required for HITL actions')
    }

    const supabase = await createSupabaseServerClient()

    // Resolve variables in configuration
    const resolvedInitialMessage = await resolveValue(
      config.initialMessage,
      input,
      userId,
      context
    )

    const resolvedContextData = config.contextData
      ? await resolveValue(config.contextData, input, userId, context)
      : JSON.stringify(input, null, 2)

    // Parse extracted variables config (it might be a JSON string)
    let extractVariables = config.extractVariables
    if (typeof extractVariables === 'string') {
      try {
        extractVariables = JSON.parse(extractVariables)
      } catch (e) {
        logger.warn('Failed to parse extractVariables, using default')
        extractVariables = {
          decision: "The user's final decision",
          notes: "Any additional context provided"
        }
      }
    }

    // Parse continuation signals (might be JSON string or array)
    let continuationSignals = config.continuationSignals || []
    if (typeof continuationSignals === 'string') {
      try {
        continuationSignals = JSON.parse(continuationSignals)
      } catch (e) {
        // Try splitting by comma if it's a comma-separated string
        continuationSignals = continuationSignals.split(',').map(s => s.trim())
      }
    }

    // Calculate timeout
    const timeoutMinutes = config.timeout || 60
    const timeoutAt = new Date(Date.now() + timeoutMinutes * 60 * 1000)

    // Send initial message based on channel type
    let channelId = ''
    let threadId = ''

    if (config.channel === 'discord') {
      if (!config.discordGuildId || !config.discordChannelId) {
        throw new Error('Discord server and channel are required for Discord HITL')
      }

      // Generate a conversation ID for tracking
      const conversationId = `hitl_${context.executionId}_${context.nodeId}_${Date.now()}`

      const result = await sendDiscordHITLMessage(
        userId,
        config.discordGuildId,
        config.discordChannelId,
        resolvedInitialMessage,
        conversationId
      )

      if (!result.success) {
        throw new Error(`Failed to send Discord message: ${result.error}`)
      }

      channelId = result.threadId || result.channelId || ''
      threadId = result.threadId || ''
    } else {
      throw new Error(`Channel type ${config.channel} not yet supported`)
    }

    // Create conversation record in database
    const { data: conversation, error: conversationError } = await supabase
      .from('hitl_conversations')
      .insert({
        execution_id: context.executionId,
        node_id: context.nodeId,
        channel_type: config.channel,
        channel_id: channelId,
        user_id: userId,
        conversation_history: [
          {
            role: 'assistant',
            content: resolvedInitialMessage,
            timestamp: new Date().toISOString()
          }
        ],
        status: 'active',
        timeout_at: timeoutAt.toISOString()
      })
      .select()
      .single()

    if (conversationError) {
      logger.error('Failed to create HITL conversation', { error: conversationError })
      throw new Error(`Failed to create conversation record: ${conversationError.message}`)
    }

    // Update workflow execution to paused state
    const { error: updateError } = await supabase
      .from('workflow_executions')
      .update({
        status: 'paused',
        paused_node_id: context.nodeId,
        paused_at: new Date().toISOString(),
        resume_data: {
          conversation_id: conversation.id,
          hitl_config: {
            ...config,
            extractVariables,
            continuationSignals
          },
          context_data: resolvedContextData,
          channel_id: channelId,
          thread_id: threadId,
          input
        }
      })
      .eq('id', context.executionId)

    if (updateError) {
      logger.error('Failed to update execution status', { error: updateError })
      throw new Error(`Failed to pause execution: ${updateError.message}`)
    }

    logger.info('HITL conversation initiated', {
      executionId: context.executionId,
      conversationId: conversation.id,
      channelType: config.channel,
      channelId,
      timeoutAt: timeoutAt.toISOString()
    })

    return {
      success: true,
      output: {
        ...input,
        hitlInitiated: true,
        conversationId: conversation.id,
        channelType: config.channel,
        channelId,
        threadId,
        timeoutAt: timeoutAt.toISOString(),
        status: 'waiting_for_input'
      },
      message: `Workflow paused - waiting for user input via ${config.channel}`,
      pauseExecution: true // Critical flag to pause execution
    }

  } catch (error: any) {
    logger.error('HITL execution error', { error: error.message })
    return {
      success: false,
      error: error.message,
      message: `HITL failed: ${error.message}`
    }
  }
}

export { HITLConfig } from './types'
