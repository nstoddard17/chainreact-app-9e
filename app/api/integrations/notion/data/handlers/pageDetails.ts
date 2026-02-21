/**
 * Notion Page Details Handler
 * Fetches a single page's properties for pre-populating form fields
 */

import { NotionIntegration, NotionDataHandler } from '../types'
import {
  validateNotionIntegration,
  makeNotionApiRequest,
  resolveNotionAccessToken,
  getNotionRequestOptions
} from '../utils'

import { logger } from '@/lib/utils/logger'

interface PageDetails {
  id: string
  properties: Record<string, any>
  parent: any
  url: string
  archived: boolean
  created_time: string
  last_edited_time: string
}

export const getNotionPageDetails: NotionDataHandler<PageDetails> = async (
  integration: NotionIntegration,
  options?: any
): Promise<PageDetails> => {
  validateNotionIntegration(integration)

  const pageId = options?.pageId || options?.page_id || options?.itemId || options?.item_id
  if (!pageId) {
    throw new Error('Page ID is required to fetch page details')
  }

  const { workspaceId } = getNotionRequestOptions(options)
  const accessToken = resolveNotionAccessToken(integration, workspaceId)

  // Normalize page ID (remove dashes)
  const normalizedPageId = pageId.replace(/-/g, '')

  logger.info('[Notion Page Details] Fetching page:', {
    integrationId: integration.id,
    pageId: normalizedPageId,
    workspaceId: workspaceId || 'default'
  })

  try {
    const response = await makeNotionApiRequest(
      `https://api.notion.com/v1/pages/${normalizedPageId}`,
      accessToken,
      { method: 'GET' }
    )

    const pageData = await response.json()

    logger.info('[Notion Page Details] Page retrieved:', {
      pageId: pageData.id,
      propertyCount: Object.keys(pageData.properties || {}).length,
      parentType: pageData.parent?.type
    })

    return {
      id: pageData.id,
      properties: pageData.properties || {},
      parent: pageData.parent,
      url: pageData.url,
      archived: pageData.archived || false,
      created_time: pageData.created_time,
      last_edited_time: pageData.last_edited_time
    }
  } catch (error: any) {
    logger.error('[Notion Page Details] Failed to fetch page:', {
      pageId: normalizedPageId,
      workspaceId,
      message: error.message,
      status: error.status
    })
    throw error
  }
}
