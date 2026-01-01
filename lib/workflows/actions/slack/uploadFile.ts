/**
 * Slack Upload File Action
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

    // Use files.uploadV2 API
    const formData = new FormData()

    // Handle content - could be base64, URL, or text
    if (content) {
      let blob: Blob
      if (content.startsWith('data:')) {
        // Base64 data URL
        const [header, base64] = content.split(',')
        const mimeType = header.match(/:(.*?);/)?.[1] || 'application/octet-stream'
        const binary = atob(base64)
        const array = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i)
        blob = new Blob([array], { type: mimeType })
      } else {
        // Plain text content
        blob = new Blob([content], { type: 'text/plain' })
      }
      formData.append('file', blob, filename || 'file.txt')
    }

    formData.append('channels', Array.isArray(channels) ? channels.join(',') : channels)
    if (filename) formData.append('filename', filename)
    if (title) formData.append('title', title)
    if (initialComment) formData.append('initial_comment', initialComment)
    if (filetype) formData.append('filetype', filetype)

    const response = await fetch('https://slack.com/api/files.upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}` },
      body: formData
    })

    const result = await response.json()
    if (!result.ok) throw new Error(`Slack API error: ${result.error}`)

    return {
      success: true,
      output: {
        success: true,
        fileId: result.file?.id,
        fileName: result.file?.name,
        fileUrl: result.file?.url_private,
        permalink: result.file?.permalink
      },
      message: `File uploaded: ${result.file?.name}`
    }
  } catch (error: any) {
    logger.error('[Slack Upload File] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionUploadFile = uploadFile
