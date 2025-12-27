import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Rename a file or folder in OneDrive
 */
export async function renameOnedriveItem(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "onedrive")

    // Resolve dynamic values
    const itemType = context.dataFlowManager.resolveVariable(config.itemType) || 'file'
    const fileId = context.dataFlowManager.resolveVariable(config.fileId)
    const folderIdToRename = context.dataFlowManager.resolveVariable(config.folderIdToRename)
    const newName = context.dataFlowManager.resolveVariable(config.newName)

    if (!newName) {
      throw new Error("New name is required")
    }

    // Determine which item to rename
    // Note: 'root' is a virtual folder ID - cannot rename the root folder
    let targetItemId: string | null = null
    if (itemType === 'file' && fileId) {
      targetItemId = fileId
    } else if (itemType === 'folder' && folderIdToRename && folderIdToRename !== 'root') {
      targetItemId = folderIdToRename
    }

    // Check if user tried to select root folder
    if (folderIdToRename === 'root') {
      throw new Error("Cannot rename the root folder")
    }

    if (!targetItemId) {
      throw new Error("Please select an item to rename")
    }

    // Get old name first
    const itemResponse = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${targetItemId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!itemResponse.ok) {
      const errorText = await itemResponse.text()
      throw new Error(`Failed to get item details: ${itemResponse.status} - ${errorText}`)
    }

    const oldItemDetails = await itemResponse.json()
    const oldName = oldItemDetails.name

    logger.debug('[OneDrive] Renaming item:', {
      id: targetItemId,
      oldName,
      newName
    })

    // Rename the item
    const renameUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${targetItemId}`

    const response = await fetch(renameUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: newName
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OneDrive API error: ${response.status} - ${errorText}`)
    }

    const renamedItem = await response.json()

    return {
      success: true,
      output: {
        id: renamedItem.id,
        oldName,
        newName: renamedItem.name,
        type: renamedItem.folder ? 'folder' : 'file',
        webUrl: renamedItem.webUrl,
        path: renamedItem.parentReference?.path,
        modifiedTime: renamedItem.lastModifiedDateTime
      },
      message: `Successfully renamed ${itemType} from "${oldName}" to "${renamedItem.name}"`
    }
  } catch (error: any) {
    logger.error('OneDrive Rename Item error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to rename item in OneDrive'
    }
  }
}
