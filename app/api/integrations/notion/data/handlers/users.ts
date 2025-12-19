/**
 * Notion Users Handler
 */

import { NotionIntegration, NotionUser, NotionDataHandler } from '../types'
import {
  validateNotionIntegration,
  resolveNotionAccessToken,
  getNotionRequestOptions
} from '../utils'

import { logger } from '@/lib/utils/logger'

/**
 * Fetch all users in the Notion workspace.
 */
export const getNotionUsers: NotionDataHandler<NotionUser> = async (
  integration: NotionIntegration,
  context?: any
) => {
  try {
    validateNotionIntegration(integration)
    const { workspaceId } = getNotionRequestOptions(context)

    logger.debug('[Notion Users] Fetching workspace users', {
      integrationId: integration.id,
      workspaceId: workspaceId || 'default'
    })

    const accessToken = resolveNotionAccessToken(integration, workspaceId)

    const response = await fetch('https://api.notion.com/v1/users', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      logger.error('[Notion Users] API error', { status: response.status, error })
      throw new Error(error.message || 'Failed to fetch users')
    }

    const data = await response.json()

    const users: NotionUser[] = data.results.map((user: any) => {
      let name = user.name || 'Unknown User'

      if (user.type === 'person') {
        name = user.name || user.person?.email || 'Unknown User'
      } else if (user.type === 'bot') {
        if (user.bot?.owner?.type === 'workspace') {
          name = user.name || 'Workspace Bot'
          name = name.includes('Bot') ? name : `${name} (Bot)`
        } else if (user.bot?.owner?.type === 'user') {
          name = `${user.name || 'User Bot'} (Bot)`
        } else {
          name = `${user.name || 'Bot'} (Bot)`
        }
      }

      return {
        id: user.id,
        name,
        value: user.id,
        type: user.type || 'person',
        email: user.person?.email || undefined,
        avatar_url: user.avatar_url || undefined
      }
    })

    const uniqueUsers = users.filter(
      (user, index, self) => index === self.findIndex(u => u.id === user.id)
    )

    const nameGroups = uniqueUsers.reduce((acc: Record<string, NotionUser[]>, user) => {
      acc[user.name] = acc[user.name] || []
      acc[user.name].push(user)
      return acc
    }, {})

    const finalUsers = uniqueUsers.map(user => {
      const sameNameUsers = nameGroups[user.name]
      if (sameNameUsers && sameNameUsers.length > 1) {
        let distinguisher = ''
        if (user.email) {
          distinguisher = ` (${user.email})`
        } else if (!user.name.includes('(Bot)')) {
          distinguisher = ` (${user.id.slice(-4)})`
        }

        return {
          ...user,
          name: user.name + distinguisher,
          label: user.name + distinguisher
        }
      }

      return {
        ...user,
        label: user.name
      }
    })

    finalUsers.sort((a, b) => a.name.localeCompare(b.name))

    logger.debug('[Notion Users] Retrieved users', {
      integrationId: integration.id,
      workspaceId: workspaceId || 'default',
      count: finalUsers.length
    })

    return finalUsers
  } catch (error: any) {
    logger.error('[Notion Users] Error fetching users', {
      message: error.message
    })
    throw error
  }
}
