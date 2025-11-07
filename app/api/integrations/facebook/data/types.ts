/**
 * Facebook Integration Types
 */

export interface FacebookIntegration {
  id: string
  user_id: string
  provider: 'facebook'
  access_token: string
  refresh_token?: string
  status: string
  expires_at?: string | null
  scopes?: string[]
  metadata?: any
}

export interface FacebookPage {
  id: string
  name: string
  value: string
  access_token: string
  category: string
  tasks: string[]
}

export interface FacebookPost {
  id: string
  message?: string
  created_time: string
  type: string
}

export interface FacebookApiError extends Error {
  status?: number
  code?: string
}

export interface FacebookDataHandler<T = any> {
  (integration: FacebookIntegration, options?: any): Promise<T[]>
}

export interface FacebookHandlerOptions {
  [key: string]: any
}