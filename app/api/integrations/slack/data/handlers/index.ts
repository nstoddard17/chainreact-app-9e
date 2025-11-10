/**
 * Slack Data Handlers Registry
 */

import { SlackDataHandler } from '../types'
import { getSlackChannels, getSlackPublicChannels, getSlackPrivateChannels } from './channels'
import { getSlackWorkspaces } from './workspaces'
import { getSlackUsers } from './users'
import { getSlackEmojiCatalog } from './emoji-catalog'
import { getSlackFiles } from './files'

export const slackHandlers: Record<string, SlackDataHandler> = {
  slack_channels: getSlackChannels,
  slack_public_channels: getSlackPublicChannels,
  slack_private_channels: getSlackPrivateChannels,
  slack_workspaces: getSlackWorkspaces,
  slack_users: getSlackUsers,
  slack_emoji_catalog: getSlackEmojiCatalog,
  slack_files: getSlackFiles,
}

export {
  getSlackChannels,
  getSlackPublicChannels,
  getSlackPrivateChannels,
  getSlackWorkspaces,
  getSlackUsers,
  getSlackEmojiCatalog,
  getSlackFiles,
}