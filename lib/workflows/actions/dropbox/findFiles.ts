import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * File type extension mappings for filtering
 */
const FILE_TYPE_EXTENSIONS: Record<string, string[]> = {
  image: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tiff'],
  video: ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.webm', '.m4v'],
  audio: ['.mp3', '.wav', '.aac', '.flac', '.ogg', '.wma', '.m4a'],
  document: ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt', '.tex', '.md'],
  spreadsheet: ['.xlsx', '.xls', '.csv', '.ods', '.numbers'],
  presentation: ['.pptx', '.ppt', '.key', '.odp'],
  archive: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2']
}

/**
 * Check if file matches the type filter
 */
function matchesFileType(fileName: string, fileType: string, isFolder: boolean): boolean {
  if (fileType === 'any') return true
  if (fileType === 'folder') return isFolder
  if (fileType === 'file') return !isFolder

  const extensions = FILE_TYPE_EXTENSIONS[fileType]
  if (!extensions) return true

  const lowerName = fileName.toLowerCase()
  return extensions.some(ext => lowerName.endsWith(ext))
}

/**
 * Sort files based on sort option
 */
function sortFiles(files: any[], sortBy: string): any[] {
  const sorted = [...files]

  switch (sortBy) {
    case 'name_asc':
      return sorted.sort((a, b) => a.name.localeCompare(b.name))
    case 'name_desc':
      return sorted.sort((a, b) => b.name.localeCompare(a.name))
    case 'modified_asc':
      return sorted.sort((a, b) => new Date(a.client_modified).getTime() - new Date(b.client_modified).getTime())
    case 'modified_desc':
      return sorted.sort((a, b) => new Date(b.client_modified).getTime() - new Date(a.client_modified).getTime())
    case 'size_asc':
      return sorted.sort((a, b) => (a.size || 0) - (b.size || 0))
    case 'size_desc':
      return sorted.sort((a, b) => (b.size || 0) - (a.size || 0))
    default:
      return sorted
  }
}

/**
 * Find files in Dropbox with advanced search and filtering
 */
export async function findDropboxFiles(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "dropbox")

    // Resolve dynamic values
    const path = context.dataFlowManager.resolveVariable(config.path) || ""
    const searchQuery = context.dataFlowManager.resolveVariable(config.searchQuery) || ""
    const fileType = context.dataFlowManager.resolveVariable(config.fileType) || "any"
    const modifiedAfter = context.dataFlowManager.resolveVariable(config.modifiedAfter) || ""
    const modifiedBefore = context.dataFlowManager.resolveVariable(config.modifiedBefore) || ""
    const limit = parseInt(context.dataFlowManager.resolveVariable(config.limit)) || 100
    const sortBy = context.dataFlowManager.resolveVariable(config.sortBy) || "modified_desc"
    const downloadContent = context.dataFlowManager.resolveVariable(config.downloadContent) === true

    // Validate and cap limit
    const actualLimit = Math.min(Math.max(1, limit), 1000)

    logger.debug('[Dropbox Find Files] Search parameters:', {
      path,
      searchQuery,
      fileType,
      modifiedAfter,
      modifiedBefore,
      limit: actualLimit,
      sortBy,
      downloadContent
    })

    let allFiles: any[] = []

    // Use search API if there's a search query, otherwise list folder
    if (searchQuery) {
      // Use Dropbox search API
      const searchResponse = await fetch('https://api.dropboxapi.com/2/files/search_v2', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: searchQuery,
          options: {
            path: path || undefined,
            max_results: Math.min(actualLimit * 2, 1000), // Get more for filtering
            file_status: 'active',
            filename_only: true
          }
        })
      })

      if (!searchResponse.ok) {
        const errorText = await searchResponse.text()
        throw new Error(`Dropbox search error: ${searchResponse.status} - ${errorText}`)
      }

      const searchData = await searchResponse.json()
      allFiles = searchData.matches
        .map((match: any) => match.metadata.metadata)
        .filter((item: any) => item['.tag'] === 'file' || item['.tag'] === 'folder')
    } else {
      // List folder contents
      const listResponse = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: path || "",
          recursive: true, // Search in subfolders
          limit: Math.min(actualLimit * 2, 2000)
        })
      })

      if (!listResponse.ok) {
        const errorText = await listResponse.text()
        throw new Error(`Dropbox list folder error: ${listResponse.status} - ${errorText}`)
      }

      const listData = await listResponse.json()
      allFiles = listData.entries
    }

    logger.debug(`[Dropbox Find Files] Found ${allFiles.length} files before filtering`)

    // Apply filters
    let filteredFiles = allFiles.filter(file => {
      const isFolder = file['.tag'] === 'folder'
      const fileName = file.name

      // File type filter
      if (!matchesFileType(fileName, fileType, isFolder)) {
        return false
      }

      // Date filters (only for files, not folders)
      if (!isFolder && file.client_modified) {
        const fileDate = new Date(file.client_modified)

        if (modifiedAfter) {
          const afterDate = new Date(modifiedAfter)
          if (fileDate < afterDate) return false
        }

        if (modifiedBefore) {
          const beforeDate = new Date(modifiedBefore)
          if (fileDate > beforeDate) return false
        }
      }

      return true
    })

    logger.debug(`[Dropbox Find Files] ${filteredFiles.length} files after filtering`)

    // Sort files
    filteredFiles = sortFiles(filteredFiles, sortBy)

    // Check if there are more results
    const hasMore = filteredFiles.length > actualLimit

    // Apply limit
    filteredFiles = filteredFiles.slice(0, actualLimit)

    // Download content if requested (with safety limits)
    if (downloadContent) {
      const downloadLimit = Math.min(filteredFiles.length, 20)
      let totalSize = 0
      const maxTotalSize = 100 * 1024 * 1024 // 100MB

      logger.warn(`[Dropbox Find Files] Download content enabled - limiting to ${downloadLimit} files for safety`)

      for (let i = 0; i < downloadLimit; i++) {
        const file = filteredFiles[i]

        // Skip folders
        if (file['.tag'] === 'folder') continue

        // Check total size limit
        if (file.size && totalSize + file.size > maxTotalSize) {
          logger.warn(`[Dropbox Find Files] Total size limit (${maxTotalSize} bytes) reached, stopping downloads`)
          break
        }

        try {
          const downloadResponse = await fetch('https://content.dropboxapi.com/2/files/download', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Dropbox-API-Arg': JSON.stringify({ path: file.path_display || file.path_lower })
            }
          })

          if (downloadResponse.ok) {
            const buffer = await downloadResponse.arrayBuffer()
            file.content = Buffer.from(buffer).toString('base64')
            totalSize += file.size || 0
          }
        } catch (downloadError: any) {
          logger.error(`[Dropbox Find Files] Failed to download ${file.name}:`, downloadError.message)
          // Continue with other files
        }
      }
    }

    // Format output
    const formattedFiles = filteredFiles.map(file => ({
      id: file.id,
      name: file.name,
      path: file.path_display || file.path_lower,
      size: file.size || 0,
      modifiedAt: file.client_modified || file.server_modified,
      isFolder: file['.tag'] === 'folder',
      content: file.content || null,
      rev: file.rev,
      contentHash: file.content_hash
    }))

    const output = {
      files: formattedFiles,
      totalCount: formattedFiles.length,
      hasMore,
      searchQuery: searchQuery || "all files",
      folderPath: path || "/"
    }

    return {
      success: true,
      output,
      message: `Found ${formattedFiles.length} file(s)${hasMore ? ' (more available)' : ''}`
    }
  } catch (error: any) {
    logger.error('[Dropbox Find Files] Error:', error)
    return {
      success: false,
      output: {
        files: [],
        totalCount: 0,
        hasMore: false
      },
      message: error.message || 'Failed to find files in Dropbox'
    }
  }
}
