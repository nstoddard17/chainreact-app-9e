import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../../executeNode'
import { uploadYouTubeVideo, listYouTubeVideos } from './index'

/**
 * Helper function to resolve templated values
 */
function resolveValue(value: any, input: Record<string, any>): any {
  if (typeof value !== "string") return value
  const match = value.match(/^{{(.*)}}$/)
  if (match) {
    const key = match[1]
    // Basic key access, e.g., {{data.field}}
    return key.split(".").reduce((acc: any, part: any) => acc && acc[part], input)
  }
  return value
}

/**
 * Wrapper for upload video action
 */
export async function uploadVideoHandler(config: any, userId: string, input: any): Promise<ActionResult> {
  const accessToken = await getDecryptedAccessToken(userId, "youtube")
  const resolvedConfig = resolveValue(config, { input })
  return uploadYouTubeVideo(accessToken, resolvedConfig, input)
}

/**
 * Wrapper for list videos action
 */
export async function listVideosHandler(config: any, userId: string, input: any): Promise<ActionResult> {
  const accessToken = await getDecryptedAccessToken(userId, "youtube")
  const resolvedConfig = resolveValue(config, { input })
  return listYouTubeVideos(accessToken, resolvedConfig, input)
}