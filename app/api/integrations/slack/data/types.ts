/**
 * Slack Integration Types
 */

export interface SlackIntegration {
  id: string
  user_id: string
  provider: 'slack'
  access_token: string
  refresh_token?: string
  status: string
  expires_at?: string | null
  scopes?: string[]
  metadata?: any
}

export interface SlackChannel {
  id: string
  name: string
  value: string
  is_private?: boolean
  is_archived?: boolean
  is_member?: boolean
  topic?: {
    value: string
  }
  purpose?: {
    value: string
  }
}

export interface SlackWorkspace {
  id: string
  name: string
  value: string
  domain?: string
  url?: string
  icon?: {
    image_68?: string
  }
}

export interface SlackUser {
  id: string
  name: string
  value: string
  real_name?: string
  display_name?: string
  email?: string
  is_bot?: boolean
  is_app_user?: boolean
  profile?: {
    image_24?: string
    image_48?: string
    image_72?: string
  }
}

export interface SlackApiError extends Error {
  status?: number
  code?: string
}

export interface SlackDataHandler<T = any> {
  (integration: SlackIntegration, options?: any): Promise<T[]>
}

export interface SlackHandlerOptions {
  [key: string]: any
}