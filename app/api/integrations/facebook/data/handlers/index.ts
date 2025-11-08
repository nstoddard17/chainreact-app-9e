/**
 * Facebook Data Handlers Registry
 */

import { FacebookDataHandler } from '../types'
import { getFacebookPages } from './pages'
import { getFacebookGroups } from './groups'
import { getFacebookPosts } from './posts'
import { getFacebookConversations } from './conversations'
import { getFacebookAlbums } from './albums'
import { getMonetizationEligibility } from './monetizationEligibility'

export const facebookHandlers: Record<string, FacebookDataHandler> = {
  facebook_pages: getFacebookPages,
  facebook_groups: getFacebookGroups,
  facebook_posts: getFacebookPosts,
  facebook_conversations: getFacebookConversations,
  facebook_albums: getFacebookAlbums,
  facebook_monetization_eligibility: getMonetizationEligibility,
}

export {
  getFacebookPages,
  getFacebookGroups,
  getFacebookPosts,
  getFacebookConversations,
  getFacebookAlbums,
  getMonetizationEligibility,
}