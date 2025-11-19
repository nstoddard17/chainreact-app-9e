import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Create a new folder in OneDrive
 */
export async function createOnedriveFolder(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "onedrive")

    // Resolve dynamic values
    const folderName = context.dataFlowManager.resolveVariable(config.folderName)
    const parentFolderId = context.dataFlowManager.resolveVariable(config.parentFolderId)
    const description = context.dataFlowManager.resolveVariable(config.description)

    if (!folderName) {
      throw new Error("Folder name is required")
    }

    // Construct create folder URL
    let createUrl: string
    if (parentFolderId) {
      createUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${parentFolderId}/children`
    } else {
      createUrl = `https://graph.microsoft.com/v1.0/me/drive/root/children`
    }

    // Create folder payload
    const payload: any = {
      name: folderName,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'rename'
    }

    if (description) {
      payload.description = description
    }

    logger.debug('[OneDrive] Creating folder:', { folderName, parentFolderId })

    const response = await fetch(createUrl, {
      method: 'POST',
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

    const folder = await response.json()

    return {
      success: true,
      output: {
        id: folder.id,
        name: folder.name,
        webUrl: folder.webUrl,
        path: folder.parentReference?.path,
        createdTime: folder.createdDateTime
      },
      message: `Successfully created folder: ${folder.name}`
    }
  } catch (error: any) {
    logger.error('OneDrive Create Folder error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create folder in OneDrive'
    }
  }
}
