/**
 * Monday.com Users Handler
 */

import { MondayIntegration, MondayDataHandler } from '../types'
import { validateMondayIntegration, makeMondayApiRequest, getMondayAccessToken } from '../utils'
import { logger } from '@/lib/utils/logger'

export interface MondayUser {
  id: string
  name: string
  label: string
  value: string
  email?: string
  title?: string
}

/**
 * Fetch Monday.com users for the authenticated account
 */
export const getMondayUsers: MondayDataHandler<MondayUser> = async (integration: MondayIntegration) => {
  try {
    validateMondayIntegration(integration)

    const accessToken = await getMondayAccessToken(integration)

    const query = `
      query {
        users(limit: 100) {
          id
          name
          email
          title
        }
      }
    `

    const data = await makeMondayApiRequest(query, accessToken)

    const users = (data.users || []).map((user: any): MondayUser => ({
      id: user.id,
      name: user.name,
      label: user.name,
      value: user.id,
      email: user.email,
      title: user.title
    }))

    logger.debug(`✅ [Monday Users] Fetched ${users.length} users`)

    return users

  } catch (error: any) {
    logger.error('❌ [Monday Users] Error fetching users:', {
      message: error.message,
      status: error.status,
      stack: error.stack
    })
    throw new Error(`Failed to fetch Monday.com users: ${error.message}`)
  }
}
