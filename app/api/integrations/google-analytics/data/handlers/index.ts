/**
 * Google Analytics Data Handlers
 */

import { getGoogleAnalyticsAccounts } from './accounts'
import { getGoogleAnalyticsProperties } from './properties'
import { getGoogleAnalyticsMeasurementIds } from './measurementIds'
import { getGoogleAnalyticsConversionEvents } from './conversionEvents'
import { GoogleAnalyticsDataHandler } from '../types'

export const googleAnalyticsHandlers: Record<string, GoogleAnalyticsDataHandler> = {
  'google-analytics_accounts': getGoogleAnalyticsAccounts,
  'google-analytics_properties': getGoogleAnalyticsProperties,
  'google-analytics_measurement_ids': getGoogleAnalyticsMeasurementIds,
  'google-analytics_conversion_events': getGoogleAnalyticsConversionEvents,
}

export function isGoogleAnalyticsDataTypeSupported(dataType: string): boolean {
  return dataType in googleAnalyticsHandlers
}

export function getAvailableGoogleAnalyticsDataTypes(): string[] {
  return Object.keys(googleAnalyticsHandlers)
}
