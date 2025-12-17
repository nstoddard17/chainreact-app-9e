import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Move a file or folder to a new location in OneDrive
 */
export async function moveOnedriveItem(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "onedrive")

    // Resolve dynamic values
    const itemType = context.dataFlowManager.resolveVariable(config.itemType) || 'file'
    const sourceFileId = context.dataFlowManager.resolveVariable(config.sourceFileId)
    const sourceFolderIdToMove = context.dataFlowManager.resolveVariable(config.sourceFolderIdToMove)
    const destinationFolderId = context.dataFlowManager.resolveVariable(config.destinationFolderId)
    const newName = context.dataFlowManager.resolveVariable(config.newName)
    const conflictBehavior = context.dataFlowManager.resolveVariable(config.conflictBehavior) || 'rename'

    // Determine which item to move
    let sourceItemId: string | null = null
    if (itemType === 'file' && sourceFileId) {
      sourceItemId = sourceFileId
    } else if (itemType === 'folder' && sourceFolderIdToMove) {
      sourceItemId = sourceFolderIdToMove
    }

    if (!sourceItemId) {
      throw new Error("Please select an item to move")
    }

    // Build move request payload
    const payload: any = {
      '@microsoft.graph.conflictBehavior': conflictBehavior
    }

    // Set destination parent reference
    // Handle 'root' as special value meaning the root folder
    if (destinationFolderId && destinationFolderId !== 'root') {
      payload.parentReference = {
        id: destinationFolderId
      }
    } else {
      // Move to root (either no destination or 'root' was explicitly selected)
      payload.parentReference = {
        path: '/drive/root:'
      }
    }

    // Set new name if provided
    if (newName) {
      payload.name = newName
    }

    logger.debug('[OneDrive] Moving item:', {
      sourceId: sourceItemId,
      destinationFolderId,
      newName,
      conflictBehavior
    })

    const moveUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${sourceItemId}`

    const response = await fetch(moveUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OneDrive API error: ${response.status} - ${errorText}`)
    }

    const movedItem = await response.json()

    return {
      success: true,
      output: {
        id: movedItem.id,
        name: movedItem.name,
        type: movedItem.folder ? 'folder' : 'file',
        webUrl: movedItem.webUrl,
        path: movedItem.parentReference?.path,
        size: movedItem.size || 0,
        modifiedTime: movedItem.lastModifiedDateTime
      },
      message: `Successfully moved ${itemType}: ${movedItem.name}`
    }
  } catch (error: any) {
    logger.error('OneDrive Move Item error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to move item in OneDrive'
    }
  }
}
