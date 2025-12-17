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
    const resolvedMaxWait = context.dataFlowManager.resolveVariable(config.maxWaitMs)
    const maxWaitMs = typeof resolvedMaxWait === 'number'
      ? resolvedMaxWait
      : resolvedMaxWait
        ? Number(resolvedMaxWait)
        : 30000 // default to 30 seconds

    // Option to not wait for completion - just initiate and return success
    // Default is false (don't wait) to prevent blocking downstream workflow nodes
    const waitForCompletion = context.dataFlowManager.resolveVariable(config.waitForCompletion) === true

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

    // Get source item details to know its name
    const sourceItemResponse = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${sourceItemId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (!sourceItemResponse.ok) {
      const errorText = await sourceItemResponse.text()
      throw new Error(`Failed to get source item details: ${sourceItemResponse.status} - ${errorText}`)
    }

    const sourceItem = await sourceItemResponse.json()
    const sourceName = sourceItem.name

    // Build copy request payload
    // Note: Copy API doesn't support @microsoft.graph.conflictBehavior
    // We need to handle conflicts manually
    const payload: any = {}

    // Set destination parent reference
    // Handle 'root' as special value meaning the root folder
    if (destinationFolderId && destinationFolderId !== 'root') {
      payload.parentReference = {
        id: destinationFolderId
      }
    } else {
      // Copy to root (either no destination or 'root' was explicitly selected)
      payload.parentReference = {
        path: '/drive/root:'
      }
    }

    // Set new name if provided, otherwise use source name
    let targetName = newName || sourceName

    // If conflictBehavior is 'rename', we need to check for conflicts and generate unique name
    if (conflictBehavior === 'rename') {
      // Check if item with same name exists in destination
      const destPath = destinationFolderId && destinationFolderId !== 'root'
        ? `items/${destinationFolderId}/children`
        : 'root/children'

      const checkUrl = `https://graph.microsoft.com/v1.0/me/drive/${destPath}?$filter=name eq '${encodeURIComponent(targetName)}'`

      try {
        const checkResponse = await fetch(checkUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        })

        if (checkResponse.ok) {
          const checkData = await checkResponse.json()
          if (checkData.value && checkData.value.length > 0) {
            // Name conflict - generate unique name
            const timestamp = Date.now()
            const nameParts = targetName.split('.')
            if (nameParts.length > 1 && !sourceItem.folder) {
              // File with extension: insert timestamp before extension
              const ext = nameParts.pop()
              targetName = `${nameParts.join('.')}_copy_${timestamp}.${ext}`
            } else {
              // Folder or file without extension
              targetName = `${targetName}_copy_${timestamp}`
            }
          }
        }
      } catch {
        // If check fails, just try with original name and let it fail if needed
      }
    }

    payload.name = targetName

    logger.debug('[OneDrive] Copying item:', {
      sourceId: sourceItemId,
      sourceName,
      targetName,
      destinationFolderId,
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

    // If user doesn't want to wait, return success immediately
    // The copy was accepted by OneDrive and will complete in the background
    if (!waitForCompletion) {
      logger.debug('[OneDrive] Copy initiated, not waiting for completion')
      return {
        success: true,
        output: {
          status: 'initiated',
          monitorUrl: monitorUrl || null,
          message: 'Copy operation initiated successfully. It will complete in the background.'
        },
        message: `Copy operation initiated for ${itemType}. The operation will complete in the background.`
      }
    }

    if (!monitorUrl) {
      // No monitor URL but also not waiting - treat as success
      return {
        success: true,
        output: {
          status: 'initiated',
          message: 'Copy operation initiated. No monitor URL returned.'
        },
        message: `Copy operation initiated for ${itemType}.`
      }
    }

    // Poll the monitor URL (with timeout)
    let copyResult: any = null
    const startTime = Date.now()
    let delayMs = 1000
    const maxDelayMs = 10000
    const deadline = startTime + maxWaitMs

    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, delayMs))

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
        } else if (monitorData.status === 'inProgress' || monitorData.status === 'running') {
          delayMs = Math.min(delayMs * 1.5, maxDelayMs)
          continue
        } else if (monitorData.status === 'failed') {
          throw new Error('Copy operation failed')
        }
      } else if (monitorResponse.status === 202) {
        delayMs = Math.min(delayMs * 1.5, maxDelayMs)
        continue
      }
    }

    // If we timed out but the operation was accepted, return success with "in_progress" status
    // This prevents blocking downstream nodes in the workflow
    if (!copyResult) {
      const elapsedSeconds = Math.round((Date.now() - startTime) / 1000)
      logger.debug(`[OneDrive] Copy still in progress after ${elapsedSeconds}s, returning success anyway`)
      return {
        success: true,
        output: {
          status: 'in_progress',
          monitorUrl,
          elapsedSeconds,
          message: `Copy operation is still in progress after ${elapsedSeconds}s. It will complete in the background.`
        },
        message: `Copy operation in progress for ${itemType}. It will complete in the background.`
      }
    }

    return {
      success: true,
      output: {
        status: 'completed',
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
