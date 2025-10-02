import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

/**
 * Get file from OneDrive
 */
export async function getOnedriveFile(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "onedrive")

    // Resolve dynamic values
    const fileId = context.dataFlowManager.resolveVariable(config.fileId)
    const downloadContent = context.dataFlowManager.resolveVariable(config.downloadContent) !== false

    if (!fileId) {
      throw new Error("File is required")
    }

    // Get file metadata
    const metadataResponse = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!metadataResponse.ok) {
      const errorText = await metadataResponse.text()
      throw new Error(`OneDrive API error: ${metadataResponse.status} - ${errorText}`)
    }

    const metadata = await metadataResponse.json()

    const output: any = {
      id: metadata.id,
      name: metadata.name,
      size: metadata.size,
      url: metadata['@microsoft.graph.downloadUrl'],
      mimeType: metadata.file?.mimeType,
      modifiedAt: metadata.lastModifiedDateTime
    }

    // Download content if requested
    if (downloadContent && metadata['@microsoft.graph.downloadUrl']) {
      const contentResponse = await fetch(metadata['@microsoft.graph.downloadUrl'])

      if (contentResponse.ok) {
        const buffer = await contentResponse.arrayBuffer()
        output.content = Buffer.from(buffer).toString('base64')
      }
    }

    return {
      success: true,
      output,
      message: `Successfully retrieved file: ${metadata.name}`
    }
  } catch (error: any) {
    console.error('OneDrive Get File error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to retrieve file from OneDrive'
    }
  }
}
