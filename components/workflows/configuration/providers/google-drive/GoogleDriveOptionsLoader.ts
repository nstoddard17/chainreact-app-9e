import { ProviderOptionsLoader } from '../types'
import { supabase } from '@/utils/supabaseClient'

import { logger } from '@/lib/utils/logger'

export class GoogleDriveOptionsLoader implements ProviderOptionsLoader {
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
      logger.error('[GoogleDriveOptionsLoader] Error getting auth session:', error)
    }
    return { 'Content-Type': 'application/json' }
  }

  async loadOptions(params: {
    fieldName: string;
    providerId: string;
    integrationId?: string;
    nodeType?: string;
    dependsOn?: string;
    dependsOnValue?: any;
    forceRefresh?: boolean;
    extraOptions?: Record<string, any>;
  }): Promise<{ value: string; label: string; group?: string }[]> {
    const { fieldName, providerId, integrationId, nodeType, dependsOnValue, forceRefresh } = params;

    logger.debug('[GoogleDriveOptionsLoader] Loading options for:', {
      fieldName,
      providerId,
      integrationId,
      nodeType,
      dependsOnValue,
      forceRefresh
    })

    // Get auth headers for all requests
    const headers = await this.getAuthHeaders()

    // For file preview, we need to fetch the file metadata
    if (fieldName === 'filePreview' && dependsOnValue) {
      try {
        const response = await fetch(`/api/integrations/google-drive/file-preview`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ fileId: dependsOnValue })
        })

        if (!response.ok) {
          logger.error('[GoogleDriveOptionsLoader] Failed to fetch file preview')
          return []
        }

        const data = await response.json()
        // Return preview as a single option (will be displayed in textarea)
        return [{
          value: data.preview || 'No preview available',
          label: 'Preview'
        }]
      } catch (error) {
        logger.error('[GoogleDriveOptionsLoader] Error fetching file preview:', error)
        return []
      }
    }

    // For file selection - determine data type based on node type
    if (fieldName === 'fileId') {
      try {
        // Determine data type based on node type
        const dataType = this.getDataTypeForField(fieldName, nodeType)

        // Get integration from Supabase
        if (!integrationId) {
          logger.error('[GoogleDriveOptionsLoader] No integration ID provided')
          return []
        }

        logger.debug('[GoogleDriveOptionsLoader] Using data type:', dataType)

        // Use POST endpoint for new data handler
        const response = await fetch(`/api/integrations/google-drive/data`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            integrationId,
            dataType,
            options: {
              folderId: dependsOnValue || undefined
            }
          })
        })

        if (!response.ok) {
          logger.error('[GoogleDriveOptionsLoader] Failed to fetch files')
          return []
        }

        const result = await response.json()
        const items = result.data || result

        // Map to options format, preserving group property for grouped display
        return items.map((item: any) => ({
          value: item.value || item.id,
          label: item.label || item.name,
          ...(item.group && { group: item.group })
        }))
      } catch (error) {
        logger.error('[GoogleDriveOptionsLoader] Error fetching files:', error)
        return []
      }
    }

    // Default: Use the POST endpoint for other fields (like folders)
    const dataType = this.getDataTypeForField(fieldName, nodeType)
    if (!dataType) {
      logger.warn(`[GoogleDriveOptionsLoader] No data type mapping for field: ${fieldName}`)
      return []
    }

    if (!integrationId) {
      logger.error('[GoogleDriveOptionsLoader] No integration ID provided')
      return []
    }

    try {
      const response = await fetch(`/api/integrations/google-drive/data`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          integrationId,
          dataType,
          options: {}
        })
      })

      if (!response.ok) {
        logger.error(`[GoogleDriveOptionsLoader] Failed to fetch ${dataType}`)
        return []
      }

      const result = await response.json()
      const items = result.data || result

      return items.map((item: any) => ({
        value: item.value || item.id,
        label: item.label || item.name,
        ...(item.group && { group: item.group })
      }))
    } catch (error) {
      logger.error(`[GoogleDriveOptionsLoader] Error fetching ${dataType}:`, error)
      return []
    }
  }

  private getDataTypeForField(fieldName: string, nodeType?: string): string | null {
    // For fileId field, check if it's the move_file action which needs grouped data
    if (fieldName === 'fileId' && nodeType === 'google-drive:move_file') {
      return 'google-drive-files-and-folders'
    }

    const fieldDataTypeMap: Record<string, string> = {
      folderId: 'folders',
      parentFolderId: 'folders',
      fileId: 'files',
    }

    return fieldDataTypeMap[fieldName] || null
  }

  shouldReloadOnDependencyChange(fieldName: string, dependencyFieldName: string): boolean {
    // File selection should reload when folder changes
    if (fieldName === 'fileId' && dependencyFieldName === 'folderId') {
      return true
    }

    // File preview should reload when file selection changes
    if (fieldName === 'filePreview' && dependencyFieldName === 'fileId') {
      return true
    }

    return false
  }

  canHandle(fieldName: string, providerId: string): boolean {
    // This loader handles all Google Drive fields
    const supportedFields = [
      'folderId',
      'parentFolderId', 
      'fileId',
      'filePreview'
    ]
    
    return providerId === 'google-drive' && supportedFields.includes(fieldName)
  }
}