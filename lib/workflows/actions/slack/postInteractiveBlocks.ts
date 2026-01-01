/**
 * Slack Post Interactive Blocks Action
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken, callSlackApi, getSlackErrorMessage } from './utils'

export async function postInteractiveBlocks(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params
  try {
    const { channel, blocks, text, threadTs } = config
    if (!channel) throw new Error('Channel is required')
    if (!blocks) throw new Error('Blocks are required')

    const accessToken = await getSlackToken(userId)
    const payload: any = {
      channel,
      blocks: typeof blocks === 'string' ? JSON.parse(blocks) : blocks,
      text: text || 'Interactive message'
    }
    if (threadTs) payload.thread_ts = threadTs

    const result = await callSlackApi('chat.postMessage', accessToken, payload)
    if (!result.ok) throw new Error(getSlackErrorMessage(result.error))

    return {
      success: true,
      output: {
        success: true,
        messageId: result.ts,
        channel: result.channel,
        timestamp: result.ts
      },
      message: 'Interactive message posted'
    }
  } catch (error: any) {
    logger.error('[Slack Post Interactive] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionPostInteractive = postInteractiveBlocks
