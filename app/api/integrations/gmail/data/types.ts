/**
 * Gmail Integration Types
 */

export interface GmailIntegration {
  id: string
  user_id: string
  provider: 'gmail'
  access_token: string
  refresh_token?: string
  status: string
  expires_at?: string | null
  scopes?: string[]
  metadata?: any
}

export interface GmailLabel {
  id: string
  name: string
  label: string // For dropdown compatibility
  value: string
  type: 'system' | 'user'
  messages_total?: number
  messages_unread?: number
}

export interface GmailMessage {
  id: string
  threadId: string
  labelIds: string[]
  snippet: string
  payload?: {
    headers: Array<{
      name: string
      value: string
    }>
  }
}

export interface EmailRecipient {
  value: string
  label: string
  email: string
  name?: string
  source: string
  frequency: number
  type?: string
  photo?: string
  aliases?: string[]
}

export interface GmailSignature {
  id: string
  content: string
  isDefault: boolean
}

export interface GmailApiError extends Error {
  status?: number
  code?: string
}

export interface GmailDataHandler<T = any> {
  (integration: GmailIntegration, options?: any): Promise<T[]>
}

export interface GmailHandlerOptions {
  [key: string]: any
}