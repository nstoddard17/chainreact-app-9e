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
    const { user: rawUser, workspace } = config
    if (!rawUser) throw new Error('User ID is required')

    logger.debug('[Slack Get User Info] Config values:', { rawUser, workspace, type: typeof rawUser })

    // Handle cases where user might be an object or string
    let user: string | undefined
    if (typeof rawUser === 'object' && rawUser !== null) {
      user = rawUser.value || rawUser.id || rawUser.name || String(rawUser)
    } else if (typeof rawUser === 'string') {
      const trimmed = rawUser.trim()
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed)
          user = parsed?.value || parsed?.id || parsed?.name || rawUser
        } catch {
          user = rawUser
        }
      } else {
        user = rawUser
      }
    }

    if (!user) throw new Error('User ID is required')

    // Use workspace (integration ID) to get the correct Slack token
    // If workspace is provided, it's the integration ID; otherwise fall back to userId
    const accessToken = workspace
      ? await getSlackToken(workspace, true)
      : await getSlackToken(userId, false)

    const apiPayload = { user }
    logger.debug('[Slack Get User Info] API payload:', apiPayload)

    const result = await callSlackApi('users.info', accessToken, apiPayload)

    logger.debug('[Slack Get User Info] API response:', { ok: result.ok, error: result.error })

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
