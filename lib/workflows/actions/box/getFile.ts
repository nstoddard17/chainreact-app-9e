import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

/**
 * Get file from Box
 */
export async function getBoxFile(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "box")

    // Resolve dynamic values
    const fileId = context.dataFlowManager.resolveVariable(config.fileId)
    const downloadContent = context.dataFlowManager.resolveVariable(config.downloadContent) !== false

    if (!fileId) {
      throw new Error("File is required")
    }

    // Get file metadata
    const metadataResponse = await fetch(`https://api.box.com/2.0/files/${fileId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!metadataResponse.ok) {
      const errorText = await metadataResponse.text()
      throw new Error(`Box API error: ${metadataResponse.status} - ${errorText}`)
    }

    const metadata = await metadataResponse.json()

    const output: any = {
      id: metadata.id,
      name: metadata.name,
      size: metadata.size,
      url: metadata.shared_link?.url,
      mimeType: metadata.mime_type,
      modifiedAt: metadata.modified_at
    }

    // Download content if requested
    if (downloadContent) {
      const downloadResponse = await fetch(`https://api.box.com/2.0/files/${fileId}/content`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      })

      if (downloadResponse.ok) {
        const buffer = await downloadResponse.arrayBuffer()
        output.content = Buffer.from(buffer).toString('base64')
      }
    }

    return {
      success: true,
      output,
      message: `Successfully retrieved file: ${metadata.name}`
    }
  } catch (error: any) {
    console.error('Box Get File error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to retrieve file from Box'
    }
  }
}
