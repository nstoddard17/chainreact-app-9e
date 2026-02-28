import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { google, drive_v3 } from 'googleapis'

import { logger } from '@/lib/utils/logger'

const FILE_FIELDS = 'id, name, mimeType, size, webViewLink, webContentLink, createdTime, modifiedTime, owners, parents'
const MAX_RECURSION_DEPTH = 5

/**
 * List files and folders in a Google Drive folder
 */
export async function listGoogleDriveFiles(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, input)

    const {
      folderId,
      includeSubfolders = false,
      fileTypeFilter,
      orderBy = 'name',
      limit = 100
    } = resolvedConfig

    if (!folderId) {
      return {
        success: false,
        output: {},
        message: 'Folder ID is required'
      }
    }

    const accessToken = await getDecryptedAccessToken(userId, "google-drive")
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    const pageSize = Math.min(limit, 1000)

    if (includeSubfolders) {
      // Recursive listing
      const allFiles = await listFilesRecursive(drive, folderId, fileTypeFilter, pageSize, 0)
      const sorted = sortFiles(allFiles, orderBy).slice(0, pageSize)
      return buildResult(sorted)
    }

    // Single folder listing
    let query = `'${folderId}' in parents and trashed = false`
    query = applyTypeFilter(query, fileTypeFilter)

    const orderByParam = mapOrderBy(orderBy)

    const response = await drive.files.list({
      q: query,
      pageSize,
      orderBy: orderByParam,
      fields: `files(${FILE_FIELDS})`
    })

    const files = response.data.files || []

    logger.info('📂 [Google Drive] Listed files', {
      folderId,
      count: files.length
    })

    return buildResult(files)
  } catch (error: any) {
    logger.error('❌ [Google Drive] Error listing files:', error)

    if (error.message?.includes('401') || error.message?.includes('Unauthorized') || error.code === 401) {
      throw new Error('Google Drive authentication failed. Please reconnect your account.')
    }
    if (error.message?.includes('404') || error.code === 404) {
      throw new Error('Folder not found. It may have been deleted.')
    }
    if (error.message?.includes('403') || error.code === 403) {
      throw new Error('Insufficient permissions to access this folder.')
    }

    return {
      success: false,
      output: {},
      message: error.message || 'Failed to list files from Google Drive'
    }
  }
}

async function listFilesRecursive(
  drive: drive_v3.Drive,
  folderId: string,
  fileTypeFilter: string | undefined,
  limit: number,
  depth: number
): Promise<drive_v3.Schema$File[]> {
  if (depth >= MAX_RECURSION_DEPTH) return []

  let query = `'${folderId}' in parents and trashed = false`
  const response = await drive.files.list({
    q: query,
    pageSize: Math.min(limit, 1000),
    fields: `files(${FILE_FIELDS})`
  })

  const files = response.data.files || []
  let result: drive_v3.Schema$File[] = []

  for (const file of files) {
    if (file.mimeType === 'application/vnd.google-apps.folder' && file.id) {
      result.push(file)
      const subFiles = await listFilesRecursive(drive, file.id, fileTypeFilter, limit - result.length, depth + 1)
      result = result.concat(subFiles)
      if (result.length >= limit) break
    } else {
      result.push(file)
    }
    if (result.length >= limit) break
  }

  // Apply type filter after collection
  if (fileTypeFilter && fileTypeFilter !== 'all') {
    result = result.filter(f => matchesTypeFilter(f.mimeType || '', fileTypeFilter))
  }

  return result
}

function applyTypeFilter(query: string, filter: string | undefined): string {
  if (!filter || filter === 'all') return query
  switch (filter) {
    case 'files_only':
      return `${query} and mimeType != 'application/vnd.google-apps.folder'`
    case 'folders_only':
      return `${query} and mimeType = 'application/vnd.google-apps.folder'`
    case 'documents':
      return `${query} and (mimeType contains 'document' or mimeType = 'application/pdf' or mimeType contains 'wordprocessing' or mimeType contains 'spreadsheet' or mimeType contains 'presentation')`
    case 'images':
      return `${query} and mimeType contains 'image/'`
    case 'videos':
      return `${query} and mimeType contains 'video/'`
    default:
      return query
  }
}

function matchesTypeFilter(mimeType: string, filter: string): boolean {
  switch (filter) {
    case 'files_only':
      return mimeType !== 'application/vnd.google-apps.folder'
    case 'folders_only':
      return mimeType === 'application/vnd.google-apps.folder'
    case 'documents':
      return mimeType.includes('document') || mimeType === 'application/pdf' || mimeType.includes('wordprocessing') || mimeType.includes('spreadsheet') || mimeType.includes('presentation')
    case 'images':
      return mimeType.startsWith('image/')
    case 'videos':
      return mimeType.startsWith('video/')
    default:
      return true
  }
}

function mapOrderBy(orderBy: string): string {
  switch (orderBy) {
    case 'name': return 'name'
    case 'name_desc': return 'name desc'
    case 'modifiedTime': return 'modifiedTime desc'
    case 'modifiedTime_desc': return 'modifiedTime'
    case 'createdTime': return 'createdTime desc'
    case 'folder': return 'folder,name'
    default: return 'name'
  }
}

function sortFiles(files: drive_v3.Schema$File[], orderBy: string): drive_v3.Schema$File[] {
  return [...files].sort((a, b) => {
    switch (orderBy) {
      case 'name':
        return (a.name || '').localeCompare(b.name || '')
      case 'name_desc':
        return (b.name || '').localeCompare(a.name || '')
      case 'modifiedTime':
        return new Date(b.modifiedTime || 0).getTime() - new Date(a.modifiedTime || 0).getTime()
      case 'modifiedTime_desc':
        return new Date(a.modifiedTime || 0).getTime() - new Date(b.modifiedTime || 0).getTime()
      case 'createdTime':
        return new Date(b.createdTime || 0).getTime() - new Date(a.createdTime || 0).getTime()
      case 'folder': {
        const aIsFolder = a.mimeType === 'application/vnd.google-apps.folder' ? 0 : 1
        const bIsFolder = b.mimeType === 'application/vnd.google-apps.folder' ? 0 : 1
        if (aIsFolder !== bIsFolder) return aIsFolder - bIsFolder
        return (a.name || '').localeCompare(b.name || '')
      }
      default:
        return 0
    }
  })
}

function buildResult(files: drive_v3.Schema$File[]): ActionResult {
  const fileCount = files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder').length
  const folderCount = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder').length
  const totalSize = files.reduce((sum, f) => sum + parseInt(f.size || '0', 10), 0)

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
      fileCount,
      folderCount,
      totalSize
    },
    message: `Found ${fileCount} file(s) and ${folderCount} folder(s)`
  }
}
