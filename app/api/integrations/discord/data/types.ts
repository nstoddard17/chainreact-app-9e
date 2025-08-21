/**
 * Discord Integration Types
 */

export interface DiscordIntegration {
  id: string
  user_id: string
  provider: 'discord'
  access_token: string
  refresh_token?: string
  status: string
  expires_at?: string | null
  scopes?: string[]
  metadata?: any
}

export interface DiscordGuild {
  id: string
  name: string
  value: string
  icon?: string
  owner?: boolean
  permissions?: string
  features?: string[]
  approximate_member_count?: number
  approximate_presence_count?: number
}

export interface DiscordChannel {
  id: string
  name: string
  value: string
  type: number
  guild_id?: string
  position?: number
  parent_id?: string
  topic?: string
  nsfw?: boolean
  permission_overwrites?: any[]
}

export interface DiscordCategory {
  id: string
  name: string
  value: string
  type: number
  guild_id?: string
  position?: number
  channels?: DiscordChannel[]
}

export interface DiscordMember {
  id: string
  name: string
  value: string
  user?: {
    id: string
    username: string
    discriminator: string
    avatar?: string
    bot?: boolean
  }
  nick?: string
  roles: string[]
  joined_at: string
  premium_since?: string
  deaf?: boolean
  mute?: boolean
}

export interface DiscordRole {
  id: string
  name: string
  value: string
  color: number
  hoist: boolean
  position: number
  permissions: string
  managed: boolean
  mentionable: boolean
  icon?: string
  unicode_emoji?: string
}

export interface DiscordMessage {
  id: string
  name: string
  value: string
  content: string
  author: {
    id: string
    username: string
    discriminator: string
    avatar?: string
  }
  timestamp: string
  edited_timestamp?: string
  tts: boolean
  mention_everyone: boolean
  mentions: any[]
  mention_roles: string[]
  attachments: any[]
  embeds: any[]
  reactions?: any[]
  pinned: boolean
  type: number
}

export interface DiscordUser {
  id: string
  name: string
  value: string
  username: string
  discriminator: string
  avatar?: string
  bot?: boolean
  system?: boolean
  mfa_enabled?: boolean
  verified?: boolean
  email?: string
  flags?: number
  premium_type?: number
  public_flags?: number
}

export interface DiscordReaction {
  id: string
  name: string
  value: string
  emoji: string
  emojiId?: string
  count: number
  me: boolean
  animated: boolean
}

export interface DiscordApiError extends Error {
  status?: number
  code?: string
}

export interface DiscordDataHandler<T = any> {
  (integration: DiscordIntegration, options?: any): Promise<T[]>
}

export interface DiscordHandlerOptions {
  [key: string]: any
}