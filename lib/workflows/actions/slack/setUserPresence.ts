/**
 * Slack Set User Presence Action
 * NOTE: This requires a user token, not a bot token. Most bots cannot change user presence.
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken, callSlackApi, getSlackErrorMessage } from './utils'

export async function setUserPresence(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params
  try {
    const { presence } = config
    if (!presence) throw new Error('Presence is required (auto or away)')
    if (!['auto', 'away'].includes(presence)) throw new Error('Presence must be "auto" or "away"')

    const accessToken = await getSlackToken(userId)
    const result = await callSlackApi('users.setPresence', accessToken, { presence })

    if (!result.ok) throw new Error(getSlackErrorMessage(result.error))

    return {
      success: true,
      output: { success: true, presence },
      message: `Presence set to ${presence}`
    }
  } catch (error: any) {
    logger.error('[Slack Set Presence] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionSetUserPresence = setUserPresence
