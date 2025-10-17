/**
 * HITL Timeout Enforcement Cron Job
 * Runs every 5 minutes to check for expired HITL conversations
 * Handles timeout actions: cancel workflow or proceed automatically
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'
import { sendDiscordThreadMessage } from '@/lib/workflows/actions/hitl/discord'

export async function GET(request: NextRequest) {
  try {
    logger.info('[HITL Timeout] Starting timeout check')

    const supabase = await createSupabaseServerClient()

    // Find all active conversations that have passed their timeout
    const { data: expiredConversations, error: fetchError } = await supabase
      .from('hitl_conversations')
      .select(`
        *,
        workflows!inner(id, name)
      `)
      .eq('status', 'active')
      .not('timeout_at', 'is', null)  // Only check conversations with a timeout set
      .lt('timeout_at', new Date().toISOString())

    if (fetchError) {
      logger.error('[HITL Timeout] Error fetching expired conversations', { error: fetchError })
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!expiredConversations || expiredConversations.length === 0) {
      logger.info('[HITL Timeout] No expired conversations found')
      return NextResponse.json({
        checked: 0,
        message: 'No expired HITL conversations'
      })
    }

    logger.info('[HITL Timeout] Found expired conversations', {
      count: expiredConversations.length
    })

    const results = {
      checked: expiredConversations.length,
      cancelled: 0,
      proceeded: 0,
      errors: 0
    }

    for (const conversation of expiredConversations) {
      try {
        // Get workflow execution to access resume_data
        const { data: execution, error: execError } = await supabase
          .from('workflow_executions')
          .select('*')
          .eq('id', conversation.execution_id)
          .single()

        if (execError || !execution) {
          logger.error('[HITL Timeout] Execution not found for conversation', {
            conversationId: conversation.id,
            executionId: conversation.execution_id,
            error: execError
          })
          results.errors++
          continue
        }

        const resumeData = execution.resume_data as any
        const hitlConfig = resumeData?.hitl_config || {}
        const timeoutAction = conversation.timeout_action || hitlConfig.timeoutAction || 'cancel'
        const timeoutMinutes = conversation.timeout_minutes || hitlConfig.timeout || 60

        logger.info('[HITL Timeout] Processing expired conversation', {
          conversationId: conversation.id,
          executionId: execution.id,
          workflowName: conversation.workflows?.name,
          timeoutAction,
          timeoutMinutes,
          expiredAt: conversation.timeout_at
        })

        if (timeoutAction === 'cancel') {
          // ============================================
          // CANCEL: Cancel the workflow
          // ============================================

          await supabase
            .from('workflow_executions')
            .update({
              status: 'cancelled',
              completed_at: new Date().toISOString(),
              error: `HITL conversation timed out after ${timeoutMinutes} minutes with no response`
            })
            .eq('id', execution.id)

          // Mark conversation as timed out
          await supabase
            .from('hitl_conversations')
            .update({
              status: 'timeout',
              completed_at: new Date().toISOString()
            })
            .eq('id', conversation.id)

          // Notify user in Discord
          await sendDiscordThreadMessage(
            conversation.user_id,
            conversation.channel_id,
            `⏱️ **Workflow Timed Out**\n\n` +
            `No response was received within **${timeoutMinutes} minutes**.\n\n` +
            `The workflow has been **cancelled**.\n\n` +
            `_To reactivate this conversation and continue the workflow, reply with **"continue"**._`
          )

          results.cancelled++

          logger.info('[HITL Timeout] Workflow cancelled', {
            conversationId: conversation.id,
            executionId: execution.id
          })

        } else if (timeoutAction === 'proceed') {
          // ============================================
          // PROCEED: Auto-continue with original data
          // ============================================

          const outputData = {
            ...resumeData.input,  // Original data from before HITL
            hitlStatus: 'proceeded_on_timeout',
            conversationSummary: `No response received within ${timeoutMinutes} minutes - proceeded automatically`,
            messagesCount: conversation.conversation_history?.length || 0,
            duration: Math.round(
              (new Date().getTime() - new Date(conversation.started_at).getTime()) / 1000
            ),
            extractedVariables: {},
            timedOut: true
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
            .eq('id', execution.id)

          // Mark conversation as completed (auto-proceeded)
          await supabase
            .from('hitl_conversations')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              extracted_variables: { auto_proceeded: true }
            })
            .eq('id', conversation.id)

          // Notify user in Discord
          await sendDiscordThreadMessage(
            conversation.user_id,
            conversation.channel_id,
            `⏱️ **Workflow Proceeded Automatically**\n\n` +
            `No response was received within **${timeoutMinutes} minutes**.\n\n` +
            `The workflow has **continued automatically** with the original data.\n\n` +
            `_This conversation has ended. The workflow is now completing the remaining steps._`
          )

          results.proceeded++

          logger.info('[HITL Timeout] Workflow auto-proceeded', {
            conversationId: conversation.id,
            executionId: execution.id
          })
        }

      } catch (error: any) {
        logger.error('[HITL Timeout] Error processing expired conversation', {
          conversationId: conversation.id,
          error: error.message
        })
        results.errors++
      }
    }

    logger.info('[HITL Timeout] Timeout check completed', results)

    return NextResponse.json({
      ...results,
      message: `Processed ${results.checked} expired conversations: ${results.cancelled} cancelled, ${results.proceeded} proceeded, ${results.errors} errors`
    })

  } catch (error: any) {
    logger.error('[HITL Timeout] Cron job error', { error: error.message })
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
