/**
 * Slack Data Handlers Registry
 */

import { SlackDataHandler } from '../types'
import { getSlackChannels } from './channels'
import { getSlackWorkspaces } from './workspaces'
import { getSlackUsers } from './users'
import { getSlackEmojiCatalog } from './emoji-catalog'

export const slackHandlers: Record<string, SlackDataHandler> = {
  slack_channels: getSlackChannels,
  slack_workspaces: getSlackWorkspaces,
  slack_users: getSlackUsers,
  slack_emoji_catalog: getSlackEmojiCatalog,
}

export {
  getSlackChannels,
  getSlackWorkspaces,
  getSlackUsers,
  getSlackEmojiCatalog,
}