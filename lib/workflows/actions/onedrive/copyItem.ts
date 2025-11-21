import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Copy a file or folder to a new location in OneDrive
 */
export async function copyOnedriveItem(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "onedrive")

    // Resolve dynamic values
    const itemType = context.dataFlowManager.resolveVariable(config.itemType) || 'file'
    const sourceFileId = context.dataFlowManager.resolveVariable(config.sourceFileId)
    const sourceFolderIdToCopy = context.dataFlowManager.resolveVariable(config.sourceFolderIdToCopy)
    const destinationFolderId = context.dataFlowManager.resolveVariable(config.destinationFolderId)
    const newName = context.dataFlowManager.resolveVariable(config.newName)
    const conflictBehavior = context.dataFlowManager.resolveVariable(config.conflictBehavior) || 'rename'

    // Determine which item to copy
    let sourceItemId: string | null = null
    if (itemType === 'file' && sourceFileId) {
      sourceItemId = sourceFileId
    } else if (itemType === 'folder' && sourceFolderIdToCopy) {
      sourceItemId = sourceFolderIdToCopy
    }

    if (!sourceItemId) {
      throw new Error("Please select an item to copy")
    }

    // Build copy request payload
    const payload: any = {
      '@microsoft.graph.conflictBehavior': conflictBehavior
    }

    // Set destination parent reference
    if (destinationFolderId) {
      payload.parentReference = {
        id: destinationFolderId
      }
    } else {
      // Copy to root
      payload.parentReference = {
        path: '/drive/root:'
      }
    }

    // Set new name if provided
    if (newName) {
      payload.name = newName
    }

    logger.debug('[OneDrive] Copying item:', {
      sourceId: sourceItemId,
      destinationFolderId,
      newName,
      conflictBehavior
    })

    const copyUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${sourceItemId}/copy`

    const response = await fetch(copyUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'respond-async'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OneDrive API error: ${response.status} - ${errorText}`)
    }

    // The copy operation returns 202 Accepted and a monitor URL
    // For simplicity, we'll poll the monitor URL to get the final result
    const monitorUrl = response.headers.get('Location')

    if (!monitorUrl) {
      throw new Error('No monitor URL returned from copy operation')
    }

    // Poll the monitor URL (with timeout)
    let attempts = 0
    const maxAttempts = 30 // 30 seconds max
    let copyResult: any = null

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second

      const monitorResponse = await fetch(monitorUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      })

      if (monitorResponse.ok) {
        const monitorData = await monitorResponse.json()

        if (monitorData.status === 'completed') {
          copyResult = monitorData.resourceId
            ? await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${monitorData.resourceId}`, {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${accessToken}`
                }
              }).then(r => r.json())
            : monitorData

          break
        } else if (monitorData.status === 'failed') {
          throw new Error('Copy operation failed')
        }
      }

      attempts++
    }

    if (!copyResult) {
      throw new Error('Copy operation timed out')
    }

    return {
      success: true,
      output: {
        id: copyResult.id,
        name: copyResult.name,
        type: copyResult.folder ? 'folder' : 'file',
        webUrl: copyResult.webUrl,
        path: copyResult.parentReference?.path,
        size: copyResult.size || 0,
        createdTime: copyResult.createdDateTime
      },
      message: `Successfully copied ${itemType}: ${copyResult.name}`
    }
  } catch (error: any) {
    logger.error('OneDrive Copy Item error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to copy item in OneDrive'
    }
  }
}
