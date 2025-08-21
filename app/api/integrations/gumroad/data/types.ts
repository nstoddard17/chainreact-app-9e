/**
 * Gumroad Integration Types
 */

export interface GumroadIntegration {
  id: string
  user_id: string
  provider: 'gumroad'
  access_token: string
  refresh_token?: string
  status: string
  expires_at?: string | null
  scopes?: string[]
  metadata?: any
}

export interface GumroadProduct {
  id: string
  name: string
  description?: string
  price: number
  value: string
  label: string
  url?: string
  currency?: string
  published?: boolean
  max_purchase_count?: number
  sales_count?: number
  tags?: string[]
}

export interface GumroadApiError extends Error {
  status?: number
  code?: string
}

export interface GumroadDataHandler<T = any> {
  (integration: GumroadIntegration, options?: any): Promise<T[]>
}

export interface GumroadHandlerOptions {
  [key: string]: any
}