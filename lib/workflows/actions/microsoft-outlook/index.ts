// Microsoft Outlook action handlers

// Email actions
export { sendOutlookEmail } from './sendEmail'
export {
  replyToOutlookEmail,
  forwardOutlookEmail,
  createOutlookDraftEmail,
  moveOutlookEmail,
  deleteOutlookEmail,
  addOutlookCategories,
  getOutlookEmails,
  searchOutlookEmail
} from './emailActions'

// Calendar actions
export { createOutlookCalendarEvent } from './createCalendarEvent'
export {
  updateOutlookCalendarEvent,
  deleteOutlookCalendarEvent,
  addOutlookAttendees,
  getOutlookCalendarEvents
} from './calendarActions'

// Contact actions
export {
  createOutlookContact,
  updateOutlookContact,
  deleteOutlookContact,
  findOutlookContact
} from './contactActions'

// Attachment actions
export {
  downloadOutlookAttachment
} from './attachmentActions'
