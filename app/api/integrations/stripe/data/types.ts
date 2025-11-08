/**
 * Stripe Integration Data Types
 */

export interface StripeIntegration {
  id: string
  user_id: string
  provider: string
  access_token: string
  refresh_token?: string
  status: string
  expires_at?: string
  created_at: string
  updated_at: string
}

export interface StripeCustomer {
  id: string
  value: string
  label: string
  email?: string
  name?: string
  description?: string
  metadata?: Record<string, any>
}

export interface StripeSubscription {
  id: string
  value: string
  label: string
  customer?: string
  status?: string
  current_period_end?: number
}

export type StripeDataHandler<T> = (
  integration: StripeIntegration,
  options?: any
) => Promise<T[]>
