/**
 * Facebook Data Handlers Registry
 */

import { FacebookDataHandler } from '../types'
import { getFacebookPages } from './pages'
import { getFacebookGroups } from './groups'
import { getFacebookPosts } from './posts'

export const facebookHandlers: Record<string, FacebookDataHandler> = {
  facebook_pages: getFacebookPages,
  facebook_groups: getFacebookGroups,
  facebook_posts: getFacebookPosts,
}

export {
  getFacebookPages,
  getFacebookGroups,
  getFacebookPosts,
}