/**
 * Integration Reconnection Utility
 *
 * Handles integration reconnection when API returns needsReconnection error.
 * This ensures the UI shows the "Connect" button when an integration's status
 * is stale in the client-side store.
 */

import { logger } from '@/lib/utils/logger'

/**
 * Triggers a forced refresh of the integration store when an API error
 * indicates the integration needs reconnection.
 *
 * This resolves the issue where:
 * 1. Database has status = 'needs_reauthorization'
 * 2. API correctly returns error with needsReconnection: true
 * 3. But client store still has cached status = 'connected'
 * 4. UI doesn't show "Connect" button
 *
 * @param errorData - Parsed error response from API
 * @param provider - Provider ID (e.g., 'hubspot', 'slack')
 */
export async function handleIntegrationReconnection(
  errorData: any,
  provider: string
): Promise<void> {
  const needsReconnection =
    errorData?.details?.needsReconnection === true ||
    errorData?.needsReconnection === true

  if (!needsReconnection) return

  logger.warn(`⚠️ [${provider}] Integration needs reconnection, refreshing integration store...`)

  try {
    // Dynamic import to avoid circular dependencies
    const { useIntegrationStore } = await import('@/stores/integrationStore')
    const { fetchIntegrations } = useIntegrationStore.getState()

    // Force refresh to get latest status from database
    await fetchIntegrations(true)

    logger.info(`✅ [${provider}] Integration store refreshed successfully`)
  } catch (err) {
    logger.error(`❌ [${provider}] Failed to refresh integration store:`, err)
  }
}

/**
 * Parses an error response and handles reconnection if needed.
 *
 * @param errorText - Raw error text from API response
 * @param provider - Provider ID
 * @param defaultMessage - Fallback error message
 * @returns Parsed error message
 */
export async function parseErrorAndHandleReconnection(
  errorText: string,
  provider: string,
  defaultMessage: string
): Promise<string> {
  let errorMessage = defaultMessage

  if (!errorText) return errorMessage

  try {
    const errorData = JSON.parse(errorText)
    errorMessage = errorData.error || defaultMessage

    // Handle reconnection if needed
    await handleIntegrationReconnection(errorData, provider)
  } catch {
    // Not valid JSON, use text as-is (limit length)
    errorMessage = errorText.substring(0, 200)
  }

  return errorMessage
}
