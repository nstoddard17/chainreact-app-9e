import { ProviderOptionsLoader } from '../types'

export const outlookOptionsLoader: ProviderOptionsLoader = {
  async loadOptions(fieldName, nodeType, integrationId, dependsOnValue) {
    // Build API URL based on field mapping
    const baseUrl = '/api/integrations/microsoft-outlook/data'
    const params = new URLSearchParams()

    // Map field names to data types
    const fieldToTypeMap: Record<string, string> = {
      'to': 'outlook-enhanced-recipients',
      'cc': 'outlook-enhanced-recipients',
      'bcc': 'outlook-enhanced-recipients',
      'attendees': 'outlook-enhanced-recipients',
      'calendarId': 'outlook_calendars',
      'folderId': 'outlook_folders',
      'messageId': 'outlook_messages',
    }

    const dataType = fieldToTypeMap[fieldName]
    if (!dataType) {
      console.warn(`[OutlookOptionsLoader] Unknown field: ${fieldName}`)
      return []
    }

    params.append('type', dataType)
    if (integrationId) {
      params.append('integrationId', integrationId)
    }

    try {
      const response = await fetch(`${baseUrl}?${params}`)
      if (!response.ok) {
        console.error('[OutlookOptionsLoader] Failed to fetch options:', response.statusText)
        return []
      }

      const result = await response.json()
      return result.data || []
    } catch (error) {
      console.error('[OutlookOptionsLoader] Error loading options:', error)
      return []
    }
  }
}