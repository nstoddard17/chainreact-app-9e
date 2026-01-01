/**
 * Slack Get User Info Action
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken, callSlackApi, getSlackErrorMessage } from './utils'

export async function getUserInfo(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params
  try {
    const { user } = config
    if (!user) throw new Error('User ID is required')

    const accessToken = await getSlackToken(userId)
    const result = await callSlackApi('users.info', accessToken, { user })

    if (!result.ok) throw new Error(getSlackErrorMessage(result.error))

    const u = result.user
    return {
      success: true,
      output: {
        success: true,
        userId: u.id,
        name: u.name,
        realName: u.real_name,
        displayName: u.profile?.display_name,
        email: u.profile?.email,
        title: u.profile?.title,
        phone: u.profile?.phone,
        isAdmin: u.is_admin,
        isOwner: u.is_owner,
        isBot: u.is_bot,
        timezone: u.tz,
        avatar: u.profile?.image_192
      },
      message: `Retrieved info for ${u.real_name || u.name}`
    }
  } catch (error: any) {
    logger.error('[Slack Get User Info] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionGetUserInfo = getUserInfo
