/**
 * Microsoft Outlook data handler map for the dynamic data route registry.
 *
 * All handlers receive pre-decrypted tokens (tokenDecryption: 'decryptToken').
 * Handlers must NOT import or call decryption utilities.
 */

import type { DataHandler } from '@/lib/integrations/data-handler-registry'
import { getOutlookEnhancedRecipients } from './enhanced-recipients'
import { getOutlookCalendars } from './calendars'
import { getOutlookCalendarEvents } from './calendar-events'
import { getOutlookContacts } from './contacts'
import { getOutlookFolders } from './folders'

export const outlookHandlers: Record<string, DataHandler> = {
  'outlook-enhanced-recipients': async (integration, options) => {
    const recipients = await getOutlookEnhancedRecipients(integration)
    if (!options?.search) return recipients

    const searchLower = options.search.toLowerCase()
    return recipients.filter((r: any) =>
      r.email?.toLowerCase().includes(searchLower) ||
      r.label?.toLowerCase().includes(searchLower)
    )
  },

  'outlook_folders': async (integration) => {
    return getOutlookFolders(integration)
  },

  'outlook_messages': async () => {
    return []
  },

  'outlook_calendars': async (integration) => {
    return getOutlookCalendars(integration)
  },

  'outlook_calendar_events': async (integration, options) => {
    return getOutlookCalendarEvents(integration, {
      calendarId: options?.calendarId,
      search: options?.search,
    })
  },

  'outlook_contacts': async (integration, options) => {
    return getOutlookContacts(integration, {
      search: options?.search,
    })
  },
}
