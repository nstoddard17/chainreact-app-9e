/**
 * Box Folders Handler
 */

import { BoxIntegration, BoxFolder, BoxDataHandler, BoxEntry } from '../types'
import { validateBoxIntegration, validateBoxToken, makeBoxApiRequest, parseBoxApiResponse, buildBoxApiUrl, createFolderItemsQueryParams } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getBoxFolders: BoxDataHandler<BoxFolder> = async (integration: BoxIntegration, options: any = {}): Promise<BoxFolder[]> => {
  logger.debug("🔍 Box folders fetcher called with integration:", {
    id: integration.id,
    provider: integration.provider,
    hasToken: !!integration.access_token,
    tokenLength: integration.access_token?.length
  })
  
  try {
    // Validate integration status
    validateBoxIntegration(integration)
    
    logger.debug(`🔍 Validating Box token...`)
    const tokenResult = await validateBoxToken(integration)
    
    if (!tokenResult.success) {
      logger.debug(`❌ Box token validation failed: ${tokenResult.error}`)
      throw new Error(tokenResult.error || "Authentication failed")
    }
    
    logger.debug('🔍 Fetching Box folders...')
    
    const { folderId = '0' } = options
    const queryParams = createFolderItemsQueryParams(options)
    const apiUrl = buildBoxApiUrl(`/folders/${folderId}/items?${queryParams}`)
    
    const response = await makeBoxApiRequest(apiUrl, tokenResult.token!)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      logger.error(`❌ Box API error: ${response.status}`, errorData)
      
      if (response.status === 401) {
        throw new Error('Box authentication expired. Please reconnect your account.')
      } else {
        throw new Error(`Box API error: ${response.status} - ${errorData.message || "Unknown error"}`)
      }
    }
    
    const data = await response.json()
    
    // Filter and transform folders
    const folders = (data.entries || [])
      .filter((entry: BoxEntry) => entry.type === "folder")
      .map((folder: BoxEntry) => ({
        id: folder.id,
        name: folder.name,
        value: folder.id,
        type: folder.type,
        created_time: folder.created_at || null,
        modified_time: folder.modified_at || null,
        etag: folder.etag,
        sequence_id: folder.sequence_id
      }))
    
    // Add root folder as an option if we're at the root level
    if (folderId === '0') {
      folders.unshift({
        id: "0",
        name: "Box (Root)",
        value: "0",
        type: "folder",
        created_time: null,
        modified_time: null
      })
    }
    
    logger.debug(`✅ Box folders fetched successfully: ${folders.length} folders`)
    return folders
    
  } catch (error: any) {
    logger.error("Error fetching Box folders:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Box authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Box API rate limit exceeded. Please try again later.')
    }
    
    // Return just the root folder as a fallback
    logger.debug('🔄 Returning root folder as fallback...')
    return [
      {
        id: "0",
        name: "Box (Root)",
        value: "0",
        type: "folder",
        created_time: null,
        modified_time: null
      }
    ]
  }
}