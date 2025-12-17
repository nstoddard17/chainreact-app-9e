import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Delete a file or folder from OneDrive
 */
export async function deleteOnedriveItem(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "onedrive")

    // Resolve dynamic values
    const itemType = context.dataFlowManager.resolveVariable(config.itemType) || 'file'
    const fileId = context.dataFlowManager.resolveVariable(config.fileId)
    const folderIdToDelete = context.dataFlowManager.resolveVariable(config.folderIdToDelete)
    const itemId = context.dataFlowManager.resolveVariable(config.itemId)
    const permanentDelete = context.dataFlowManager.resolveVariable(config.permanentDelete) === true

    // Determine which item to delete
    // Note: 'root' is a virtual folder ID - cannot delete the root folder
    let targetItemId: string | null = null
    if (itemId && itemId !== 'root') {
      targetItemId = itemId
    } else if (itemType === 'file' && fileId) {
      targetItemId = fileId
    } else if (itemType === 'folder' && folderIdToDelete && folderIdToDelete !== 'root') {
      targetItemId = folderIdToDelete
    }

    // Check if user tried to select root folder
    if (itemId === 'root' || folderIdToDelete === 'root') {
      throw new Error("Cannot delete the root folder")
    }

    if (!targetItemId) {
      throw new Error("Please select an item to delete or provide an item ID")
    }

    // Get item details first for the response
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

    const itemDetails = await itemResponse.json()

    logger.debug('[OneDrive] Deleting item:', {
      id: targetItemId,
      name: itemDetails.name,
      permanent: permanentDelete
    })

    // Delete the item
    const deleteUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${targetItemId}`

    const deleteResponse = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    // 204 No Content is the success response for delete
    if (!deleteResponse.ok && deleteResponse.status !== 204) {
      const errorText = await deleteResponse.text()
      throw new Error(`OneDrive API error: ${deleteResponse.status} - ${errorText}`)
    }

    return {
      success: true,
      output: {
        success: true,
        deletedId: targetItemId,
        deletedName: itemDetails.name,
        deletedAt: new Date().toISOString()
      },
      message: `Successfully deleted ${itemType}: ${itemDetails.name}`
    }
  } catch (error: any) {
    logger.error('OneDrive Delete Item error:', error)
    return {
      success: false,
      output: {
        success: false
      },
      message: error.message || 'Failed to delete item from OneDrive'
    }
  }
}
