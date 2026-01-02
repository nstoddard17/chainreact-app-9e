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
    const { workspace, channel, blocks, text, threadTimestamp, asUser, unfurlLinks, unfurlMedia } = config
    if (!channel) throw new Error('Channel is required')
    if (!blocks) throw new Error('Blocks are required')

    // If asUser is true, use the user token (xoxp-) instead of bot token (xoxb-)
    const useUserToken = asUser === true
    const accessToken = workspace
      ? await getSlackToken(workspace, true, useUserToken)
      : await getSlackToken(userId, false, useUserToken)

    const payload: any = {
      channel,
      blocks: typeof blocks === 'string' ? JSON.parse(blocks) : blocks,
      text: text || 'Interactive message'
    }
    if (threadTimestamp) payload.thread_ts = threadTimestamp
    if (unfurlLinks !== undefined) payload.unfurl_links = unfurlLinks
    if (unfurlMedia !== undefined) payload.unfurl_media = unfurlMedia

    const result = await callSlackApi('chat.postMessage', accessToken, payload)
    if (!result.ok) throw new Error(getSlackErrorMessage(result.error))

    return {
      success: true,
      output: {
        success: true,
        ts: result.ts,
        messageId: result.ts,
        channel: result.channel,
        timestamp: result.ts,
        message: result.message
      },
      message: 'Interactive message posted'
    }
  } catch (error: any) {
    logger.error('[Slack Post Interactive] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionPostInteractive = postInteractiveBlocks
