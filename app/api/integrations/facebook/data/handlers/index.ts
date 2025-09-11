/**
 * Facebook Data Handlers Registry
 */

import { FacebookDataHandler } from '../types'
import { getFacebookPages } from './pages'
import { getFacebookGroups } from './groups'

export const facebookHandlers: Record<string, FacebookDataHandler> = {
  facebook_pages: getFacebookPages,
  facebook_groups: getFacebookGroups,
}

export {
  getFacebookPages,
  getFacebookGroups,
}