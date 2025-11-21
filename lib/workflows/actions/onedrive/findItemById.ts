import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Find a specific item by ID in OneDrive
 */
export async function findOnedriveItemById(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "onedrive")

    // Resolve dynamic values
    const itemId = context.dataFlowManager.resolveVariable(config.itemId)
    const includeMetadata = context.dataFlowManager.resolveVariable(config.includeMetadata) !== false

    if (!itemId) {
      throw new Error("Item ID is required")
    }

    logger.debug('[OneDrive] Finding item by ID:', { itemId, includeMetadata })

    // Build URL with optional metadata expansion
    let itemUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`

    if (includeMetadata) {
      itemUrl += '?$expand=permissions,thumbnails,versions'
    }

    const response = await fetch(itemUrl, {
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

    const item = await response.json()

    const output: any = {
      id: item.id,
      name: item.name,
      type: item.folder ? 'folder' : 'file',
      webUrl: item.webUrl,
      path: item.parentReference?.path,
      size: item.size || 0,
      mimeType: item.file?.mimeType,
      createdTime: item.createdDateTime,
      modifiedTime: item.lastModifiedDateTime
    }

    // Add full metadata if requested
    if (includeMetadata) {
      output.metadata = {
        permissions: item.permissions,
        thumbnails: item.thumbnails,
        versions: item.versions,
        createdBy: item.createdBy,
        lastModifiedBy: item.lastModifiedBy,
        parentReference: item.parentReference,
        sharingLink: item.sharingLink
      }
    }

    return {
      success: true,
      output,
      message: `Successfully found item: ${item.name}`
    }
  } catch (error: any) {
    logger.error('OneDrive Find Item By ID error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to find item in OneDrive'
    }
  }
}
