import { ProviderOptionsLoader } from '../types'
import { supabase } from '@/utils/supabaseClient'

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
      console.error('[GoogleDriveOptionsLoader] Error getting auth session:', error)
    }
    return { 'Content-Type': 'application/json' }
  }

  async loadOptions(
    fieldName: string,
    providerId: string,
    dependencyFieldName?: string,
    dependencyValue?: any,
    forceRefresh?: boolean
  ): Promise<{ value: string; label: string }[]> {
    console.log('[GoogleDriveOptionsLoader] Loading options for:', {
      fieldName,
      providerId,
      dependencyFieldName,
      dependencyValue
    })

    // Get auth headers for all requests
    const headers = await this.getAuthHeaders()

    // For file preview, we need to fetch the file metadata
    if (fieldName === 'filePreview' && dependencyValue) {
      try {
        const response = await fetch(`/api/integrations/google-drive/file-preview`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ fileId: dependencyValue })
        })

        if (!response.ok) {
          console.error('[GoogleDriveOptionsLoader] Failed to fetch file preview')
          return []
        }

        const data = await response.json()
        // Return preview as a single option (will be displayed in textarea)
        return [{
          value: data.preview || 'No preview available',
          label: 'Preview'
        }]
      } catch (error) {
        console.error('[GoogleDriveOptionsLoader] Error fetching file preview:', error)
        return []
      }
    }

    // For file selection - load all files or filtered by folder
    if (fieldName === 'fileId') {
      // If there's a dependency value (folder selected), filter by folder
      // Otherwise, load all files
      const endpoint = (dependencyFieldName === 'folderId' && dependencyValue)
        ? `/api/integrations/google-drive/data?type=files&folderId=${dependencyValue}`
        : '/api/integrations/google-drive/data?type=files'

      try {
        const response = await fetch(endpoint, {
          headers
        })
        if (!response.ok) {
          console.error('[GoogleDriveOptionsLoader] Failed to fetch files')
          return []
        }

        const files = await response.json()
        return files.map((file: any) => ({
          value: file.id,
          label: file.name
        }))
      } catch (error) {
        console.error('[GoogleDriveOptionsLoader] Error fetching files:', error)
        return []
      }
    }

    // Default: Use the standard data endpoint for folders
    const dataType = this.getDataTypeForField(fieldName)
    if (!dataType) {
      console.warn(`[GoogleDriveOptionsLoader] No data type mapping for field: ${fieldName}`)
      return []
    }

    try {
      const endpoint = `/api/integrations/google-drive/data?type=${dataType}`
      const response = await fetch(endpoint, {
        headers
      })
      
      if (!response.ok) {
        console.error(`[GoogleDriveOptionsLoader] Failed to fetch ${dataType}`)
        return []
      }

      const data = await response.json()
      return data.map((item: any) => ({
        value: item.id,
        label: item.name
      }))
    } catch (error) {
      console.error(`[GoogleDriveOptionsLoader] Error fetching ${dataType}:`, error)
      return []
    }
  }

  private getDataTypeForField(fieldName: string): string | null {
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