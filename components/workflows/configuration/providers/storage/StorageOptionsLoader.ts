/**
 * Storage Options Loader
 * Handles loading dynamic field options for storage-related fields across multiple providers
 * Used by Gmail Download Attachment and other actions that interact with cloud storage
 */

import { ProviderOptionsLoader, LoadOptionsParams, FormattedOption } from '../types'
import { apiClient } from '@/lib/apiClient'
import { logger } from '@/lib/utils/logger'

export class StorageOptionsLoader implements ProviderOptionsLoader {
  // List of field names that this loader can handle
  private supportedFields = [
    'folderId',  // Folder selection for any storage service
  ]

  /**
   * Check if this loader can handle the given field
   * This loader handles storage-folders for any provider
   */
  canHandle(fieldName: string, providerId: string): boolean {
    const canHandle = this.supportedFields.includes(fieldName)
    logger.debug('[StorageOptionsLoader] canHandle check:', {
      fieldName,
      providerId,
      canHandle,
      supportedFields: this.supportedFields
    })
    return canHandle
  }

  /**
   * Load options for storage fields
   * Routes the request to the appropriate storage provider based on storageService value
   */
  async loadOptions(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { fieldName, nodeType, integrationId, dependsOnValue, extraOptions, formValues } = params

    logger.info('🚀 [StorageOptionsLoader] STARTING load options:', {
      fieldName,
      nodeType,
      integrationId,
      dependsOnValue,
      extraOptions,
      formValues,
      hasIntegrationId: !!integrationId
    })

    // For storage-folders, we need the storageService value to know which provider to query
    const storageService = formValues?.storageService || dependsOnValue

    if (!storageService) {
      logger.warn('[StorageOptionsLoader] No storageService specified')
      return []
    }

    // Map storage service to provider ID
    const providerMap: Record<string, string> = {
      'google_drive': 'google-drive',
      'onedrive': 'onedrive',
      'dropbox': 'dropbox'
    }

    const providerId = providerMap[storageService]

    if (!providerId) {
      logger.error('[StorageOptionsLoader] Unknown storage service:', storageService)
      return []
    }

    // Map provider to data type
    const dataTypeMap: Record<string, string> = {
      'google-drive': 'google-drive-folders',
      'onedrive': 'onedrive-folders',
      'dropbox': 'dropbox-folders'
    }

    const dataType = dataTypeMap[providerId]

    if (!dataType) {
      logger.error('[StorageOptionsLoader] No dataType mapping for provider:', providerId)
      return []
    }

    try {
      // Get the integration ID for the storage provider
      // We need to fetch the user's integrations to find the correct integration ID for this storage provider
      // The storageConnectionId might be in formValues if user selected a specific account
      const storageConnectionId = formValues?.storageConnectionId

      logger.info(`[StorageOptionsLoader] Loading folders from ${providerId}`, {
        storageConnectionId,
        hasStorageConnectionId: !!storageConnectionId
      })

      // If no specific connection selected, we need to fetch the first connected integration for this provider
      let finalIntegrationId = storageConnectionId

      if (!finalIntegrationId) {
        // Fetch integrations for this storage provider
        logger.debug('[StorageOptionsLoader] No storageConnectionId, fetching integrations for provider')
        const integrationsResponse = await apiClient.get(`/api/integrations/all-connections?provider=${providerId}`)

        if (integrationsResponse.success && integrationsResponse.data?.connections?.length > 0) {
          const connectedIntegrations = integrationsResponse.data.connections.filter(
            (conn: any) => conn.status === 'connected'
          )
          if (connectedIntegrations.length > 0) {
            finalIntegrationId = connectedIntegrations[0].id
            logger.debug('[StorageOptionsLoader] Using first connected integration:', finalIntegrationId)
          } else {
            logger.warn('[StorageOptionsLoader] No connected integrations found for provider:', providerId)
            return []
          }
        } else {
          logger.warn('[StorageOptionsLoader] No integrations found for provider:', providerId)
          return []
        }
      }

      // Build the API endpoint for the specific storage provider
      const endpoint = `/api/integrations/${providerId}/data`

      logger.info(`📡 [StorageOptionsLoader] Making API request to ${endpoint}`)
      logger.debug('[StorageOptionsLoader] Request payload:', {
        integrationId: finalIntegrationId,
        dataType,
        options: extraOptions || {}
      })

      // Make API request to the storage provider's data endpoint
      const startTime = Date.now()
      const response = await apiClient.post(endpoint, {
        integrationId: finalIntegrationId,
        dataType,
        options: extraOptions || {}
      })
      const duration = Date.now() - startTime

      logger.info(`✅ [StorageOptionsLoader] API response received in ${duration}ms`)
      logger.debug('[StorageOptionsLoader] Response:', {
        success: response.success,
        hasData: !!response.data,
        dataType: typeof response.data
      })

      if (!response.success) {
        logger.error('[StorageOptionsLoader] API returned error:', response.error)
        throw new Error(response.error || 'Failed to load storage options')
      }

      // Extract data from response
      const data = response.data?.data || response.data || []

      logger.info('[StorageOptionsLoader] Loaded options successfully:', {
        dataType,
        count: Array.isArray(data) ? data.length : 'non-array',
        sample: Array.isArray(data) ? data.slice(0, 2) : data
      })

      return Array.isArray(data) ? data : []

    } catch (error: any) {
      logger.error('[StorageOptionsLoader] Error loading options:', {
        fieldName,
        nodeType,
        storageService,
        error: error.message
      })

      // Return empty array on error to prevent UI from breaking
      return []
    }
  }
}
