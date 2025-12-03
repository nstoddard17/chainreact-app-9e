/**
 * Notion Database Properties Handler
 */

import { NotionIntegration, NotionDatabaseProperty, NotionDataHandler } from '../types'
import { validateNotionIntegration, makeNotionApiRequest, resolveNotionAccessToken } from '../utils'

import { logger } from '@/lib/utils/logger'

type DatabasePropertyOptions = {
  databaseId?: string
  database_id?: string
  workspaceId?: string
  workspace?: string
}

export const getNotionDatabaseProperties: NotionDataHandler<NotionDatabaseProperty> = async (
  integration: NotionIntegration,
  options?: DatabasePropertyOptions
): Promise<NotionDatabaseProperty[]> => {
  validateNotionIntegration(integration)

  const databaseId = options?.databaseId || options?.database_id
  if (!databaseId) {
    throw new Error('Database ID is required to fetch properties')
  }

  const workspaceId = options?.workspaceId || options?.workspace
  const accessToken = resolveNotionAccessToken(integration, workspaceId)
  const apiUrl = `https://api.notion.com/v1/databases/${databaseId}`

  logger.debug('[Notion] Fetching database properties', {
    integrationId: integration.id,
    databaseId,
    workspaceId: workspaceId || 'default'
  })

  try {
    const response = await makeNotionApiRequest(apiUrl, accessToken, { method: 'GET' })
    const database = await response.json()
    const properties = database.properties || {}

    logger.debug('[Notion] Database properties retrieved', {
      databaseId,
      propertyCount: Object.keys(properties).length
    })

    return Object.entries(properties).map(([name, property]: [string, any]) => ({
      id: property.id,
      name,
      value: name,
      label: name,
      type: property.type,
      property,
      databaseId,
      databaseTitle: database.title?.[0]?.plain_text || 'Untitled Database'
    }))
  } catch (error: any) {
    logger.error('[Notion] Failed to fetch database properties', {
      databaseId,
      workspaceId,
      message: error.message,
      status: error.status
    })
    throw error
  }
}
