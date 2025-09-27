import { ProviderOptionsLoader, LoadOptionsParams, FormattedOption } from '../types'

const fieldToTypeMap: Record<string, string> = {
  to: 'outlook-enhanced-recipients',
  cc: 'outlook-enhanced-recipients',
  bcc: 'outlook-enhanced-recipients',
  attendees: 'outlook-enhanced-recipients',
  folderId: 'outlook_folders',
  messageId: 'outlook_messages',
  calendarId: 'outlook_calendars'
}

const supportedFields = new Set(Object.keys(fieldToTypeMap))

class OutlookOptionsLoader implements ProviderOptionsLoader {
  canHandle(fieldName: string): boolean {
    return supportedFields.has(fieldName)
  }

  async loadOptions({ fieldName, integrationId, extraOptions }: LoadOptionsParams): Promise<FormattedOption[]> {
    const dataType = fieldToTypeMap[fieldName]
    if (!dataType) {
      console.warn(`[OutlookOptionsLoader] Unsupported field requested: ${fieldName}`)
      return []
    }

    const baseUrl = '/api/integrations/microsoft-outlook/data'
    const params = new URLSearchParams({ type: dataType })

    if (integrationId) {
      params.append('integrationId', integrationId)
    }

    const searchTerm = typeof extraOptions?.search === 'string'
      ? extraOptions.search
      : typeof extraOptions?.query === 'string'
        ? extraOptions.query
        : undefined

    if (searchTerm && searchTerm.trim()) {
      params.append('search', searchTerm.trim())
    }

    try {
      const response = await fetch(`${baseUrl}?${params.toString()}`)
      if (!response.ok) {
        console.error('[OutlookOptionsLoader] Failed to fetch options:', response.status, response.statusText)
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

export const outlookOptionsLoader = new OutlookOptionsLoader()

