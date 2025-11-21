import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../../executeNode'
import {
  postTwitterTweet,
  replyTwitterTweet,
  retweetTwitterTweet,
  unretweetTwitterTweet,
  likeTwitterTweet,
  unlikeTwitterTweet,
  sendTwitterDM,
  followTwitterUser,
  unfollowTwitterUser,
  deleteTwitterTweet,
  searchTwitterTweets,
  getTwitterUserTimeline,
  getTwitterMentions
} from './index'

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
 * Wrapper for post tweet action
 */
export async function postTweetHandler(config: any, userId: string, input: any): Promise<ActionResult> {
  const accessToken = await getDecryptedAccessToken(userId, "twitter")
  const resolvedConfig = resolveValue(config, input)
  return postTwitterTweet(accessToken, resolvedConfig, input)
}

/**
 * Wrapper for reply tweet action
 */
export async function replyTweetHandler(config: any, userId: string, input: any): Promise<ActionResult> {
  const accessToken = await getDecryptedAccessToken(userId, "twitter")
  const resolvedConfig = resolveValue(config, input)
  return replyTwitterTweet(accessToken, resolvedConfig, input)
}

/**
 * Wrapper for retweet action
 */
export async function retweetHandler(config: any, userId: string, input: any): Promise<ActionResult> {
  const accessToken = await getDecryptedAccessToken(userId, "twitter")
  const resolvedConfig = resolveValue(config, input)
  return retweetTwitterTweet(accessToken, resolvedConfig, input)
}

/**
 * Wrapper for unretweet action
 */
export async function unretweetHandler(config: any, userId: string, input: any): Promise<ActionResult> {
  const accessToken = await getDecryptedAccessToken(userId, "twitter")
  const resolvedConfig = resolveValue(config, input)
  return unretweetTwitterTweet(accessToken, resolvedConfig, input)
}

/**
 * Wrapper for like tweet action
 */
export async function likeTweetHandler(config: any, userId: string, input: any): Promise<ActionResult> {
  const accessToken = await getDecryptedAccessToken(userId, "twitter")
  const resolvedConfig = resolveValue(config, input)
  return likeTwitterTweet(accessToken, resolvedConfig, input)
}

/**
 * Wrapper for unlike tweet action
 */
export async function unlikeTweetHandler(config: any, userId: string, input: any): Promise<ActionResult> {
  const accessToken = await getDecryptedAccessToken(userId, "twitter")
  const resolvedConfig = resolveValue(config, input)
  return unlikeTwitterTweet(accessToken, resolvedConfig, input)
}

/**
 * Wrapper for send DM action
 */
export async function sendDMHandler(config: any, userId: string, input: any): Promise<ActionResult> {
  const accessToken = await getDecryptedAccessToken(userId, "twitter")
  const resolvedConfig = resolveValue(config, input)
  return sendTwitterDM(accessToken, resolvedConfig, input)
}

/**
 * Wrapper for follow user action
 */
export async function followUserHandler(config: any, userId: string, input: any): Promise<ActionResult> {
  const accessToken = await getDecryptedAccessToken(userId, "twitter")
  const resolvedConfig = resolveValue(config, input)
  return followTwitterUser(accessToken, resolvedConfig, input)
}

/**
 * Wrapper for unfollow user action
 */
export async function unfollowUserHandler(config: any, userId: string, input: any): Promise<ActionResult> {
  const accessToken = await getDecryptedAccessToken(userId, "twitter")
  const resolvedConfig = resolveValue(config, input)
  return unfollowTwitterUser(accessToken, resolvedConfig, input)
}

/**
 * Wrapper for delete tweet action
 */
export async function deleteTweetHandler(config: any, userId: string, input: any): Promise<ActionResult> {
  const accessToken = await getDecryptedAccessToken(userId, "twitter")
  const resolvedConfig = resolveValue(config, input)
  return deleteTwitterTweet(accessToken, resolvedConfig, input)
}

/**
 * Wrapper for search tweets action
 */
export async function searchTweetsHandler(config: any, userId: string, input: any): Promise<ActionResult> {
  const accessToken = await getDecryptedAccessToken(userId, "twitter")
  const resolvedConfig = resolveValue(config, input)
  return searchTwitterTweets(accessToken, resolvedConfig, input)
}

/**
 * Wrapper for get user timeline action
 */
export async function getUserTimelineHandler(config: any, userId: string, input: any): Promise<ActionResult> {
  const accessToken = await getDecryptedAccessToken(userId, "twitter")
  const resolvedConfig = resolveValue(config, input)
  return getTwitterUserTimeline(accessToken, resolvedConfig, input)
}

/**
 * Wrapper for get mentions action
 */
export async function getMentionsHandler(config: any, userId: string, input: any): Promise<ActionResult> {
  const accessToken = await getDecryptedAccessToken(userId, "twitter")
  const resolvedConfig = resolveValue(config, input)
  return getTwitterMentions(accessToken, resolvedConfig, input)
}