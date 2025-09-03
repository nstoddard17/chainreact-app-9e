/**
 * Discord Data Handlers Registry
 */

import { DiscordDataHandler } from '../types'
import { getDiscordGuilds } from './guilds'
import { getDiscordChannels } from './channels'
import { getDiscordCategories } from './categories'
import { getDiscordMembers } from './members'
import { getDiscordChannelMembers } from './channel-members'
import { getDiscordRoles } from './roles'
import { getDiscordMessages } from './messages'
import { getDiscordReactions } from './reactions'
import { getDiscordBannedUsers } from './banned-users'
import { getDiscordUsers } from './users'

export const discordHandlers: Record<string, DiscordDataHandler> = {
  discord_guilds: getDiscordGuilds,
  discord_channels: getDiscordChannels,
  discord_categories: getDiscordCategories,
  discord_members: getDiscordMembers,
  discord_channel_members: getDiscordChannelMembers,
  discord_roles: getDiscordRoles,
  discord_messages: getDiscordMessages,
  discord_reactions: getDiscordReactions,
  discord_banned_users: getDiscordBannedUsers,
  discord_users: getDiscordUsers,
}

export {
  getDiscordGuilds,
  getDiscordChannels,
  getDiscordCategories,
  getDiscordMembers,
  getDiscordChannelMembers,
  getDiscordRoles,
  getDiscordMessages,
  getDiscordReactions,
  getDiscordBannedUsers,
  getDiscordUsers,
}