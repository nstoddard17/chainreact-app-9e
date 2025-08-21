/**
 * Facebook Data Handlers Registry
 */

import { FacebookDataHandler } from '../types'
import { getFacebookPages } from './pages'

export const facebookHandlers: Record<string, FacebookDataHandler> = {
  facebook_pages: getFacebookPages,
}

export {
  getFacebookPages,
}