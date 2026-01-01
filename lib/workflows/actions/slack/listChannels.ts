/**
 * Slack List Channels Action
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken, callSlackApi, getSlackErrorMessage } from './utils'

export async function listChannels(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params
  try {
    const { includePrivate = false, excludeArchived = true, limit = 100 } = config

    const accessToken = await getSlackToken(userId)
    const types = includePrivate ? 'public_channel,private_channel' : 'public_channel'
    const result = await callSlackApi('conversations.list', accessToken, {
      types,
      exclude_archived: excludeArchived,
      limit
    })

    if (!result.ok) throw new Error(getSlackErrorMessage(result.error))

    const channels = (result.channels || []).map((ch: any) => ({
      id: ch.id,
      name: ch.name,
      isPrivate: ch.is_private,
      isArchived: ch.is_archived,
      memberCount: ch.num_members,
      topic: ch.topic?.value,
      purpose: ch.purpose?.value
    }))

    return {
      success: true,
      output: { success: true, channels, count: channels.length },
      message: `Found ${channels.length} channels`
    }
  } catch (error: any) {
    logger.error('[Slack List Channels] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionListChannels = listChannels
