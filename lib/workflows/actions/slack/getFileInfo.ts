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
    const { fileId } = config
    if (!fileId) throw new Error('File ID is required')

    const accessToken = await getSlackToken(userId)
    const result = await callSlackApi('files.info', accessToken, { file: fileId })

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
        size: f.size,
        url: f.url_private,
        downloadUrl: f.url_private_download,
        permalink: f.permalink,
        created: f.created,
        user: f.user,
        channels: f.channels,
        isPublic: f.is_public
      },
      message: `Retrieved info for ${f.name}`
    }
  } catch (error: any) {
    logger.error('[Slack Get File Info] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionGetFileInfo = getFileInfo
