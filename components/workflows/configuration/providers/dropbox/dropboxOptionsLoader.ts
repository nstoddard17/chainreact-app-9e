import { ProviderOptionsLoader } from '../types'
import { supabase } from '@/utils/supabaseClient'

import { logger } from '@/lib/utils/logger'

export class DropboxOptionsLoader implements ProviderOptionsLoader {
  private async getAuthHeaders(): Promise<HeadersInit> {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        return {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        }
      }
    } catch (error) {
      logger.error('[DropboxOptionsLoader] Error getting auth session:', error)
    }
    return { 'Content-Type': 'application/json' }
  }

  async loadOptions(params: {
    fieldName: string;
    nodeType?: string;
    providerId: string;
    integrationId?: string;
    dependsOn?: string;
    dependsOnValue?: any;
    forceRefresh?: boolean;
    extraOptions?: any;
  }): Promise<{ value: string; label: string }[]> {
    const { fieldName, providerId, integrationId, forceRefresh } = params;

    logger.debug('[DropboxOptionsLoader] Loading options for:', {
      fieldName,
      providerId,
      integrationId,
      forceRefresh
    })

    // Get auth headers for all requests
    const headers = await this.getAuthHeaders()

    // For folder selection - load all folders from Dropbox
    if (fieldName === 'path') {
      try {
        let dropboxIntegrationId = integrationId;

        // If integrationId is not provided, fetch it
        if (!dropboxIntegrationId) {
          const integrationsResponse = await fetch('/api/integrations/list', {
            headers
          })

          if (!integrationsResponse.ok) {
            logger.error('[DropboxOptionsLoader] Failed to fetch integrations')
            return [{
              value: '',
              label: 'Dropbox (Root)'
            }]
          }

          const integrations = await integrationsResponse.json()
          const dropboxIntegration = integrations.find((i: any) => i.provider === 'dropbox' && i.status === 'connected')

          if (!dropboxIntegration) {
            logger.warn('[DropboxOptionsLoader] No connected Dropbox integration found')
            return [{
              value: '',
              label: 'Connect Dropbox to see folders'
            }]
          }

          dropboxIntegrationId = dropboxIntegration.id;
        }

        // Now fetch folders from Dropbox
        const response = await fetch('/api/integrations/dropbox/data', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            integrationId: dropboxIntegrationId,
            dataType: 'folders'
          })
        })

        if (!response.ok) {
          let errorData: any = {}
          let errorMessage = `HTTP ${response.status}: ${response.statusText}`

          try {
            const text = await response.text()
            if (text) {
              try {
                errorData = JSON.parse(text)
                errorMessage = errorData.error || errorData.message || errorMessage
              } catch {
                errorMessage = text
              }
            }
          } catch (e) {
            logger.warn('[DropboxOptionsLoader] Could not parse error response')
          }

          logger.warn('[DropboxOptionsLoader] Failed to fetch folders:', {
            status: response.status,
            statusText: response.statusText,
            errorMessage,
            errorData,
            integrationId: dropboxIntegrationId
          })

          // If there's an error but we can provide a default option
          if (errorData.needsReconnection || response.status === 401) {
            return [{
              value: '',
              label: 'Please reconnect your Dropbox account'
            }]
          }

          // Return empty root folder as fallback
          return [{
            value: '',
            label: 'Dropbox (Root)'
          }]
        }

        const result = await response.json()

        logger.debug('[DropboxOptionsLoader] API Response:', {
          success: result.success,
          hasData: !!result.data,
          dataLength: result.data?.length
        })

        // Handle different response structures
        const folders = result.data || result.folders || []

        if (!Array.isArray(folders)) {
          logger.warn('[DropboxOptionsLoader] Expected array of folders but got:', typeof folders)
          return [{
            value: '',
            label: 'Dropbox (Root)'
          }]
        }

        if (folders.length === 0) {
          // If no folders found, return root folder option with informative label
          return [{
            value: '',
            label: 'Dropbox (Root) - No folders found'
          }]
        }

        // Transform folders to options format
        const options = folders.map((folder: any) => ({
          value: folder.path || folder.path_lower || '',
          label: folder.name || folder.path_display || 'Dropbox (Root)'
        }))

        logger.debug(`[DropboxOptionsLoader] Successfully loaded ${options.length} folders`)
        return options
      } catch (error) {
        logger.error('[DropboxOptionsLoader] Error fetching folders:', error)
        // Return root folder as fallback
        return [{
          value: '',
          label: 'Dropbox (Root)'
        }]
      }
    }

    logger.warn(`[DropboxOptionsLoader] No handler for field: ${fieldName}`)
    return []
  }

  shouldReloadOnDependencyChange(fieldName: string, dependencyFieldName: string): boolean {
    // Dropbox folder field doesn't have dependencies
    return false
  }

  canHandle(fieldName: string, providerId: string): boolean {
    // This loader handles the path field for Dropbox
    const supportedFields = ['path']

    return providerId === 'dropbox' && supportedFields.includes(fieldName)
  }
}