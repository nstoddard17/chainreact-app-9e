/**
 * Notion Database Items Handlers
 * Provide dynamic options for active and archived database entries.
 */

import { NotionIntegration, NotionDataHandler } from '../types'
import {
  validateNotionIntegration,
  resolveNotionAccessToken,
  getNotionRequestOptions,
  makeNotionApiRequest,
  getPageTitle
} from '../utils'

import { logger } from '@/lib/utils/logger'

type NotionDatabaseItemOption = {
  id: string
  name: string
  value: string
  label: string
  title: string
  url?: string
  databaseId: string
  archived: boolean
}

async function fetchDatabaseItems(
  integration: NotionIntegration,
  options: any,
  archivedOnly: boolean
): Promise<NotionDatabaseItemOption[]> {
  validateNotionIntegration(integration)
  const { workspaceId } = getNotionRequestOptions(options)
  const accessToken = resolveNotionAccessToken(integration, workspaceId)

  const databaseId =
    options?.databaseId ||
    options?.database_id ||
    options?.database ||
    options?.databaseID

  if (!databaseId) {
    logger.debug('[Notion Database Items] Missing databaseId; returning empty list')
    return []
  }

  logger.debug('[Notion Database Items] Fetching items', {
    integrationId: integration.id,
    databaseId,
    workspaceId: workspaceId || 'default',
    archivedOnly
  })

  const response = await makeNotionApiRequest(
    `https://api.notion.com/v1/databases/${databaseId}/query`,
    accessToken,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        page_size: 100
      })
    }
  )

  const data = await response.json()
  const entries = Array.isArray(data.results) ? data.results : []

  const filteredEntries = entries.filter((page: any) =>
    archivedOnly ? page.archived === true : page.archived !== true
  )

  logger.debug('[Notion Database Items] Items fetched', {
    total: entries.length,
    returned: filteredEntries.length,
    archivedOnly
  })

  return filteredEntries.map((page: any) => {
    const title = getPageTitle(page) || 'Untitled'
    return {
      id: page.id,
      name: title,
      value: page.id,
      label: title !== 'Untitled' ? title : `Page (${page.id.substring(0, 8)}...)`,
      title,
      url: page.url,
      databaseId,
      archived: !!page.archived
    }
  })
}

export const getNotionDatabaseItems: NotionDataHandler<NotionDatabaseItemOption> = async (
  integration: NotionIntegration,
  options?: any
) => {
  return fetchDatabaseItems(integration, options, false)
}

export const getNotionArchivedItems: NotionDataHandler<NotionDatabaseItemOption> = async (
  integration: NotionIntegration,
  options?: any
) => {
  return fetchDatabaseItems(integration, options, true)
}
