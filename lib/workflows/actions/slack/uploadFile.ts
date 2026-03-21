/**
 * Slack Upload File Action
 * Uses the new files.getUploadURLExternal + files.completeUploadExternal flow
 * (files.upload was deprecated by Slack)
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken } from './utils'

export async function uploadFile(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params
  try {
    const { channels, content, filename, title, initialComment, filetype } = config
    if (!channels) throw new Error('Channel(s) required')
    if (!content && !filename) throw new Error('File content or filename required')

    const accessToken = await getSlackToken(userId)

    // Prepare file content as a Buffer/Blob
    let fileBlob: Blob
    let finalFilename = filename || 'file.txt'

    if (content) {
      if (content.startsWith('data:')) {
        // Base64 data URL
        const [header, base64] = content.split(',')
        const mimeType = header.match(/:(.*?);/)?.[1] || 'application/octet-stream'
        const binary = atob(base64)
        const array = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i)
        fileBlob = new Blob([array], { type: mimeType })
      } else {
        // Plain text content
        fileBlob = new Blob([content], { type: 'text/plain' })
      }
    } else {
      throw new Error('File content is required')
    }

    const fileSize = fileBlob.size

    // Step 1: Get an upload URL from Slack
    const uploadUrlParams = new URLSearchParams({
      filename: finalFilename,
      length: String(fileSize),
    })
    if (filetype) uploadUrlParams.append('snippet_type', filetype)

    const urlResponse = await fetch(`https://slack.com/api/files.getUploadURLExternal?${uploadUrlParams}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })

    const urlResult = await urlResponse.json()
    if (!urlResult.ok) throw new Error(`Slack API error: ${urlResult.error}`)

    const { upload_url, file_id } = urlResult

    // Step 2: Upload the file content to the provided URL
    const uploadResponse = await fetch(upload_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: fileBlob,
    })

    if (!uploadResponse.ok) {
      throw new Error(`File upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`)
    }

    // Step 3: Complete the upload and share to channels
    const channelList = Array.isArray(channels) ? channels.join(',') : channels
    const completeBody: any = {
      files: [{ id: file_id, title: title || finalFilename }],
      channel_id: channelList,
    }
    if (initialComment) {
      completeBody.initial_comment = initialComment
    }

    const completeResponse = await fetch('https://slack.com/api/files.completeUploadExternal', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(completeBody),
    })

    const completeResult = await completeResponse.json()
    if (!completeResult.ok) throw new Error(`Slack API error: ${completeResult.error}`)

    const uploadedFile = completeResult.files?.[0]

    return {
      success: true,
      output: {
        success: true,
        fileId: uploadedFile?.id || file_id,
        fileName: uploadedFile?.name || finalFilename,
        fileUrl: uploadedFile?.url_private,
        permalink: uploadedFile?.permalink,
      },
      message: `File uploaded: ${uploadedFile?.name || finalFilename}`
    }
  } catch (error: any) {
    logger.error('[Slack Upload File] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionUploadFile = uploadFile
