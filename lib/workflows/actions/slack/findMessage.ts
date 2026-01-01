/**
 * Slack Find Message Action
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken, callSlackApi, getSlackErrorMessage } from './utils'

export async function findMessage(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params
  try {
    const { query, channel, count = 20 } = config
    if (!query) throw new Error('Search query is required')

    const accessToken = await getSlackToken(userId)

    // Build search query
    let searchQuery = query
    if (channel) searchQuery += ` in:${channel}`

    const result = await callSlackApi('search.messages', accessToken, {
      query: searchQuery,
      count,
      sort: 'timestamp',
      sort_dir: 'desc'
    })

    if (!result.ok) throw new Error(getSlackErrorMessage(result.error))

    const matches = (result.messages?.matches || []).map((m: any) => ({
      ts: m.ts,
      channel: m.channel?.id,
      channelName: m.channel?.name,
      user: m.user,
      username: m.username,
      text: m.text,
      permalink: m.permalink
    }))

    return {
      success: true,
      output: {
        success: true,
        messages: matches,
        count: matches.length,
        total: result.messages?.total || 0
      },
      message: `Found ${matches.length} messages`
    }
  } catch (error: any) {
    logger.error('[Slack Find Message] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionFindMessage = findMessage
