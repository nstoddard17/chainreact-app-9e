import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Search for files and folders in OneDrive
 */
export async function searchOnedriveFiles(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "onedrive")

    // Resolve dynamic values
    const searchQuery = context.dataFlowManager.resolveVariable(config.searchQuery)
    const searchType = context.dataFlowManager.resolveVariable(config.searchType) || 'any'
    const searchScope = context.dataFlowManager.resolveVariable(config.searchScope)
    const fileType = context.dataFlowManager.resolveVariable(config.fileType) || 'any'
    const maxResults = context.dataFlowManager.resolveVariable(config.maxResults) || 20
    const sortBy = context.dataFlowManager.resolveVariable(config.sortBy) || 'relevance'

    if (!searchQuery) {
      throw new Error("Search query is required")
    }

    // Build search URL
    let searchUrl: string
    if (searchScope) {
      searchUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${searchScope}/search(q='${encodeURIComponent(searchQuery)}')`
    } else {
      searchUrl = `https://graph.microsoft.com/v1.0/me/drive/root/search(q='${encodeURIComponent(searchQuery)}')`
    }

    // Add top parameter for max results
    searchUrl += `?$top=${Math.min(maxResults, 200)}`

    // Add orderby if not relevance
    if (sortBy === 'name') {
      searchUrl += '&$orderby=name'
    } else if (sortBy === 'lastModified') {
      searchUrl += '&$orderby=lastModifiedDateTime desc'
    } else if (sortBy === 'size') {
      searchUrl += '&$orderby=size desc'
    }

    logger.debug('[OneDrive] Searching files:', {
      searchQuery,
      searchType,
      searchScope,
      fileType,
      maxResults
    })

    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OneDrive API error: ${response.status} - ${errorText}`)
    }

    const searchResult = await response.json()
    let items = searchResult.value || []

    // Filter by item type
    if (searchType === 'files') {
      items = items.filter((item: any) => item.file !== undefined)
    } else if (searchType === 'folders') {
      items = items.filter((item: any) => item.folder !== undefined)
    }

    // Filter by file type category
    if (fileType !== 'any' && searchType !== 'folders') {
      const fileTypeMap: Record<string, string[]> = {
        documents: ['.doc', '.docx', '.txt', '.rtf', '.odt'],
        images: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp'],
        audio: ['.mp3', '.wav', '.aac', '.flac', '.m4a'],
        video: ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv'],
        spreadsheets: ['.xls', '.xlsx', '.csv', '.ods'],
        presentations: ['.ppt', '.pptx', '.odp'],
        pdf: ['.pdf'],
        archives: ['.zip', '.rar', '.7z', '.tar', '.gz']
      }

      const extensions = fileTypeMap[fileType] || []
      items = items.filter((item: any) => {
        if (!item.name) return false
        const itemName = item.name.toLowerCase()
        return extensions.some(ext => itemName.endsWith(ext))
      })
    }

    // Map items to output format
    const mappedItems = items.map((item: any) => ({
      id: item.id,
      name: item.name,
      type: item.folder ? 'folder' : 'file',
      path: item.parentReference?.path,
      webUrl: item.webUrl,
      size: item.size || 0,
      modifiedTime: item.lastModifiedDateTime
    }))

    return {
      success: true,
      output: {
        results: mappedItems,
        totalCount: mappedItems.length,
        items: mappedItems
      },
      message: `Found ${mappedItems.length} item(s) matching "${searchQuery}"`
    }
  } catch (error: any) {
    logger.error('OneDrive Search Files error:', error)
    return {
      success: false,
      output: {
        results: [],
        totalCount: 0,
        items: []
      },
      message: error.message || 'Failed to search files in OneDrive'
    }
  }
}
