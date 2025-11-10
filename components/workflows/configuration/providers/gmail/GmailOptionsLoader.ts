/**
 * Gmail Options Loader
 * Handles loading dynamic field options for Gmail actions and triggers
 */

import { ProviderOptionsLoader, LoadOptionsParams, FormattedOption } from '../types'
import { fieldToResourceMap } from '../../config/fieldMappings'
import { apiClient } from '@/lib/apiClient'
import { logger } from '@/lib/utils/logger'

export class GmailOptionsLoader implements ProviderOptionsLoader {
  // List of field names that this loader can handle
  private supportedFields = [
    'messageId',       // Email ID for Get Attachment
    'from',            // From address filters
    'to',              // To address fields
    'cc',              // CC fields
    'bcc',             // BCC fields
    'labelIds',        // Label selection
    'labelId',         // Single label
    'labels',          // Label filters
    'labelFilters',    // Label filtering
    'email',           // Email address fields
    'emailAddress',    // Email address for search
  ]

  /**
   * Check if this loader can handle the given field for Gmail provider
   */
  canHandle(fieldName: string, providerId: string): boolean {
    const canHandle = providerId === 'gmail' && this.supportedFields.includes(fieldName)
    logger.debug('[GmailOptionsLoader] canHandle check:', {
      fieldName,
      providerId,
      canHandle,
      supportedFields: this.supportedFields
    })
    return canHandle
  }

  /**
   * Load options for the specified field
   */
  async loadOptions(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { fieldName, nodeType, integrationId, dependsOnValue, extraOptions } = params

    logger.info('🚀 [GmailOptionsLoader] STARTING load options:', {
      fieldName,
      nodeType,
      integrationId,
      dependsOnValue,
      extraOptions,
      hasIntegrationId: !!integrationId
    })

    // Early return if no integration ID
    if (!integrationId) {
      logger.error('❌ [GmailOptionsLoader] No integrationId provided!', {
        fieldName,
        nodeType
      })
      return []
    }

    try {
      // Get the dataType from field mapping
      logger.debug('[GmailOptionsLoader] Looking up dataType in fieldToResourceMap...')
      const dataType = fieldToResourceMap[nodeType]?.[fieldName]

      logger.info(`[GmailOptionsLoader] DataType lookup result: ${dataType}`)

      if (!dataType) {
        logger.warn('[GmailOptionsLoader] No dataType mapping found for:', {
          nodeType,
          fieldName,
          availableMappings: Object.keys(fieldToResourceMap[nodeType] || {})
        })
        return []
      }

      logger.info(`✅ [GmailOptionsLoader] DataType found: ${dataType}`)

      // Build options object for the API
      const options: any = {}

      // If dependsOnValue is provided and this is a search query, pass it through
      // The dependsOnValue comes from the search handler which passes the search query
      if (dependsOnValue !== undefined && dependsOnValue !== null) {
        options.searchQuery = dependsOnValue
        logger.debug('[GmailOptionsLoader] Including search query:', dependsOnValue)
      }

      // Include any extra options from the params
      if (extraOptions) {
        Object.assign(options, extraOptions)
        logger.debug('[GmailOptionsLoader] Added extraOptions to request')
      }

      logger.info('📡 [GmailOptionsLoader] Making API request to /api/integrations/gmail/data')
      logger.debug('[GmailOptionsLoader] Request payload:', {
        integrationId,
        dataType,
        options
      })

      // Make API request to Gmail data endpoint
      const startTime = Date.now()
      const response = await apiClient.post('/api/integrations/gmail/data', {
        integrationId,
        dataType,
        options
      })
      const duration = Date.now() - startTime

      logger.info(`✅ [GmailOptionsLoader] API response received in ${duration}ms`)
      logger.debug('[GmailOptionsLoader] Response:', {
        success: response.success,
        hasData: !!response.data,
        dataType: typeof response.data
      })

      if (!response.success) {
        logger.error('[GmailOptionsLoader] API returned error:', response.error)
        throw new Error(response.error || 'Failed to load Gmail options')
      }

      // Extract data from response
      const data = response.data?.data || response.data || []

      logger.info('[GmailOptionsLoader] Loaded options successfully:', {
        dataType,
        count: Array.isArray(data) ? data.length : 'non-array',
        sample: Array.isArray(data) ? data.slice(0, 2) : data
      })

      return Array.isArray(data) ? data : []

    } catch (error: any) {
      logger.error('[GmailOptionsLoader] Error loading options:', {
        fieldName,
        nodeType,
        error: error.message,
        integrationId
      })

      // Return empty array on error to prevent UI from breaking
      return []
    }
  }
}
