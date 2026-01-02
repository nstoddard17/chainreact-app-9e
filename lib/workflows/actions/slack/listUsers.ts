/**
 * Slack List Users Action
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken, callSlackApi, getSlackErrorMessage } from './utils'

export async function listUsers(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params
  try {
    const { includeBots = false, limit = 100 } = config

    const accessToken = await getSlackToken(userId)
    const result = await callSlackApi('users.list', accessToken, { limit })

    if (!result.ok) throw new Error(getSlackErrorMessage(result.error, result))

    let users = (result.members || [])
      .filter((u: any) => !u.deleted)
      .filter((u: any) => includeBots || !u.is_bot)
      .map((u: any) => ({
        id: u.id,
        name: u.name,
        realName: u.real_name,
        displayName: u.profile?.display_name,
        email: u.profile?.email,
        isAdmin: u.is_admin,
        isBot: u.is_bot
      }))

    return {
      success: true,
      output: { success: true, users, count: users.length },
      message: `Found ${users.length} users`
    }
  } catch (error: any) {
    logger.error('[Slack List Users] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionListUsers = listUsers
