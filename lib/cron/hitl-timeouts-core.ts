/**
 * Core HITL timeout logic, extracted from app/api/cron/check-hitl-timeouts/route.ts
 * for use by the consolidated cron endpoint.
 */

import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'
import { sendDiscordThreadMessage } from '@/lib/workflows/actions/hitl/discord'

export interface HitlTimeoutResult {
  checked: number
  cancelled: number
  proceeded: number
  errors: number
}

export async function checkHitlTimeoutsCore(): Promise<HitlTimeoutResult> {
  logger.info('[HITL Timeout] Starting timeout check')

  const supabase = await createSupabaseRouteHandlerClient()

  const { data: expiredConversations, error: fetchError } = await supabase
    .from('hitl_conversations')
    .select(`*, workflows!inner(id, name)`)
    .eq('status', 'active')
    .not('timeout_at', 'is', null)
    .lt('timeout_at', new Date().toISOString())

  if (fetchError) {
    throw new Error(`Error fetching expired conversations: ${fetchError.message}`)
  }

  if (!expiredConversations || expiredConversations.length === 0) {
    logger.info('[HITL Timeout] No expired conversations found')
    return { checked: 0, cancelled: 0, proceeded: 0, errors: 0 }
  }

  logger.info('[HITL Timeout] Found expired conversations', { count: expiredConversations.length })

  const results: HitlTimeoutResult = {
    checked: expiredConversations.length,
    cancelled: 0,
    proceeded: 0,
    errors: 0,
  }

  for (const conversation of expiredConversations) {
    try {
      const { data: execution, error: execError } = await supabase
        .from('workflow_execution_sessions')
        .select('*')
        .eq('id', conversation.execution_id!)
        .single()

      if (execError || !execution) {
        results.errors++
        continue
      }

      const resumeData = execution.resume_data as any
      const hitlConfig = resumeData?.hitl_config || {}
      const timeoutAction = conversation.timeout_action || hitlConfig.timeoutAction || 'cancel'
      const timeoutMinutes = conversation.timeout_minutes || hitlConfig.timeout || 60

      if (timeoutAction === 'cancel') {
        await supabase
          .from('workflow_execution_sessions')
          .update({
            status: 'cancelled',
            completed_at: new Date().toISOString(),
            error: `HITL conversation timed out after ${timeoutMinutes} minutes with no response`
          })
          .eq('id', execution.id)

        await supabase
          .from('hitl_conversations')
          .update({ status: 'timeout', completed_at: new Date().toISOString() })
          .eq('id', conversation.id)

        try {
          await sendDiscordThreadMessage(
            conversation.user_id!,
            conversation.channel_id!,
            `**Workflow Timed Out**\n\nNo response was received within **${timeoutMinutes} minutes**.\nThe workflow has been **cancelled**.`
          )
        } catch {
          // Discord notification is best-effort
        }
        results.cancelled++
      } else if (timeoutAction === 'proceed') {
        const outputData = {
          ...resumeData.input,
          hitlStatus: 'proceeded_on_timeout',
          conversationSummary: `No response received within ${timeoutMinutes} minutes - proceeded automatically`,
          messagesCount: Array.isArray(conversation.conversation_history) ? conversation.conversation_history.length : 0,
          duration: Math.round((new Date().getTime() - new Date(conversation.started_at!).getTime()) / 1000),
          extractedVariables: {},
          timedOut: true
        }

        await supabase
          .from('workflow_execution_sessions')
          .update({
            status: 'running',
            paused_node_id: null,
            paused_at: null,
            resume_data: { ...resumeData, output: outputData }
          })
          .eq('id', execution.id)

        await supabase
          .from('hitl_conversations')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            extracted_variables: { auto_proceeded: true }
          })
          .eq('id', conversation.id)

        try {
          await sendDiscordThreadMessage(
            conversation.user_id!,
            conversation.channel_id!,
            `**Workflow Proceeded Automatically**\n\nNo response was received within **${timeoutMinutes} minutes**.\nThe workflow has **continued automatically** with the original data.`
          )
        } catch {
          // Discord notification is best-effort
        }
        results.proceeded++
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
  return results
}
