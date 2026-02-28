import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { google } from 'googleapis'

import { logger } from '@/lib/utils/logger'

/**
 * Search for files and folders in Google Drive
 */
export async function searchGoogleDriveFiles(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, input)

    const {
      searchMode = 'simple',
      folderId,
      fileName,
      exactMatch = false,
      fileType,
      modifiedTime,
      owner,
      customQuery,
      maxResults = 50
    } = resolvedConfig

    const accessToken = await getDecryptedAccessToken(userId, "google-drive")
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    // Build query based on search mode
    let query = buildQuery(searchMode, {
      fileName, exactMatch, fileType, modifiedTime, owner, customQuery
    })

    // Add folder filter if specified
    if (folderId) {
      const folderClause = `'${folderId}' in parents`
      query = query ? `${query} and ${folderClause}` : folderClause
    }

    // Always exclude trashed files
    query = query ? `${query} and trashed = false` : 'trashed = false'

    logger.info('🔍 [Google Drive] Searching with query', { query, searchMode })

    const response = await drive.files.list({
      q: query,
      pageSize: Math.min(maxResults, 1000),
      fields: 'files(id, name, mimeType, size, webViewLink, webContentLink, createdTime, modifiedTime, owners, parents), nextPageToken'
    })

    const files = response.data.files || []
    const hasMore = !!response.data.nextPageToken

    logger.info('🔍 [Google Drive] Search results', {
      count: files.length,
      hasMore,
      query
    })

    return {
      success: true,
      output: {
        files: files.map(f => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          size: f.size ? parseInt(f.size, 10) : 0,
          webViewLink: f.webViewLink,
          webContentLink: f.webContentLink,
          createdTime: f.createdTime,
          modifiedTime: f.modifiedTime,
          owners: f.owners || []
        })),
        totalCount: files.length,
        hasMore
      },
      message: `Found ${files.length} result(s)${hasMore ? ' (more available)' : ''}`
    }
  } catch (error: any) {
    logger.error('❌ [Google Drive] Error searching files:', error)

    if (error.message?.includes('401') || error.message?.includes('Unauthorized') || error.code === 401) {
      throw new Error('Google Drive authentication failed. Please reconnect your account.')
    }
    if (error.message?.includes('403') || error.code === 403) {
      throw new Error('Insufficient permissions to search Google Drive.')
    }
    if (error.message?.includes('Invalid query') || error.message?.includes('Invalid Value')) {
      throw new Error('Invalid search query. Please check your search terms or custom query syntax.')
    }

    return {
      success: false,
      output: {},
      message: error.message || 'Failed to search files in Google Drive'
    }
  }
}

function buildQuery(
  searchMode: string,
  params: {
    fileName?: string
    exactMatch?: boolean
    fileType?: string
    modifiedTime?: string
    owner?: string
    customQuery?: string
  }
): string {
  if (searchMode === 'query') {
    return params.customQuery || ''
  }

  if (searchMode === 'simple') {
    if (!params.fileName) return ''
    return params.exactMatch
      ? `name = '${escapeQueryValue(params.fileName)}'`
      : `name contains '${escapeQueryValue(params.fileName)}'`
  }

  // Advanced mode
  const parts: string[] = []

  if (params.fileName) {
    parts.push(`name contains '${escapeQueryValue(params.fileName)}'`)
  }

  if (params.fileType && params.fileType !== 'any') {
    if (params.fileType.includes('*')) {
      // Wildcard types like image/*, video/*
      const prefix = params.fileType.split('/')[0]
      parts.push(`mimeType contains '${prefix}/'`)
    } else {
      parts.push(`mimeType = '${params.fileType}'`)
    }
  }

  if (params.modifiedTime && params.modifiedTime !== 'any') {
    const dateThreshold = getDateThreshold(params.modifiedTime)
    if (dateThreshold) {
      parts.push(`modifiedTime > '${dateThreshold.toISOString()}'`)
    }
  }

  if (params.owner === 'me') {
    parts.push(`'me' in owners`)
  } else if (params.owner === 'shared') {
    parts.push(`sharedWithMe = true`)
  }

  return parts.join(' and ')
}

function getDateThreshold(timeFilter: string): Date | null {
  const now = new Date()
  switch (timeFilter) {
    case 'today': {
      const today = new Date(now)
      today.setHours(0, 0, 0, 0)
      return today
    }
    case 'week':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    case 'month':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    case 'year':
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
    default:
      return null
  }
}

function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}
