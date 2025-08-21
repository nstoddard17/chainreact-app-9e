/**
 * Slack Data Handlers Registry
 */

import { SlackDataHandler } from '../types'
import { getSlackChannels } from './channels'
import { getSlackWorkspaces } from './workspaces'
import { getSlackUsers } from './users'

export const slackHandlers: Record<string, SlackDataHandler> = {
  slack_channels: getSlackChannels,
  slack_workspaces: getSlackWorkspaces,
  slack_users: getSlackUsers,
}

export {
  getSlackChannels,
  getSlackWorkspaces,
  getSlackUsers,
}