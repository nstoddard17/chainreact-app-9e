/**
 * Google Analytics Data API Types
 */

export interface GoogleAnalyticsIntegration {
  id: string
  user_id: string
  provider: string
  status: 'connected' | 'disconnected' | 'error'
  access_token: string
  refresh_token?: string
  expires_at?: string
  created_at: string
  updated_at: string
}

export interface GoogleAnalyticsAccount {
  id: string
  name: string
  displayName: string
}

export interface GoogleAnalyticsProperty {
  id: string
  name: string
  displayName: string
  createTime?: string
  updateTime?: string
  industryCategory?: string
  timeZone?: string
}

export interface GoogleAnalyticsMeasurementId {
  id: string
  name: string
  measurementId: string
  propertyId: string
}

export interface GoogleAnalyticsConversionEvent {
  id: string
  name: string
  eventName: string
  counting_method?: string
  defaultValue?: number
}

export interface GoogleAnalyticsApiError extends Error {
  status?: number
  code?: string
}

export type GoogleAnalyticsDataHandler<T = any> = (
  integration: GoogleAnalyticsIntegration,
  options?: any
) => Promise<T>
