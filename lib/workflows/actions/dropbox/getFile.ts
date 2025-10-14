import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * Get file from Dropbox
 */
export async function getDropboxFile(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "dropbox")

    // Resolve dynamic values
    const filePath = context.dataFlowManager.resolveVariable(config.filePath)
    const downloadContent = context.dataFlowManager.resolveVariable(config.downloadContent) !== false

    if (!filePath) {
      throw new Error("File is required")
    }

    // Get file metadata
    const metadataResponse = await fetch('https://api.dropboxapi.com/2/files/get_metadata', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        path: filePath
      })
    })

    if (!metadataResponse.ok) {
      const errorText = await metadataResponse.text()
      throw new Error(`Dropbox API error: ${metadataResponse.status} - ${errorText}`)
    }

    const metadata = await metadataResponse.json()

    const output: any = {
      id: metadata.id,
      name: metadata.name,
      size: metadata.size,
      path: metadata.path_display,
      modifiedAt: metadata.client_modified
    }

    // Get shareable URL
    try {
      const shareResponse = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: filePath,
          settings: {
            requested_visibility: 'public'
          }
        })
      })

      if (shareResponse.ok) {
        const shareData = await shareResponse.json()
        output.shareableUrl = shareData.url
      }
    } catch (e) {
      // Ignore share errors
    }

    // Download content if requested
    if (downloadContent) {
      const downloadResponse = await fetch('https://content.dropboxapi.com/2/files/download', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Dropbox-API-Arg': JSON.stringify({ path: filePath })
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
    logger.error('Dropbox Get File error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to retrieve file from Dropbox'
    }
  }
}
