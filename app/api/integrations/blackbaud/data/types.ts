/**
 * Blackbaud Integration Types
 */

export interface BlackbaudIntegration {
  id: string
  user_id: string
  provider: 'blackbaud'
  access_token: string
  refresh_token?: string
  status: string
  expires_at?: string | null
  scopes?: string[]
  metadata?: any
}

export interface BlackbaudConstituent {
  id: string
  first_name: string
  last_name: string
  email_address: string
  type: string
  value: string
  label: string
  description: string
  phone?: string
  address?: any
  birth_date?: string
  marital_status?: string
  gender?: string
}

export interface BlackbaudApiError extends Error {
  status?: number
  code?: string
}

export interface BlackbaudDataHandler<T = any> {
  (integration: BlackbaudIntegration, options?: any): Promise<T[]>
}

export interface BlackbaudHandlerOptions {
  limit?: number
  offset?: number
  [key: string]: any
}