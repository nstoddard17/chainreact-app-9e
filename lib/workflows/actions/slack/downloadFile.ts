/**
 * Slack Download File Action
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken, callSlackApi, getSlackErrorMessage } from './utils'

export async function downloadFile(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params
  try {
    const { fileId, workspace, asUser = false } = config
    if (!fileId) throw new Error('File ID is required')

    // If asUser is true, use the user token (xoxp-) instead of bot token (xoxb-)
    const useUserToken = asUser === true
    const accessToken = workspace
      ? await getSlackToken(workspace, true, useUserToken)
      : await getSlackToken(userId, false, useUserToken)

    // Get file info first
    const infoResult = await callSlackApi('files.info', accessToken, { file: fileId })
    if (!infoResult.ok) throw new Error(getSlackErrorMessage(infoResult.error))

    const file = infoResult.file
    const downloadUrl = file.url_private_download || file.url_private

    if (!downloadUrl) throw new Error('File has no download URL')

    // Download the file
    const response = await fetch(downloadUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })

    if (!response.ok) throw new Error(`Failed to download file: ${response.statusText}`)

    const buffer = await response.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')

    return {
      success: true,
      output: {
        success: true,
        fileId: file.id,
        fileName: file.name,
        fileType: file.filetype,
        mimeType: file.mimetype,
        size: file.size,
        content: `data:${file.mimetype};base64,${base64}`,
        url: file.url_private
      },
      message: `Downloaded: ${file.name}`
    }
  } catch (error: any) {
    logger.error('[Slack Download File] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionDownloadFile = downloadFile
