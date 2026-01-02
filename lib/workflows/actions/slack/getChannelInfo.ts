/**
 * Slack Get Channel Info Action
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken, callSlackApi, getSlackErrorMessage } from './utils'

export async function getChannelInfo(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params
  try {
    const { channel: rawChannel, channelId, workspace } = config
    let channel: string | undefined
    if (typeof rawChannel === 'object' && rawChannel !== null) {
      channel = rawChannel.value || rawChannel.id || rawChannel.name || String(rawChannel)
    } else if (typeof rawChannel === 'string') {
      const trimmed = rawChannel.trim()
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed)
          channel = parsed?.value || parsed?.id || parsed?.name || rawChannel
        } catch {
          channel = rawChannel
        }
      } else {
        channel = rawChannel
      }
    }
    const targetChannel = channel || channelId
    if (!targetChannel) throw new Error('Channel is required')

    // Use workspace (integration ID) to get the correct Slack token
    // If workspace is provided, it's the integration ID; otherwise fall back to userId
    const accessToken = workspace
      ? await getSlackToken(workspace, true)
      : await getSlackToken(userId, false)

    const apiPayload = { channel: targetChannel }
    logger.debug('[Slack Get Channel Info] API payload:', apiPayload)

    const result = await callSlackApi('conversations.info', accessToken, apiPayload)

    logger.debug('[Slack Get Channel Info] API response:', { ok: result.ok, error: result.error })

    if (!result.ok) throw new Error(getSlackErrorMessage(result.error))

    const ch = result.channel
    return {
      success: true,
      output: {
        success: true,
        channelId: ch.id,
        name: ch.name,
        topic: ch.topic?.value,
        purpose: ch.purpose?.value,
        isPrivate: ch.is_private,
        isArchived: ch.is_archived,
        memberCount: ch.num_members,
        created: ch.created
      },
      message: `Retrieved info for #${ch.name}`
    }
  } catch (error: any) {
    logger.error('[Slack Get Channel Info] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionGetChannelInfo = getChannelInfo
