/**
 * Slack Get File Info Action
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken, callSlackApi, getSlackErrorMessage } from './utils'

export async function getFileInfo(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params
  try {
    const { fileId, fileIdManual, fileSource, workspace, asUser = false, includeComments = false } = config

    // Determine which file ID to use based on the source selection
    const finalFileId = fileSource === 'manual' ? fileIdManual : fileId
    if (!finalFileId) throw new Error('File ID is required. Please select a file or enter a file ID manually.')

    // If asUser is true, use the user token (xoxp-) instead of bot token (xoxb-)
    const useUserToken = asUser === true
    const accessToken = workspace
      ? await getSlackToken(workspace, true, useUserToken)
      : await getSlackToken(userId, false, useUserToken)

    const payload: any = { file: finalFileId }
    if (includeComments) {
      payload.count = 100 // Get up to 100 comments
    }

    const result = await callSlackApi('files.info', accessToken, payload)

    if (!result.ok) throw new Error(getSlackErrorMessage(result.error, result))

    const f = result.file
    return {
      success: true,
      output: {
        success: true,
        fileId: f.id,
        fileName: f.name,
        title: f.title,
        fileType: f.filetype,
        mimeType: f.mimetype,
        fileSize: f.size,
        urlPrivate: f.url_private,
        urlPrivateDownload: f.url_private_download,
        permalink: f.permalink,
        created: f.created ? new Date(f.created * 1000).toISOString() : undefined,
        uploaderId: f.user,
        channels: f.channels || [],
        isPublic: f.is_public,
        isExternal: f.is_external,
        commentsCount: f.num_comments || 0,
        comments: includeComments ? (result.comments || []) : []
      },
      message: `Retrieved info for ${f.name}`
    }
  } catch (error: any) {
    logger.error('[Slack Get File Info] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionGetFileInfo = getFileInfo
