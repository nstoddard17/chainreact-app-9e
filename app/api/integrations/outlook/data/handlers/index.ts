/**
 * Outlook Data Handlers Export
 */

import { getOutlookFolders } from './folders'
import { getOutlookMessages } from './messages'
import { getOutlookContacts } from './contacts'
import { getOutlookCalendars } from './calendars'
import { getOutlookEvents } from './events'
import { getOutlookSignatures } from './signatures'

export const outlookHandlers = {
  'outlook_folders': getOutlookFolders,
  'outlook_messages': getOutlookMessages,
  'outlook_contacts': getOutlookContacts,
  'outlook_calendars': getOutlookCalendars,
  'outlook_events': getOutlookEvents,
  'outlook_signatures': getOutlookSignatures
}

export {
  getOutlookFolders,
  getOutlookMessages,
  getOutlookContacts,
  getOutlookCalendars,
  getOutlookEvents,
  getOutlookSignatures
}