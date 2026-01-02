/**
 * Slack Find User Action
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken, callSlackApi, getSlackErrorMessage } from './utils'

export async function findUser(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params
  try {
    const { email, searchTerm } = config
    if (!email && !searchTerm) throw new Error('Email or search term is required')

    const accessToken = await getSlackToken(userId)

    // If email provided, use lookupByEmail
    if (email) {
      const result = await callSlackApi('users.lookupByEmail', accessToken, { email })
      if (!result.ok) {
        if (result.error === 'users_not_found') {
          return { success: true, output: { success: true, found: false, user: null }, message: 'User not found' }
        }
        throw new Error(getSlackErrorMessage(result.error, result))
      }
      const u = result.user
      return {
        success: true,
        output: {
          success: true,
          found: true,
          user: {
            id: u.id,
            name: u.name,
            realName: u.real_name,
            email: u.profile?.email
          }
        },
        message: `Found user: ${u.real_name || u.name}`
      }
    }

    // Otherwise search all users
    const listResult = await callSlackApi('users.list', accessToken, { limit: 1000 })
    if (!listResult.ok) throw new Error(getSlackErrorMessage(listResult.error))

    const term = searchTerm.toLowerCase()
    const match = (listResult.members || []).find((u: any) =>
      !u.deleted && (
        u.name?.toLowerCase().includes(term) ||
        u.real_name?.toLowerCase().includes(term) ||
        u.profile?.display_name?.toLowerCase().includes(term) ||
        u.profile?.email?.toLowerCase().includes(term)
      )
    )

    if (!match) {
      return { success: true, output: { success: true, found: false, user: null }, message: 'User not found' }
    }

    return {
      success: true,
      output: {
        success: true,
        found: true,
        user: { id: match.id, name: match.name, realName: match.real_name, email: match.profile?.email }
      },
      message: `Found user: ${match.real_name || match.name}`
    }
  } catch (error: any) {
    logger.error('[Slack Find User] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionFindUser = findUser
