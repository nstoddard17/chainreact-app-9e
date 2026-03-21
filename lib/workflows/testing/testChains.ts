/**
 * Shared test chain definitions for batch-test and systematic-test routes.
 *
 * Provides:
 *  - PREREQUISITE_MAP  – chained prerequisites with caching & recursive resolution
 *  - SKIP_ACTIONS      – actions excluded from automated testing
 *  - resolveDynamicConfig – runtime resolution of provider-specific IDs
 *  - resolvePrereqs    – recursive prereq execution with output caching
 */

import { logger } from '@/lib/utils/logger'
import { getDecryptedAccessToken } from '@/lib/workflows/actions/core/getDecryptedAccessToken'

// ── Types ────────────────────────────────────────────────────────────────

export interface PrereqDefinition {
  /** Node type to run first */
  prereqNodeType: string
  /** Config overrides for the prerequisite action */
  prereqConfig: Record<string, any>
  /** Maps prereq output fields → test config fields (supports dot paths like "messages.0.id") */
  outputMapping: Record<string, string>
  /** Static config overrides applied to the test action (not the prereq) */
  testConfigOverrides?: Record<string, any>
  /** Pull additional values from other cached prereq outputs: { cacheKey: { outputPath: configField } } */
  additionalCacheMapping?: Record<string, Record<string, string>>
  /** Custom cache key (defaults to prereqNodeType). Use to avoid sharing with other chains. */
  cacheKey?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Extract a value from a nested object using dot-separated path (e.g. "messages.0.id") */
export function extractNestedValue(obj: any, path: string): any {
  if (!obj || !path) return undefined
  return path.split('.').reduce((acc, key) => acc?.[key], obj)
}

/**
 * Append a short runtime timestamp to name fields that cause "already exists" errors.
 * Only stamps values that start with '[TEST' or 'test-' to avoid corrupting real IDs.
 */
const DEDUP_FIELDS = ['channelName', 'worksheetName', 'displayName', 'notebookName', 'newName', 'name', 'sectionName']
export function dedupTestNames(config: Record<string, any>): void {
  const ts = Date.now().toString(36).slice(-5)
  for (const field of DEDUP_FIELDS) {
    const val = config[field]
    if (val && typeof val === 'string') {
      if (val.startsWith('[TEST')) {
        config[field] = `${val}-${ts}`
      } else if (val.startsWith('test-')) {
        // Slack-compatible names (lowercase, no spaces)
        config[field] = `${val}-${ts}`
      }
    }
  }
}

// ── Skip actions ─────────────────────────────────────────────────────────

export const SKIP_ACTIONS: Record<string, string> = {
  'facebook_action_upload_photo': 'Requires real photo file upload',
  'facebook_action_upload_video': 'Requires real video file upload',
  'github_action_create_repository': 'Would create a new repository each run',
  'github_action_create_pull_request': 'Requires a branch with commits',
  'google_analytics_action_create_measurement_secret': 'Creates a real API secret each run (tested as prerequisite)',
  'google_analytics_action_create_conversion_event': 'Creates a real conversion event each run',
  'mailchimp_action_send_campaign': 'Would actually send a campaign email to subscribers',
  'slack_action_rename_channel': 'Destructive - would rename a real channel',
  'slack_action_archive_channel': 'Destructive - would archive a real channel',
  'slack_action_unarchive_channel': 'Requires a previously archived channel',
  'gmail_action_get_attachment': 'Prereq sends email without attachments - always fails',
  'gmail_action_download_attachment': 'Prereq sends email without attachments - always fails',
  'google_calendar_action_move_event': 'Requires two different calendars - no secondary calendar available in test',
  'mailchimp_action_create_audience': 'Requires premium API access not available on free plan',
  'teams_action_edit_message': 'Requires ChannelMessage.ReadWrite scope (admin consent required)',
  'teams_action_delete_message': 'Requires ChannelMessage.ReadWrite scope (admin consent required)',
  'google-drive:copy_file': 'Requires file ownership permissions not available in test',
  'facebook_action_update_post': 'Requires pages_manage_posts permission not available in test app',
  'extract_website_data': 'Fetch fails in serverless environment due to network restrictions',
  'teams_action_create_group_chat': 'Requires real Microsoft 365 users in directory',
  'teams_action_send_chat_message': 'Depends on create_group_chat which requires real Microsoft 365 users',
  'teams_action_add_member_to_team': 'Requires real Microsoft 365 users in organization directory',
  'google-drive:create_file': 'Requires real file upload which is not supported in automated testing',
  'onedrive_action_upload_file': 'Requires real file upload which is not supported in automated testing',
  'tavily_search': 'Requires TAVILY_API_KEY environment variable not configured',
  'microsoft-outlook_action_get_attachment': 'Prereq sends email without attachments - always fails',
  'github_action_add_comment': 'Requires a valid issue number — 422 Validation Failed',
  'twitter_action_post_tweet': 'Twitter/X API unreliable (503s) — manually tested',
  // Stripe — manually tested, skip in automated runs
  'stripe_action_create_customer': 'Manually tested — Stripe integration verified',
  'stripe_action_update_customer': 'Manually tested — Stripe integration verified',
  'stripe_action_create_payment_intent': 'Manually tested — Stripe integration verified',
  'stripe_action_create_invoice': 'Manually tested — Stripe integration verified',
  'stripe_action_create_subscription': 'Manually tested — Stripe integration verified',
  'stripe_action_get_payments': 'Manually tested — Stripe integration verified',
  'stripe_action_create_refund': 'Manually tested — Stripe integration verified',
  'stripe_action_cancel_subscription': 'Manually tested — Stripe integration verified',
  'stripe_action_update_subscription': 'Manually tested — Stripe integration verified',
  'stripe_action_create_checkout_session': 'Manually tested — Stripe integration verified',
  'stripe_action_create_payment_link': 'Manually tested — Stripe integration verified',
  'stripe_action_find_customer': 'Manually tested — Stripe integration verified',
  'stripe_action_find_subscription': 'Manually tested — Stripe integration verified',
  'stripe_action_find_payment_intent': 'Manually tested — Stripe integration verified',
  'stripe_action_create_product': 'Manually tested — Stripe integration verified',
  'stripe_action_create_price': 'Manually tested — Stripe integration verified',
  'stripe_action_update_product': 'Manually tested — Stripe integration verified',
  'stripe_action_list_products': 'Manually tested — Stripe integration verified',
  'stripe_action_create_invoice_item': 'Manually tested — Stripe integration verified',
  'stripe_action_finalize_invoice': 'Manually tested — Stripe integration verified',
  'stripe_action_void_invoice': 'Manually tested — Stripe integration verified',
  'stripe_action_update_invoice': 'Manually tested — Stripe integration verified',
  'stripe_action_confirm_payment_intent': 'Manually tested — Stripe integration verified',
  'stripe_action_capture_payment_intent': 'Manually tested — Stripe integration verified',
  'stripe_action_find_charge': 'Manually tested — Stripe integration verified',
  'stripe_action_find_invoice': 'Manually tested — Stripe integration verified',
}

// ── Prerequisite map ─────────────────────────────────────────────────────

export const PREREQUISITE_MAP: Record<string, PrereqDefinition> = {

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  GMAIL                                                              ║
  // ╚══════════════════════════════════════════════════════════════════════╝

  'gmail_action_reply_to_email': {
    prereqNodeType: 'gmail_action_send_email',
    prereqConfig: { to: 'chainreactapp@gmail.com', subject: '[TEST-PREREQ] for reply', body: 'Auto-prereq.' },
    outputMapping: { messageId: 'messageId', threadId: 'threadId' },
  },
  'gmail_action_archive_email': {
    prereqNodeType: 'gmail_action_send_email',
    prereqConfig: { to: 'chainreactapp@gmail.com', subject: '[TEST-PREREQ] for archive', body: 'Auto-prereq.' },
    outputMapping: { messageId: 'messageId' },
  },
  'gmail_action_add_label': {
    prereqNodeType: 'gmail_action_send_email',
    prereqConfig: { to: 'chainreactapp@gmail.com', subject: '[TEST-PREREQ] for add label', body: 'Auto-prereq.' },
    outputMapping: { messageId: 'messageId' },
    testConfigOverrides: { labelIds: ['STARRED'] },
  },
  'gmail_action_remove_label': {
    prereqNodeType: 'gmail_action_send_email',
    prereqConfig: { to: 'chainreactapp@gmail.com', subject: '[TEST-PREREQ] for remove label', body: 'Auto-prereq.' },
    outputMapping: { messageId: 'messageId' },
    testConfigOverrides: { labelIds: ['INBOX'] },
  },
  'gmail_action_mark_as_read': {
    prereqNodeType: 'gmail_action_send_email',
    prereqConfig: { to: 'chainreactapp@gmail.com', subject: '[TEST-PREREQ] for mark read', body: 'Auto-prereq.' },
    outputMapping: { messageId: 'messageId' },
    testConfigOverrides: { messageSelection: 'single' },
  },
  'gmail_action_mark_as_unread': {
    prereqNodeType: 'gmail_action_send_email',
    prereqConfig: { to: 'chainreactapp@gmail.com', subject: '[TEST-PREREQ] for mark unread', body: 'Auto-prereq.' },
    outputMapping: { messageId: 'messageId' },
    testConfigOverrides: { messageSelection: 'single' },
  },
  'gmail_action_delete_email': {
    prereqNodeType: 'gmail_action_send_email',
    prereqConfig: { to: 'chainreactapp@gmail.com', subject: '[TEST-PREREQ] for delete', body: 'Auto-prereq.' },
    outputMapping: { messageId: 'messageId' },
  },
  'gmail_action_create_draft_reply': {
    prereqNodeType: 'gmail_action_send_email',
    prereqConfig: { to: 'chainreactapp@gmail.com', subject: '[TEST-PREREQ] for draft reply', body: 'Auto-prereq.' },
    outputMapping: { messageId: 'messageId', threadId: 'threadId' },
  },
  // gmail_action_get_attachment and gmail_action_download_attachment moved to SKIP_ACTIONS
  // because prereq sends email without attachments, causing guaranteed failure

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  GOOGLE CALENDAR                                                    ║
  // ╚══════════════════════════════════════════════════════════════════════╝

  'google_calendar_action_update_event': {
    prereqNodeType: 'google_calendar_action_create_event',
    prereqConfig: { title: '[TEST-PREREQ] Event for update', startDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], startTime: '10:00', endDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], endTime: '11:00' },
    outputMapping: { eventId: 'eventId' },
    testConfigOverrides: { title: '[TEST] Updated event title', description: 'Updated by test' },
  },
  'google_calendar_action_get_event': {
    prereqNodeType: 'google_calendar_action_create_event',
    prereqConfig: { title: '[TEST-PREREQ] Event for get', startDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], startTime: '12:00', endDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], endTime: '13:00' },
    outputMapping: { eventId: 'eventId' },
  },
  'google_calendar_action_delete_event': {
    prereqNodeType: 'google_calendar_action_create_event',
    prereqConfig: { title: '[TEST-PREREQ] Event for delete', startDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], startTime: '14:00', endDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], endTime: '15:00' },
    outputMapping: { eventId: 'eventId' },
    cacheKey: 'gcal_create_for_delete',
  },
  'google_calendar_action_add_attendees': {
    prereqNodeType: 'google_calendar_action_create_event',
    prereqConfig: { title: '[TEST-PREREQ] Event for attendees', startDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], startTime: '16:00', endDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], endTime: '17:00' },
    outputMapping: { eventId: 'eventId' },
    testConfigOverrides: { attendees: 'test@chainreact.app', sendNotifications: false },
  },
  'google_calendar_action_remove_attendees': {
    prereqNodeType: 'google_calendar_action_add_attendees',
    prereqConfig: { attendees: 'test@chainreact.app', sendNotifications: false },
    outputMapping: { eventId: 'eventId' },
    testConfigOverrides: { attendeesToRemove: 'test@chainreact.app', sendNotifications: false },
  },
  'google_calendar_action_move_event': {
    prereqNodeType: 'google_calendar_action_create_event',
    prereqConfig: { title: '[TEST-PREREQ] Event for move', startDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], startTime: '18:00', endDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], endTime: '19:00' },
    outputMapping: { eventId: 'eventId' },
    testConfigOverrides: { destinationCalendarId: 'primary' },
    cacheKey: 'gcal_create_for_move',
  },
  'google_calendar_action_get_free_busy': {
    prereqNodeType: 'google_calendar_action_list_events',
    prereqConfig: {},
    outputMapping: {},
    testConfigOverrides: {
      calendarIds: 'primary',
      timeMin: new Date().toISOString(),
      timeMax: new Date(Date.now() + 7 * 86400000).toISOString(),
    },
  },

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  GOOGLE DRIVE                                                       ║
  // ╚══════════════════════════════════════════════════════════════════════╝

  'google-drive:list_files': {
    prereqNodeType: 'google-drive:create_folder',
    prereqConfig: { folderName: '[TEST-PREREQ] Folder for list files' },
    outputMapping: { folderId: 'folderId' },
  },
  'google-drive:get_file_metadata': {
    prereqNodeType: 'google-drive:create_folder',
    prereqConfig: { folderName: '[TEST-PREREQ] Folder for metadata' },
    outputMapping: { folderId: 'fileId' },
  },
  'google-drive:get_file': {
    prereqNodeType: 'google-drive:create_folder',
    prereqConfig: { folderName: '[TEST-PREREQ] Folder for get file' },
    outputMapping: { folderId: 'fileId' },
  },
  'google-drive:share_file': {
    prereqNodeType: 'google-drive:create_folder',
    prereqConfig: { folderName: '[TEST-PREREQ] Folder for share' },
    outputMapping: { folderId: 'fileId' },
    testConfigOverrides: { shareType: 'user', emailAddress: 'chainreactapp@gmail.com', role: 'reader', sendNotification: false },
  },
  'google-drive:copy_file': {
    prereqNodeType: 'google-drive:create_folder',
    prereqConfig: { folderName: '[TEST-PREREQ] Folder for copy' },
    outputMapping: { folderId: 'fileId' },
    testConfigOverrides: { newName: '[TEST] Copied folder' },
    cacheKey: 'gdrive_folder_for_copy',
  },
  'google-drive:move_file': {
    prereqNodeType: 'google-drive:create_folder',
    prereqConfig: { folderName: '[TEST-PREREQ] Folder for move' },
    outputMapping: { folderId: 'fileId' },
    testConfigOverrides: { destinationFolderId: 'root' },
    cacheKey: 'gdrive_folder_for_move',
  },
  'google-drive:delete_file': {
    prereqNodeType: 'google-drive:create_folder',
    prereqConfig: { folderName: '[TEST-PREREQ] Folder for delete' },
    outputMapping: { folderId: 'fileId' },
    cacheKey: 'gdrive_folder_for_delete',
  },

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  GOOGLE DOCS                                                        ║
  // ╚══════════════════════════════════════════════════════════════════════╝

  'google_docs_action_get_document': {
    prereqNodeType: 'google_docs_action_create_document',
    prereqConfig: { title: '[TEST-PREREQ] Doc for get' },
    outputMapping: { documentId: 'documentId' },
  },
  'google_docs_action_update_document': {
    prereqNodeType: 'google_docs_action_create_document',
    prereqConfig: { title: '[TEST-PREREQ] Doc for update' },
    outputMapping: { documentId: 'documentId' },
    testConfigOverrides: { content: '[TEST] Appended content', insertLocation: 'end' },
  },
  'google_docs_action_share_document': {
    prereqNodeType: 'google_docs_action_create_document',
    prereqConfig: { title: '[TEST-PREREQ] Doc for share' },
    outputMapping: { documentId: 'documentId' },
    testConfigOverrides: { shareWith: 'chainreactapp@gmail.com', permission: 'reader', sendNotification: false },
    cacheKey: 'gdocs_for_share',
  },
  'google_docs_action_export_document': {
    prereqNodeType: 'google_docs_action_create_document',
    prereqConfig: { title: '[TEST-PREREQ] Doc for export' },
    outputMapping: { documentId: 'documentId' },
    testConfigOverrides: { exportFormat: 'pdf', destination: 'workflow' },
  },

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  MICROSOFT OUTLOOK – EMAIL                                          ║
  // ║  send_email doesn't return messageId, so we use fetch_emails        ║
  // ╚══════════════════════════════════════════════════════════════════════╝

  // All Outlook email actions share ONE sent email (cacheKey: 'outlook_shared_email')
  // delete_email runs last since it destroys the shared resource
  'microsoft-outlook_action_reply_to_email': {
    prereqNodeType: 'microsoft-outlook_action_send_email',
    prereqConfig: { to: 'chainreactapp@gmail.com', subject: '[TEST-PREREQ] shared Outlook email', body: 'Auto-prereq for all Outlook email tests.' },
    outputMapping: { messageId: 'emailId' },
    testConfigOverrides: { body: '[TEST] Automated reply - safe to delete' },
    cacheKey: 'outlook_shared_email',
  },
  'microsoft-outlook_action_forward_email': {
    prereqNodeType: 'microsoft-outlook_action_send_email',
    prereqConfig: { to: 'chainreactapp@gmail.com', subject: '[TEST-PREREQ] shared Outlook email', body: 'Auto-prereq for all Outlook email tests.' },
    outputMapping: { messageId: 'emailId' },
    testConfigOverrides: { to: 'chainreactapp@gmail.com', comment: '[TEST] Forwarded for testing' },
    cacheKey: 'outlook_shared_email',
  },
  'microsoft-outlook_action_add_categories': {
    prereqNodeType: 'microsoft-outlook_action_send_email',
    prereqConfig: { to: 'chainreactapp@gmail.com', subject: '[TEST-PREREQ] email for categories', body: 'Auto-prereq for add categories test.' },
    outputMapping: { messageId: 'emailId' },
    testConfigOverrides: { categories: 'Blue category' },
    cacheKey: 'outlook_email_for_categories',
  },
  // microsoft-outlook_action_get_attachment moved to SKIP_ACTIONS (no attachments in prereq email)
  'microsoft-outlook_action_move_email': {
    prereqNodeType: 'microsoft-outlook_action_send_email',
    prereqConfig: { to: 'chainreactapp@gmail.com', subject: '[TEST-PREREQ] shared Outlook email', body: 'Auto-prereq for all Outlook email tests.' },
    outputMapping: { messageId: 'emailId' },
    cacheKey: 'outlook_shared_email',
    // destinationFolderId resolved dynamically
  },
  // delete_email gets its own email to avoid conflicts with move_email changing IDs
  'microsoft-outlook_action_delete_email': {
    prereqNodeType: 'microsoft-outlook_action_send_email',
    prereqConfig: { to: 'chainreactapp@gmail.com', subject: '[TEST-PREREQ] email for delete', body: 'Auto-prereq for delete email test.' },
    outputMapping: { messageId: 'emailId' },
    cacheKey: 'outlook_email_for_delete',
  },

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  MICROSOFT OUTLOOK – CALENDAR                                       ║
  // ╚══════════════════════════════════════════════════════════════════════╝

  'microsoft-outlook_action_update_calendar_event': {
    prereqNodeType: 'microsoft-outlook_action_create_calendar_event',
    prereqConfig: { subject: '[TEST-PREREQ] Event for update', startDateTime: new Date(Date.now() + 86400000).toISOString(), endDateTime: new Date(Date.now() + 90000000).toISOString() },
    outputMapping: { eventId: 'eventIdManual' },
    testConfigOverrides: { eventSelectionMode: 'manual', subject: '[TEST] Updated Outlook event' },
  },
  'microsoft-outlook_action_add_attendees': {
    prereqNodeType: 'microsoft-outlook_action_create_calendar_event',
    prereqConfig: { subject: '[TEST-PREREQ] Event for add attendees', startDateTime: new Date(Date.now() + 86400000).toISOString(), endDateTime: new Date(Date.now() + 90000000).toISOString() },
    outputMapping: { eventId: 'eventIdManual' },
    testConfigOverrides: { eventSelectionMode: 'manual', attendees: 'test@chainreact.app' },
    cacheKey: 'outlook_cal_for_attendees',
  },
  'microsoft-outlook_action_delete_calendar_event': {
    prereqNodeType: 'microsoft-outlook_action_create_calendar_event',
    prereqConfig: { subject: '[TEST-PREREQ] Event for delete', startDateTime: new Date(Date.now() + 86400000).toISOString(), endDateTime: new Date(Date.now() + 90000000).toISOString() },
    outputMapping: { eventId: 'eventIdManual' },
    testConfigOverrides: { eventSelectionMode: 'manual' },
    cacheKey: 'outlook_cal_for_delete',
  },

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  MICROSOFT OUTLOOK – CONTACTS                                       ║
  // ╚══════════════════════════════════════════════════════════════════════╝

  'microsoft-outlook_action_update_contact': {
    prereqNodeType: 'microsoft-outlook_action_create_contact',
    prereqConfig: { givenName: 'TestPrereq', surname: 'Contact', emailAddress: `test-${Date.now()}@chainreact.app` },
    outputMapping: { id: 'contactIdManual' },
    testConfigOverrides: { contactSelectionMode: 'manual', givenName: 'UpdatedTest' },
  },
  'microsoft-outlook_action_delete_contact': {
    prereqNodeType: 'microsoft-outlook_action_create_contact',
    prereqConfig: { givenName: 'TestPrereq', surname: 'ForDelete', emailAddress: `test-del-${Date.now()}@chainreact.app` },
    outputMapping: { id: 'contactIdManual' },
    testConfigOverrides: { contactSelectionMode: 'manual' },
    cacheKey: 'outlook_contact_for_delete',
  },

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  MICROSOFT EXCEL                                                    ║
  // ╚══════════════════════════════════════════════════════════════════════╝

  'microsoft_excel_action_create_worksheet': {
    prereqNodeType: 'microsoft_excel_action_create_workbook',
    prereqConfig: { title: '[TEST-PREREQ] Workbook for worksheet tests' },
    outputMapping: { workbookId: 'workbookId' },
    testConfigOverrides: { worksheetName: '[TEST] Worksheet' },
  },
  'microsoft_excel_action_rename_worksheet': {
    prereqNodeType: 'microsoft_excel_action_create_worksheet',
    prereqConfig: { worksheetName: 'TEST-PREREQ Sheet to rename' },
    outputMapping: { worksheetId: 'worksheetId', worksheetName: 'worksheetName' },
    additionalCacheMapping: { 'microsoft_excel_action_create_workbook': { workbookId: 'workbookId' } },
    testConfigOverrides: { newName: 'TEST Renamed sheet' },
    cacheKey: 'excel_worksheet_for_rename',
  },
  'microsoft_excel_action_delete_worksheet': {
    prereqNodeType: 'microsoft_excel_action_create_worksheet',
    prereqConfig: { worksheetName: 'TEST-PREREQ Sheet to delete' },
    outputMapping: { worksheetId: 'worksheetId', worksheetName: 'worksheetName' },
    additionalCacheMapping: { 'microsoft_excel_action_create_workbook': { workbookId: 'workbookId' } },
    cacheKey: 'excel_worksheet_for_delete',
  },
  'microsoft_excel_action_add_row': {
    prereqNodeType: 'microsoft_excel_action_create_worksheet',
    prereqConfig: { worksheetName: 'TEST-PREREQ Sheet for rows' },
    outputMapping: { worksheetName: 'worksheetName' },
    additionalCacheMapping: { 'microsoft_excel_action_create_workbook': { workbookId: 'workbookId' } },
    testConfigOverrides: { columnMapping: JSON.stringify([{ column: 'A', value: 'Test Name' }, { column: 'B', value: 'Test Value' }]) },
  },
  'microsoft_excel_action_add_multiple_rows': {
    prereqNodeType: 'microsoft_excel_action_create_worksheet',
    prereqConfig: { worksheetName: 'TEST-PREREQ Sheet for multi rows' },
    outputMapping: { worksheetName: 'worksheetName' },
    additionalCacheMapping: { 'microsoft_excel_action_create_workbook': { workbookId: 'workbookId' } },
    testConfigOverrides: { rows: JSON.stringify([{ A: 'Row1', B: 'Val1' }, { A: 'Row2', B: 'Val2' }]) },
    cacheKey: 'excel_worksheet_for_multi_rows',
  },
  'microsoft-excel_action_export_sheet': {
    prereqNodeType: 'microsoft_excel_action_add_row',
    prereqConfig: {},
    outputMapping: { worksheetName: 'worksheetName' },
    additionalCacheMapping: { 'microsoft_excel_action_create_workbook': { workbookId: 'workbookId' } },
  },
  'microsoft_excel_action_update_row': {
    prereqNodeType: 'microsoft_excel_action_add_row',
    prereqConfig: {},
    outputMapping: { rowNumber: 'rowNumber', worksheetName: 'worksheetName' },
    additionalCacheMapping: { 'microsoft_excel_action_create_workbook': { workbookId: 'workbookId' } },
    testConfigOverrides: { updateMapping: JSON.stringify({ A: 'Updated Name', B: 'Updated Value' }) },
  },
  'microsoft_excel_action_delete_row': {
    prereqNodeType: 'microsoft_excel_action_add_row',
    prereqConfig: {},
    outputMapping: { rowNumber: 'rowNumber', worksheetName: 'worksheetName' },
    additionalCacheMapping: { 'microsoft_excel_action_create_workbook': { workbookId: 'workbookId' } },
    testConfigOverrides: { deleteBy: 'row_number' },
    cacheKey: 'excel_add_row_for_delete',
  },
  'microsoft_excel_action_add_table_row': {
    prereqNodeType: 'microsoft_excel_action_create_worksheet',
    prereqConfig: { worksheetName: 'TEST-PREREQ Sheet for table row' },
    outputMapping: { worksheetName: 'worksheetName' },
    additionalCacheMapping: { 'microsoft_excel_action_create_workbook': { workbookId: 'workbookId' } },
    cacheKey: 'excel_worksheet_for_table',
  },

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  NOTION – PAGE CHAIN                                                ║
  // ║  Dynamic resolution provides parentDatabase for create_page         ║
  // ╚══════════════════════════════════════════════════════════════════════╝

  'notion_action_update_page': {
    prereqNodeType: 'notion_action_create_page',
    prereqConfig: { title: '[TEST-PREREQ] Page for update' },
    outputMapping: { page_id: 'page_id', url: 'page_url' },
  },
  'notion_action_append_to_page': {
    prereqNodeType: 'notion_action_create_page',
    prereqConfig: { title: '[TEST-PREREQ] Page for append' },
    outputMapping: { page_id: 'page_id' },
    testConfigOverrides: { content: '[TEST] Appended content block' },
  },
  'notion_action_get_page_details': {
    prereqNodeType: 'notion_action_create_page',
    prereqConfig: { title: '[TEST-PREREQ] Page for get details' },
    outputMapping: { page_id: 'page_id' },
  },
  'notion_action_duplicate_page': {
    prereqNodeType: 'notion_action_create_page',
    prereqConfig: { title: '[TEST-PREREQ] Page for duplicate' },
    outputMapping: { page_id: 'page_id' },
  },
  'notion_action_get_page_with_children': {
    prereqNodeType: 'notion_action_create_page',
    prereqConfig: { title: '[TEST-PREREQ] Page for children' },
    outputMapping: { page_id: 'page_id' },
  },
  'notion_action_list_page_content': {
    prereqNodeType: 'notion_action_create_page',
    prereqConfig: { title: '[TEST-PREREQ] Page for list content' },
    outputMapping: { page_id: 'block_id' },
  },
  'notion_action_append_page_content': {
    prereqNodeType: 'notion_action_create_page',
    prereqConfig: { title: '[TEST-PREREQ] Page for append content' },
    outputMapping: { page_id: 'page_id' },
    testConfigOverrides: { contentType: 'paragraph', content: '[TEST] Appended paragraph' },
  },
  'notion_action_get_page_property': {
    prereqNodeType: 'notion_action_create_page',
    prereqConfig: { title: '[TEST-PREREQ] Page for get property' },
    outputMapping: { page_id: 'page_id' },
    testConfigOverrides: { propertyName: 'title' },
  },
  'notion_action_add_block': {
    prereqNodeType: 'notion_action_create_page',
    prereqConfig: { title: '[TEST-PREREQ] Page for add block' },
    outputMapping: { page_id: 'page_id' },
    testConfigOverrides: { blockType: 'paragraph', content: '[TEST] Block content' },
  },
  'notion_action_get_block': {
    prereqNodeType: 'notion_action_add_block',
    prereqConfig: { blockType: 'paragraph', content: '[TEST-PREREQ] Block for get' },
    outputMapping: { block_id: 'block_id' },
  },
  'notion_action_get_block_children': {
    prereqNodeType: 'notion_action_create_page',
    prereqConfig: { title: '[TEST-PREREQ] Page for block children' },
    outputMapping: { page_id: 'block_id' },
  },
  'notion_action_create_comment': {
    prereqNodeType: 'notion_action_create_page',
    prereqConfig: { title: '[TEST-PREREQ] Page for comment' },
    outputMapping: { page_id: 'page_id' },
    testConfigOverrides: { content: '[TEST] Comment from automated test' },
  },
  'notion_action_list_comments': {
    prereqNodeType: 'notion_action_create_page',
    prereqConfig: { title: '[TEST-PREREQ] Page for list comments' },
    outputMapping: { page_id: 'block_id' },
  },
  'notion_action_delete_page_content': {
    prereqNodeType: 'notion_action_add_block',
    prereqConfig: { blockType: 'paragraph', content: '[TEST-PREREQ] Block to delete' },
    outputMapping: { block_id: 'blockIds' },
    cacheKey: 'notion_block_for_delete',
  },

  // ── Notion database chain ──
  'notion_action_update_database_info': {
    prereqNodeType: 'notion_action_create_database',
    prereqConfig: { title: '[TEST-PREREQ] DB for update info' },
    outputMapping: { database_id: 'database_id' },
    testConfigOverrides: { title: '[TEST] Updated DB title' },
  },
  'notion_action_update_database_schema': {
    prereqNodeType: 'notion_action_create_database',
    prereqConfig: { title: '[TEST-PREREQ] DB for schema update' },
    outputMapping: { database_id: 'database_id' },
    testConfigOverrides: { propertyName: 'TestColumn', propertyType: 'rich_text' },
  },
  'notion_action_advanced_query': {
    prereqNodeType: 'notion_action_create_database',
    prereqConfig: { title: '[TEST-PREREQ] DB for query' },
    outputMapping: { database_id: 'database_id' },
  },
  'notion_action_find_or_create_item': {
    prereqNodeType: 'notion_action_create_database',
    prereqConfig: { title: '[TEST-PREREQ] DB for find/create' },
    outputMapping: { database_id: 'database_id' },
    testConfigOverrides: { searchProperty: 'Name', searchValue: '[TEST] Item', createIfNotFound: true },
  },
  'notion_action_update_database_item': {
    prereqNodeType: 'notion_action_find_or_create_item',
    prereqConfig: { searchProperty: 'Name', searchValue: '[TEST-PREREQ] Item for update', createIfNotFound: true },
    outputMapping: { page_id: 'item_id' },
  },
  'notion_action_archive_database_item': {
    prereqNodeType: 'notion_action_find_or_create_item',
    prereqConfig: { searchProperty: 'Name', searchValue: '[TEST-PREREQ] Item for archive', createIfNotFound: true },
    outputMapping: { page_id: 'item_id' },
    cacheKey: 'notion_item_for_archive',
  },
  'notion_action_restore_database_item': {
    prereqNodeType: 'notion_action_archive_database_item',
    prereqConfig: {},
    outputMapping: { page_id: 'item_id' },
  },

  // ── Notion standalone with dynamic resolution ──
  'notion_action_get_user': {
    prereqNodeType: 'notion_action_list_users',
    prereqConfig: {},
    outputMapping: { 'results.0.id': 'user_id' },
  },
  'notion_action_api_call': {
    prereqNodeType: 'notion_action_search',
    prereqConfig: {},
    outputMapping: {},
    testConfigOverrides: { method: 'GET', endpoint: '/v1/users/me' },
  },

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  SLACK – MESSAGE CHAIN                                              ║
  // ║  Dynamic resolution provides channel + userId                       ║
  // ╚══════════════════════════════════════════════════════════════════════╝

  'slack_action_get_messages': {
    prereqNodeType: 'slack_action_send_message',
    prereqConfig: { message: '[TEST-PREREQ] Message for get messages' },
    outputMapping: { channel: 'channel' },
  },
  'slack_action_update_message': {
    prereqNodeType: 'slack_action_send_message',
    prereqConfig: { message: '[TEST-PREREQ] Message for update' },
    outputMapping: { channel: 'channel', messageId: 'messageId' },
    testConfigOverrides: { message: '[TEST] Updated message content' },
  },
  'slack_action_delete_message': {
    prereqNodeType: 'slack_action_send_message',
    prereqConfig: { message: '[TEST-PREREQ] Message for delete' },
    outputMapping: { channel: 'channel', messageId: 'messageId' },
    cacheKey: 'slack_msg_for_delete',
  },
  'slack_action_get_thread_messages': {
    prereqNodeType: 'slack_action_send_message',
    prereqConfig: { message: '[TEST-PREREQ] Message for thread' },
    outputMapping: { channel: 'channel', timestamp: 'threadTs' },
  },
  'slack_action_add_reaction': {
    prereqNodeType: 'slack_action_send_message',
    prereqConfig: { message: '[TEST-PREREQ] Message for reaction' },
    outputMapping: { channel: 'channel', timestamp: 'timestamp' },
    testConfigOverrides: { emoji: 'thumbsup' },
  },
  'slack_action_remove_reaction': {
    prereqNodeType: 'slack_action_send_message',
    prereqConfig: { message: '[TEST-PREREQ] Message for remove reaction' },
    outputMapping: { channel: 'channel', timestamp: 'timestamp' },
    testConfigOverrides: { emoji: 'thumbsup' },
    cacheKey: 'slack_msg_for_remove_reaction',
  },
  'slack_action_pin_message': {
    prereqNodeType: 'slack_action_send_message',
    prereqConfig: { message: '[TEST-PREREQ] Message for pin' },
    outputMapping: { channel: 'channel', messageId: 'messageId' },
  },
  'slack_action_unpin_message': {
    prereqNodeType: 'slack_action_pin_message',
    prereqConfig: {},
    outputMapping: { channel: 'channel', messageId: 'messageId' },
    cacheKey: 'slack_pin_for_unpin',
  },

  // ── Slack channel ops (dynamic channel resolution) ──
  'slack_action_set_channel_topic': {
    prereqNodeType: 'slack_action_join_channel',
    prereqConfig: {},
    outputMapping: { channel: 'channel' },
    testConfigOverrides: { topic: '[TEST] Topic set by automated test' },
    cacheKey: 'slack_join_for_topic',
  },
  'slack_action_set_channel_purpose': {
    prereqNodeType: 'slack_action_join_channel',
    prereqConfig: {},
    outputMapping: { channel: 'channel' },
    testConfigOverrides: { purpose: '[TEST] Purpose set by automated test' },
    cacheKey: 'slack_join_for_purpose',
  },
  'slack_action_get_channel_info': {
    prereqNodeType: 'slack_action_list_channels',
    prereqConfig: {},
    outputMapping: { 'channels.0.id': 'channel' },
  },
  'slack_action_join_channel': {
    prereqNodeType: 'slack_action_list_channels',
    prereqConfig: {},
    outputMapping: { 'channels.0.id': 'channel' },
  },

  // ── Slack user ops (dynamic user resolution) ──
  'slack_action_send_direct_message': {
    prereqNodeType: 'slack_action_list_users',
    prereqConfig: {},
    outputMapping: { 'users.0.id': 'user' },
    testConfigOverrides: { message: '[TEST] Direct message from automated test' },
  },
  'slack_action_get_user_info': {
    prereqNodeType: 'slack_action_list_users',
    prereqConfig: {},
    outputMapping: { 'users.0.id': 'userId' },
  },

  // ── Slack schedule ──
  'slack_action_schedule_message': {
    prereqNodeType: 'slack_action_list_channels',
    prereqConfig: {},
    outputMapping: { 'channels.0.id': 'channel' },
    testConfigOverrides: { message: '[TEST] Scheduled message', scheduleType: 'delay', delayMinutes: '5' },
  },
  'slack_action_cancel_scheduled_message': {
    prereqNodeType: 'slack_action_schedule_message',
    prereqConfig: { message: '[TEST-PREREQ] Message to cancel', scheduleType: 'delay', delayMinutes: '30' },
    outputMapping: { scheduledMessageId: 'scheduledMessageId', channelId: 'channel' },
  },
  'slack_action_list_scheduled_messages': {
    prereqNodeType: 'slack_action_list_channels',
    prereqConfig: {},
    outputMapping: { 'channels.0.id': 'channel' },
  },

  // ── Slack reminder ──
  'slack_action_add_reminder': {
    prereqNodeType: 'slack_action_list_users',
    prereqConfig: {},
    outputMapping: {},
    testConfigOverrides: { text: '[TEST] Reminder from automated test', timeType: 'relative', relativeTime: '30', relativeUnit: 'minutes' },
  },

  // ── Slack file ops ──
  'slack_action_download_file': {
    prereqNodeType: 'slack_action_upload_file',
    prereqConfig: { content: 'Test file for download', filename: 'test-download.txt', title: '[TEST-PREREQ] File for download' },
    outputMapping: { 'file.id': 'fileId' },
    cacheKey: 'slack_file_for_download',
  },
  'slack_action_get_file_info': {
    prereqNodeType: 'slack_action_upload_file',
    prereqConfig: { content: 'Test file for info', filename: 'test-info.txt', title: '[TEST-PREREQ] File for info' },
    outputMapping: { 'file.id': 'fileId' },
    cacheKey: 'slack_file_for_info',
  },

  // ── Slack channel member ops ──
  'slack_action_invite_users_to_channel': {
    prereqNodeType: 'slack_action_list_users',
    prereqConfig: {},
    outputMapping: { 'users.0.id': 'users' },
    // channel resolved dynamically
  },
  'slack_action_remove_user_from_channel': {
    prereqNodeType: 'slack_action_list_users',
    prereqConfig: {},
    outputMapping: { 'users.0.id': 'user' },
    // channel resolved dynamically
  },

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  DISCORD                                                            ║
  // ║  Dynamic resolution provides guildId + channelId                    ║
  // ╚══════════════════════════════════════════════════════════════════════╝

  'discord_action_edit_message': {
    prereqNodeType: 'discord_action_send_message',
    prereqConfig: { message: '[TEST-PREREQ] Message for edit' },
    outputMapping: { id: 'messageId', channel_id: 'channelId' },
    testConfigOverrides: { content: '[TEST] Edited message content' },
  },
  'discord_action_fetch_messages': {
    prereqNodeType: 'discord_action_send_message',
    prereqConfig: { message: '[TEST-PREREQ] Message for fetch' },
    outputMapping: { channel_id: 'channelId' },
    testConfigOverrides: { limit: '5' },
  },
  'discord_action_delete_message': {
    prereqNodeType: 'discord_action_send_message',
    prereqConfig: { message: '[TEST-PREREQ] Message for delete' },
    outputMapping: { id: 'messageId', channel_id: 'channelId' },
    testConfigOverrides: { selectionMode: 'specific' },
    cacheKey: 'discord_msg_for_delete',
  },

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  TEAMS                                                              ║
  // ╚══════════════════════════════════════════════════════════════════════╝

  'teams_action_get_team_members': {
    prereqNodeType: 'teams_action_create_team',
    prereqConfig: { displayName: '[TEST-PREREQ] Team for members', description: 'Auto-created for testing' },
    outputMapping: { teamId: 'teamId' },
  },
  'teams_action_create_channel': {
    prereqNodeType: 'teams_action_create_team',
    prereqConfig: { displayName: '[TEST-PREREQ] Team for channel', description: 'Auto-created for testing' },
    outputMapping: { teamId: 'teamId' },
    testConfigOverrides: { channelName: '[TEST] Channel', description: 'Test channel created by automated testing' },
  },
  'teams_action_get_channel_details': {
    prereqNodeType: 'teams_action_create_channel',
    prereqConfig: { channelName: '[TEST-PREREQ] Channel for details', description: 'Auto-created' },
    outputMapping: { channelId: 'channelId', teamId: 'teamId' },
  },
  'teams_action_send_message': {
    prereqNodeType: 'teams_action_create_channel',
    prereqConfig: { channelName: '[TEST-PREREQ] Channel for message', description: 'Auto-created' },
    outputMapping: { channelId: 'channelId', teamId: 'teamId' },
    testConfigOverrides: { message: '[TEST] Message from automated test' },
  },
  'teams_action_reply_to_message': {
    prereqNodeType: 'teams_action_send_message',
    prereqConfig: { message: '[TEST-PREREQ] Message for reply' },
    outputMapping: { messageId: 'messageId', channelId: 'channelId' },
    additionalCacheMapping: { 'teams_action_create_team': { teamId: 'teamId' } },
    testConfigOverrides: { replyContent: '[TEST] Reply from automated test' },
  },
  'teams_action_find_message': {
    prereqNodeType: 'teams_action_send_message',
    prereqConfig: { message: '[TEST-PREREQ] Message for find' },
    outputMapping: { messageId: 'messageId', channelId: 'channelId' },
    additionalCacheMapping: { 'teams_action_create_team': { teamId: 'teamId' } },
    testConfigOverrides: { messageType: 'channel' },
  },
  'teams_action_edit_message': {
    prereqNodeType: 'teams_action_send_message',
    prereqConfig: { message: '[TEST-PREREQ] Message for edit' },
    outputMapping: { messageId: 'messageId', channelId: 'channelId' },
    additionalCacheMapping: { 'teams_action_create_team': { teamId: 'teamId' } },
    testConfigOverrides: { messageType: 'channel', newContent: '[TEST] Edited message' },
  },
  'teams_action_send_adaptive_card': {
    prereqNodeType: 'teams_action_create_channel',
    prereqConfig: { channelName: '[TEST-PREREQ] Channel for card', description: 'Auto-created' },
    outputMapping: { channelId: 'channelId', teamId: 'teamId' },
    testConfigOverrides: { cardTitle: '[TEST] Adaptive Card', cardText: 'Test card body' },
    cacheKey: 'teams_channel_for_card',
  },
  'teams_action_add_reaction': {
    prereqNodeType: 'teams_action_send_message',
    prereqConfig: { message: '[TEST-PREREQ] Message for reaction' },
    outputMapping: { messageId: 'messageId', channelId: 'channelId' },
    additionalCacheMapping: { 'teams_action_create_team': { teamId: 'teamId' } },
    testConfigOverrides: { reactionType: 'like' },
    cacheKey: 'teams_msg_for_reaction',
  },
  'teams_action_remove_reaction': {
    prereqNodeType: 'teams_action_send_message',
    prereqConfig: { message: '[TEST-PREREQ] Message for remove reaction' },
    outputMapping: { messageId: 'messageId', channelId: 'channelId' },
    additionalCacheMapping: { 'teams_action_create_team': { teamId: 'teamId' } },
    testConfigOverrides: { reactionType: 'like' },
    cacheKey: 'teams_msg_for_remove_reaction',
  },
  'teams_action_add_member_to_team': {
    prereqNodeType: 'teams_action_create_team',
    prereqConfig: { displayName: '[TEST-PREREQ] Team for add member', description: 'Auto-created' },
    outputMapping: { teamId: 'teamId' },
    testConfigOverrides: { userEmail: 'test@chainreact.app' },
  },
  'teams_action_delete_message': {
    prereqNodeType: 'teams_action_send_message',
    prereqConfig: { message: '[TEST-PREREQ] Message for delete' },
    outputMapping: { messageId: 'messageId', channelId: 'channelId' },
    additionalCacheMapping: { 'teams_action_create_team': { teamId: 'teamId' } },
    testConfigOverrides: { messageType: 'channel' },
    cacheKey: 'teams_msg_for_delete',
  },

  // ── Teams meetings ──
  'teams_action_schedule_meeting': {
    prereqNodeType: 'teams_action_create_team',
    prereqConfig: { displayName: '[TEST-PREREQ] Team for meeting', description: 'Auto-created' },
    outputMapping: {},
    testConfigOverrides: {
      subject: '[TEST] Automated meeting',
      startTime: new Date(Date.now() + 86400000).toISOString(),
      endTime: new Date(Date.now() + 90000000).toISOString(),
    },
  },
  'teams_action_update_meeting': {
    prereqNodeType: 'teams_action_schedule_meeting',
    prereqConfig: { subject: '[TEST-PREREQ] Meeting for update', startTime: new Date(Date.now() + 86400000).toISOString(), endTime: new Date(Date.now() + 90000000).toISOString() },
    outputMapping: { eventId: 'meetingId' },
    testConfigOverrides: { subject: '[TEST] Updated meeting' },
  },
  'teams_action_end_meeting': {
    prereqNodeType: 'teams_action_schedule_meeting',
    prereqConfig: { subject: '[TEST-PREREQ] Meeting for cancel', startTime: new Date(Date.now() + 86400000).toISOString(), endTime: new Date(Date.now() + 90000000).toISOString() },
    outputMapping: { eventId: 'meetingId' },
    cacheKey: 'teams_meeting_for_cancel',
  },

  // ── Teams chat ──
  'teams_action_create_group_chat': {
    prereqNodeType: 'teams_action_create_team',
    prereqConfig: { displayName: '[TEST-PREREQ] Team for chat', description: 'Auto-created' },
    outputMapping: {},
    testConfigOverrides: { chatName: '[TEST] Group Chat', members: 'test@chainreact.app' },
  },
  'teams_action_send_chat_message': {
    prereqNodeType: 'teams_action_create_group_chat',
    prereqConfig: { chatName: '[TEST-PREREQ] Chat for message', members: 'test@chainreact.app' },
    outputMapping: { chatId: 'chatId' },
    testConfigOverrides: { message: '[TEST] Chat message from automated test' },
  },

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  SHOPIFY                                                            ║
  // ╚══════════════════════════════════════════════════════════════════════╝

  'shopify_action_update_product': {
    prereqNodeType: 'shopify_action_create_product',
    prereqConfig: { title: '[TEST-PREREQ] Product for update', product_type: 'Test', status: 'DRAFT' },
    outputMapping: { product_id: 'product_id' },
    testConfigOverrides: { title: '[TEST] Updated product' },
  },
  'shopify_action_create_product_variant': {
    prereqNodeType: 'shopify_action_create_product',
    prereqConfig: { title: '[TEST-PREREQ] Product for variant', product_type: 'Test', status: 'DRAFT' },
    outputMapping: { product_id: 'product_id' },
    testConfigOverrides: { option1: 'Large', price: '19.99' },
  },
  'shopify_action_update_product_variant': {
    prereqNodeType: 'shopify_action_create_product',
    prereqConfig: { title: '[TEST-PREREQ] Product for variant update', product_type: 'Test', status: 'DRAFT' },
    outputMapping: { variant_id: 'variant_id' },
    testConfigOverrides: { price: '24.99' },
  },
  'shopify_action_update_inventory': {
    prereqNodeType: 'shopify_action_create_product',
    prereqConfig: { title: '[TEST-PREREQ] Product for inventory', product_type: 'Test', status: 'ACTIVE' },
    outputMapping: { variant_id: 'inventory_item_id' },
    testConfigOverrides: { adjustment_type: 'set', quantity: '10' },
    // Note: inventory_item_id should ideally come from inventory query, but variant_id is used as fallback
  },
  'shopify_action_create_order': {
    prereqNodeType: 'shopify_action_create_product',
    prereqConfig: { title: '[TEST-PREREQ] Product for order', product_type: 'Test', status: 'ACTIVE' },
    outputMapping: { variant_gid: 'variant_gid' },
    testConfigOverrides: { email: 'test@chainreact.app' }, // line_items resolved from variant_gid prereq
    cacheKey: 'shopify_product_for_order',
  },
  'shopify_action_update_order_status': {
    prereqNodeType: 'shopify_action_create_order',
    prereqConfig: {},
    outputMapping: { order_id: 'order_id' },
    testConfigOverrides: { action: 'add_note', note: '[TEST] Status update' },
  },
  'shopify_action_add_order_note': {
    prereqNodeType: 'shopify_action_create_order',
    prereqConfig: {},
    outputMapping: { order_id: 'order_id' },
    testConfigOverrides: { note: '[TEST] Note from automated test' },
  },
  'shopify_action_create_fulfillment': {
    prereqNodeType: 'shopify_action_create_order',
    prereqConfig: {},
    outputMapping: { order_id: 'order_id' },
  },
  'shopify_action_create_customer': {
    prereqNodeType: 'shopify_action_create_product',
    prereqConfig: {},
    outputMapping: {},
    testConfigOverrides: { email: `test-${Date.now()}@chainreact-test.app`, first_name: 'Test', last_name: 'Customer' },
    cacheKey: 'shopify_customer_stub',
  },
  'shopify_action_update_customer': {
    prereqNodeType: 'shopify_action_create_customer',
    prereqConfig: { email: `test-upd-${Date.now()}@chainreact-test.app`, first_name: 'TestUpd', last_name: 'Customer' },
    outputMapping: { customer_id: 'customer_id' },
    testConfigOverrides: { first_name: 'UpdatedTest' },
  },

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  MONDAY                                                             ║
  // ╚══════════════════════════════════════════════════════════════════════╝

  'monday_action_get_board': {
    prereqNodeType: 'monday_action_create_board',
    prereqConfig: { boardName: '[TEST-PREREQ] Board for get', boardKind: 'public' },
    outputMapping: { boardId: 'boardId' },
  },
  'monday_action_list_groups': {
    prereqNodeType: 'monday_action_create_board',
    prereqConfig: { boardName: '[TEST-PREREQ] Board for groups', boardKind: 'public' },
    outputMapping: { boardId: 'boardId' },
  },
  'monday_action_add_column': {
    prereqNodeType: 'monday_action_create_board',
    prereqConfig: { boardName: '[TEST-PREREQ] Board for column', boardKind: 'public' },
    outputMapping: { boardId: 'boardId' },
    testConfigOverrides: { columnTitle: '[TEST] Column', columnType: 'text' },
  },
  'monday_action_duplicate_board': {
    prereqNodeType: 'monday_action_create_board',
    prereqConfig: { boardName: '[TEST-PREREQ] Board for duplicate', boardKind: 'public' },
    outputMapping: { boardId: 'boardId' },
    cacheKey: 'monday_board_for_dup',
  },
  'monday_action_list_items': {
    prereqNodeType: 'monday_action_create_board',
    prereqConfig: { boardName: '[TEST-PREREQ] Board for list items', boardKind: 'public' },
    outputMapping: { boardId: 'boardId' },
  },
  'monday_action_create_group': {
    prereqNodeType: 'monday_action_create_board',
    prereqConfig: { boardName: '[TEST-PREREQ] Board for group', boardKind: 'public' },
    outputMapping: { boardId: 'boardId' },
    testConfigOverrides: { groupTitle: '[TEST] Group' },
  },
  'monday_action_create_item': {
    prereqNodeType: 'monday_action_create_group',
    prereqConfig: { groupTitle: '[TEST-PREREQ] Group for item' },
    outputMapping: { groupId: 'groupId' },
    additionalCacheMapping: { 'monday_action_create_board': { boardId: 'boardId' } },
    testConfigOverrides: { itemName: '[TEST] Item' },
  },
  'monday_action_get_item': {
    prereqNodeType: 'monday_action_create_item',
    prereqConfig: { itemName: '[TEST-PREREQ] Item for get' },
    outputMapping: { itemId: 'itemId' },
  },
  'monday_action_update_item': {
    prereqNodeType: 'monday_action_add_column',
    prereqConfig: { columnTitle: '[TEST-PREREQ] Column for update', columnType: 'text' },
    outputMapping: { columnId: 'columnId' },
    additionalCacheMapping: { 'monday_action_create_item': { itemId: 'itemId' }, 'monday_action_create_board': { boardId: 'boardId' } },
    testConfigOverrides: { columnValue: '[TEST] Updated value' },
  },
  'monday_action_create_update': {
    prereqNodeType: 'monday_action_create_item',
    prereqConfig: { itemName: '[TEST-PREREQ] Item for update post' },
    outputMapping: { itemId: 'itemId' },
    testConfigOverrides: { body: '[TEST] Update from automated test' },
  },
  'monday_action_list_updates': {
    prereqNodeType: 'monday_action_create_item',
    prereqConfig: { itemName: '[TEST-PREREQ] Item for list updates' },
    outputMapping: { itemId: 'itemId' },
  },
  'monday_action_create_subitem': {
    prereqNodeType: 'monday_action_create_item',
    prereqConfig: { itemName: '[TEST-PREREQ] Item for subitem' },
    outputMapping: { itemId: 'parentItemId' },
    testConfigOverrides: { itemName: '[TEST] Subitem' },
  },
  'monday_action_list_subitems': {
    prereqNodeType: 'monday_action_create_item',
    prereqConfig: { itemName: '[TEST-PREREQ] Item for list subitems' },
    outputMapping: { itemId: 'parentItemId' },
  },
  'monday_action_duplicate_item': {
    prereqNodeType: 'monday_action_create_item',
    prereqConfig: { itemName: '[TEST-PREREQ] Item for duplicate' },
    outputMapping: { itemId: 'itemId' },
    additionalCacheMapping: { 'monday_action_create_board': { boardId: 'boardId' } },
  },
  'monday_action_move_item': {
    prereqNodeType: 'monday_action_create_group',
    prereqConfig: { groupTitle: '[TEST-PREREQ] Target group for move' },
    outputMapping: { groupId: 'targetGroupId' },
    additionalCacheMapping: { 'monday_action_create_item': { itemId: 'itemId' }, 'monday_action_create_board': { boardId: 'sourceBoardId' } },
    cacheKey: 'monday_group_for_move',
  },
  'monday_action_archive_item': {
    prereqNodeType: 'monday_action_create_item',
    prereqConfig: { itemName: '[TEST-PREREQ] Item for archive' },
    outputMapping: { itemId: 'itemId' },
    cacheKey: 'monday_item_for_archive',
  },
  'monday_action_delete_item': {
    prereqNodeType: 'monday_action_create_item',
    prereqConfig: { itemName: '[TEST-PREREQ] Item for delete' },
    outputMapping: { itemId: 'itemId' },
    cacheKey: 'monday_item_for_delete',
  },
  'monday_action_get_user': {
    prereqNodeType: 'monday_action_list_users',
    prereqConfig: {},
    outputMapping: { 'users.0.id': 'userId' },
  },
  'monday_action_add_file': {
    prereqNodeType: 'monday_action_add_column',
    prereqConfig: { columnTitle: '[TEST-PREREQ] File column', columnType: 'file' },
    outputMapping: { columnId: 'columnId' },
    additionalCacheMapping: { 'monday_action_create_item': { itemId: 'itemId' } },
    testConfigOverrides: { sourceType: 'url', fileUrl: 'https://httpbin.org/robots.txt', fileName: 'test-file.txt' },
    cacheKey: 'monday_column_for_file',
  },
  'monday_action_download_file': {
    prereqNodeType: 'monday_action_add_file',
    prereqConfig: {},
    outputMapping: { columnId: 'columnId', itemId: 'itemId', fileName: 'fileName' },
    additionalCacheMapping: { 'monday_action_create_item': { itemId: 'itemId' } },
    cacheKey: 'monday_file_for_download',
  },

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  ONEDRIVE                                                           ║
  // ╚══════════════════════════════════════════════════════════════════════╝

  'onedrive_action_find_item_by_id': {
    prereqNodeType: 'onedrive_action_create_folder',
    prereqConfig: { folderName: '[TEST-PREREQ] Folder for find by ID' },
    outputMapping: { id: 'itemId' },
    testConfigOverrides: { includeMetadata: false },
  },
  'onedrive_action_get_file': {
    prereqNodeType: 'onedrive_action_create_folder',
    prereqConfig: { folderName: '[TEST-PREREQ] Folder for get file' },
    outputMapping: { id: 'fileId' },
  },
  'onedrive_action_rename_item': {
    prereqNodeType: 'onedrive_action_create_folder',
    prereqConfig: { folderName: '[TEST-PREREQ] Folder for rename' },
    outputMapping: { id: 'folderIdToRename' },
    testConfigOverrides: { itemType: 'folder', newName: '[TEST] Renamed folder' },
    cacheKey: 'onedrive_folder_for_rename',
  },
  'onedrive_action_create_sharing_link': {
    prereqNodeType: 'onedrive_action_create_folder',
    prereqConfig: { folderName: '[TEST-PREREQ] Folder for sharing link' },
    outputMapping: { id: 'folderIdToShare' },
    testConfigOverrides: { itemType: 'folder', linkType: 'view', linkScope: 'anonymous' },
  },
  'onedrive_action_send_sharing_invitation': {
    prereqNodeType: 'onedrive_action_create_folder',
    prereqConfig: { folderName: '[TEST-PREREQ] Folder for sharing invitation' },
    outputMapping: { id: 'folderIdToShare' },
    testConfigOverrides: { itemType: 'folder', recipients: 'chainreactapp@gmail.com', role: 'read', sendInvitation: true, requireSignIn: false },
    cacheKey: 'onedrive_folder_for_invite',
  },
  'onedrive_action_copy_item': {
    prereqNodeType: 'onedrive_action_create_folder',
    prereqConfig: { folderName: '[TEST-PREREQ] Folder for copy' },
    outputMapping: { id: 'sourceFolderIdToCopy' },
    testConfigOverrides: { itemType: 'folder', newName: '[TEST] Copied folder' },
    cacheKey: 'onedrive_folder_for_copy',
  },
  'onedrive_action_move_item': {
    prereqNodeType: 'onedrive_action_create_folder',
    prereqConfig: { folderName: '[TEST-PREREQ] Folder for move' },
    outputMapping: { id: 'sourceFolderIdToMove' },
    testConfigOverrides: { itemType: 'folder', destinationFolderId: 'root' },
    cacheKey: 'onedrive_folder_for_move',
  },

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  MAILCHIMP                                                          ║
  // ║  Dynamic resolution provides audience_id                            ║
  // ╚══════════════════════════════════════════════════════════════════════╝

  'mailchimp_action_add_subscriber': {
    prereqNodeType: 'mailchimp_action_get_subscribers',
    prereqConfig: {},
    outputMapping: {},
    // audience_id resolved dynamically
    testConfigOverrides: { email: `test-${Date.now()}@chainreact-test.app`, status: 'subscribed', first_name: 'Test', last_name: 'Subscriber' },
  },
  'mailchimp_action_get_subscriber': {
    prereqNodeType: 'mailchimp_action_add_subscriber',
    prereqConfig: { email: `test-get-${Date.now()}@chainreact-test.app`, status: 'subscribed', first_name: 'Test', last_name: 'GetSub' },
    outputMapping: { email: 'email' },
    // audience_id resolved dynamically
  },
  'mailchimp_action_update_subscriber': {
    prereqNodeType: 'mailchimp_action_add_subscriber',
    prereqConfig: { email: `test-upd-${Date.now()}@chainreact-test.app`, status: 'subscribed', first_name: 'Test', last_name: 'UpdateSub' },
    outputMapping: { email: 'subscriber_email' },
    testConfigOverrides: { first_name: 'UpdatedTest' },
    cacheKey: 'mailchimp_sub_for_update',
  },
  'mailchimp_action_add_tag': {
    prereqNodeType: 'mailchimp_action_add_subscriber',
    prereqConfig: { email: `test-tag-${Date.now()}@chainreact-test.app`, status: 'subscribed', first_name: 'Test', last_name: 'TagSub' },
    outputMapping: { email: 'email' },
    testConfigOverrides: { tags: 'test-tag' },
    cacheKey: 'mailchimp_sub_for_tag',
  },
  'mailchimp_action_remove_tag': {
    prereqNodeType: 'mailchimp_action_add_tag',
    prereqConfig: { tags: 'test-tag-remove' },
    outputMapping: { email: 'email' },
    testConfigOverrides: { tags: 'test-tag-remove' },
  },
  'mailchimp_action_add_note': {
    prereqNodeType: 'mailchimp_action_add_subscriber',
    prereqConfig: { email: `test-note-${Date.now()}@chainreact-test.app`, status: 'subscribed', first_name: 'Test', last_name: 'NoteSub' },
    outputMapping: { email: 'email' },
    testConfigOverrides: { note: '[TEST] Note from automated test' },
    cacheKey: 'mailchimp_sub_for_note',
  },
  'mailchimp_action_create_event': {
    prereqNodeType: 'mailchimp_action_add_subscriber',
    prereqConfig: { email: `test-evt-${Date.now()}@chainreact-test.app`, status: 'subscribed', first_name: 'Test', last_name: 'EvtSub' },
    outputMapping: { email: 'email' },
    testConfigOverrides: { event_name: 'test_event' },
    cacheKey: 'mailchimp_sub_for_event',
  },
  'mailchimp_action_unsubscribe_subscriber': {
    prereqNodeType: 'mailchimp_action_add_subscriber',
    prereqConfig: { email: `test-unsub-${Date.now()}@chainreact-test.app`, status: 'subscribed', first_name: 'Test', last_name: 'UnsubSub' },
    outputMapping: { email: 'email' },
    cacheKey: 'mailchimp_sub_for_unsub',
  },
  'mailchimp_action_remove_subscriber': {
    prereqNodeType: 'mailchimp_action_add_subscriber',
    prereqConfig: { email: `test-rem-${Date.now()}@chainreact-test.app`, status: 'subscribed', first_name: 'Test', last_name: 'RemSub' },
    outputMapping: { email: 'email' },
    cacheKey: 'mailchimp_sub_for_remove',
  },
  'mailchimp_action_create_campaign': {
    prereqNodeType: 'mailchimp_action_get_subscribers',
    prereqConfig: {},
    outputMapping: {},
    // audience_id resolved dynamically
    testConfigOverrides: { type: 'regular', subject_line: '[TEST] Campaign', from_name: 'ChainReact Test', reply_to: 'test@chainreact.app', html_content: '<p>[TEST] Campaign content from automated testing</p>' },
  },
  'mailchimp_action_get_campaign': {
    prereqNodeType: 'mailchimp_action_create_campaign',
    prereqConfig: { type: 'regular', subject_line: '[TEST-PREREQ] Campaign for get', from_name: 'ChainReact Test', reply_to: 'test@chainreact.app' },
    outputMapping: { campaign_id: 'campaign_id' },
  },
  'mailchimp_action_get_campaign_stats': {
    prereqNodeType: 'mailchimp_action_create_campaign',
    prereqConfig: { type: 'regular', subject_line: '[TEST-PREREQ] Campaign for stats', from_name: 'ChainReact Test', reply_to: 'test@chainreact.app' },
    outputMapping: { campaign_id: 'campaign_id' },
  },
  'mailchimp_action_schedule_campaign': {
    prereqNodeType: 'mailchimp_action_create_campaign',
    prereqConfig: { type: 'regular', subject_line: '[TEST-PREREQ] Campaign for schedule', from_name: 'ChainReact Test', reply_to: 'test@chainreact.app' },
    outputMapping: { campaign_id: 'campaign_id' },
    testConfigOverrides: { schedule_time: new Date(Date.now() + 7 * 86400000).toISOString() },
    cacheKey: 'mailchimp_campaign_for_schedule',
  },
  'mailchimp_action_get_subscribers': {
    prereqNodeType: 'mailchimp_action_create_audience',
    prereqConfig: {},
    outputMapping: {},
    // audience_id resolved dynamically — this is effectively a no-op prereq
  },
  'mailchimp_action_create_segment': {
    prereqNodeType: 'mailchimp_action_get_subscribers',
    prereqConfig: {},
    outputMapping: {},
    // audience_id resolved dynamically
    testConfigOverrides: { name: '[TEST] Segment', conditions: JSON.stringify([]) },
  },

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  MICROSOFT ONENOTE                                                  ║
  // ║  Dynamic resolution provides notebookId + sectionId                 ║
  // ╚══════════════════════════════════════════════════════════════════════╝

  'microsoft-onenote_action_get_notebook_details': {
    prereqNodeType: 'microsoft-onenote_action_list_notebooks',
    prereqConfig: {},
    outputMapping: { 'notebooks.0.id': 'notebookId' },
  },
  'microsoft-onenote_action_list_sections': {
    prereqNodeType: 'microsoft-onenote_action_list_notebooks',
    prereqConfig: {},
    outputMapping: { 'notebooks.0.id': 'notebookId' },
  },
  'microsoft-onenote_action_get_section_details': {
    prereqNodeType: 'microsoft-onenote_action_list_sections',
    prereqConfig: {},
    outputMapping: { 'sections.0.id': 'sectionId' },
  },
  'microsoft-onenote_action_create_section': {
    prereqNodeType: 'microsoft-onenote_action_list_notebooks',
    prereqConfig: {},
    outputMapping: { 'notebooks.0.id': 'notebookId' },
    testConfigOverrides: { displayName: `[TEST] Section ${Date.now()}` },
  },
  'microsoft-onenote_action_create_page': {
    prereqNodeType: 'microsoft-onenote_action_create_section',
    prereqConfig: { displayName: `[TEST-PREREQ] Section for page ${Date.now()}` },
    outputMapping: { id: 'sectionId' },
    testConfigOverrides: { title: '[TEST] Page from automated test', content: '<p>Test page content</p>' },
  },
  'microsoft-onenote_action_get_page_content': {
    prereqNodeType: 'microsoft-onenote_action_create_page',
    prereqConfig: { title: '[TEST-PREREQ] Page for content', content: '<p>Content to read</p>' },
    outputMapping: { id: 'pageId' },
  },
  'microsoft-onenote_action_update_page': {
    prereqNodeType: 'microsoft-onenote_action_create_page',
    prereqConfig: { title: '[TEST-PREREQ] Page for update', content: '<p>Content to update</p>' },
    outputMapping: { id: 'pageId' },
    testConfigOverrides: { content: '<p>Updated content</p>' },
  },
  'microsoft-onenote_action_list_pages': {
    prereqNodeType: 'microsoft-onenote_action_create_section',
    prereqConfig: { displayName: `[TEST-PREREQ] Section for list pages ${Date.now()}` },
    outputMapping: { id: 'sectionId' },
    cacheKey: 'onenote_section_for_list_pages',
  },
  'microsoft-onenote_action_copy_page': {
    prereqNodeType: 'microsoft-onenote_action_create_section',
    prereqConfig: { displayName: `[TEST-PREREQ] Destination section for copy ${Date.now()}` },
    outputMapping: { id: 'destinationSectionId' },
    additionalCacheMapping: { 'microsoft-onenote_action_create_page': { id: 'pageId' } },
    cacheKey: 'onenote_section_for_copy_dest',
  },
  'microsoft-onenote_action_delete_page': {
    prereqNodeType: 'microsoft-onenote_action_create_page',
    prereqConfig: { title: '[TEST-PREREQ] Page for delete', content: '<p>Content to delete</p>' },
    outputMapping: { id: 'pageId' },
    cacheKey: 'onenote_page_for_delete',
  },

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  STRIPE (auth may be broken — prereqs ready for when auth works)    ║
  // ╚══════════════════════════════════════════════════════════════════════╝

  'stripe_action_update_customer': {
    prereqNodeType: 'stripe_action_create_customer',
    prereqConfig: { email: `test-stripe-${Date.now()}@chainreact-test.app`, name: 'Test Customer' },
    outputMapping: { customerId: 'customerId' },
    testConfigOverrides: { name: 'Updated Customer' },
  },
  'stripe_action_create_invoice': {
    prereqNodeType: 'stripe_action_create_customer',
    prereqConfig: { email: `test-inv-${Date.now()}@chainreact-test.app`, name: 'Invoice Customer' },
    outputMapping: { customerId: 'customerId' },
    testConfigOverrides: { description: '[TEST] Invoice from automated test' },
    cacheKey: 'stripe_customer_for_invoice',
  },
  'stripe_action_create_subscription': {
    prereqNodeType: 'stripe_action_create_customer',
    prereqConfig: { email: `test-sub-${Date.now()}@chainreact-test.app`, name: 'Sub Customer' },
    outputMapping: { customerId: 'customerId' },
    // priceId needs to be resolved or provided
    cacheKey: 'stripe_customer_for_sub',
  },

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  AI ACTIONS (simple test data fixes)                                ║
  // ╚══════════════════════════════════════════════════════════════════════╝

  'ai_prompt': {
    prereqNodeType: 'ai_summarize',
    prereqConfig: {},
    outputMapping: {},
    testConfigOverrides: { inputData: 'Hello, please generate a test response.', contentType: 'custom', prompt: 'Write a one-sentence greeting' },
  },
  'ai_generate': {
    prereqNodeType: 'ai_summarize',
    prereqConfig: {},
    outputMapping: {},
    testConfigOverrides: { inputData: 'Generate a one-line test response for automated testing.', contentType: 'custom', prompt: 'Generate content' },
  },

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  GOOGLE ANALYTICS                                                   ║
  // ╚══════════════════════════════════════════════════════════════════════╝

  'google_analytics_action_send_event': {
    prereqNodeType: 'google_analytics_action_create_measurement_secret',
    prereqConfig: { displayName: '[TEST-PREREQ] API Secret for send event test' },
    outputMapping: { secret_value: 'apiSecret' },
  },

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  GITHUB                                                             ║
  // ╚══════════════════════════════════════════════════════════════════════╝

  'github_action_add_comment': {
    prereqNodeType: 'github_action_create_issue',
    prereqConfig: { title: '[TEST-PREREQ] Issue for comment test', body: 'Auto-created prerequisite.' },
    outputMapping: { issueNumber: 'issueNumber' },
    testConfigOverrides: { body: '[TEST] Automated comment' },
  },
  'github_action_create_gist': {
    prereqNodeType: 'github_action_create_issue',
    prereqConfig: {},
    outputMapping: {},
    testConfigOverrides: { description: '[TEST] Gist from automated test', filename: 'test.txt', content: 'Test gist content', isPublic: false },
  },

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  FACEBOOK                                                           ║
  // ╚══════════════════════════════════════════════════════════════════════╝

  'facebook_action_delete_post': {
    prereqNodeType: 'facebook_action_create_post',
    prereqConfig: { message: '[TEST-PREREQ] Post for delete test' },
    outputMapping: { postId: 'postId' },
  },
  'facebook_action_update_post': {
    prereqNodeType: 'facebook_action_create_post',
    prereqConfig: { message: '[TEST-PREREQ] Post for update test' },
    outputMapping: { postId: 'postId' },
    testConfigOverrides: { message: '[TEST] Updated post message' },
  },

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  TRELLO                                                             ║
  // ╚══════════════════════════════════════════════════════════════════════╝

  'trello_action_add_label_to_card': {
    prereqNodeType: 'trello_action_create_card',
    prereqConfig: { name: '[TEST-PREREQ] Card for label' },
    outputMapping: { id: 'cardId' },
    // labelId needs to be resolved
  },
  'trello_action_create_checklist_item': {
    prereqNodeType: 'trello_action_add_checklist',
    prereqConfig: { name: '[TEST-PREREQ] Checklist for item' },
    outputMapping: { id: 'checklistId' },
    testConfigOverrides: { name: '[TEST] Checklist item' },
  },
}

// ── Dynamic config resolution ────────────────────────────────────────────

const dynamicCache = new Map<string, string>()

export async function resolveDynamicConfig(
  providerId: string,
  userId: string,
  testConfig: Record<string, any>
): Promise<Record<string, any>> {

  // ── GitHub ──
  if (providerId === 'github' && (!testConfig.repository || testConfig.repository === '')) {
    const cacheKey = `github_repository_${userId}`
    if (dynamicCache.has(cacheKey)) {
      testConfig.repository = dynamicCache.get(cacheKey)!
      return testConfig
    }
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'github')
      const userRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github.v3+json' }
      })
      if (userRes.ok) {
        const userData = await userRes.json()
        const owner = userData.login
        const repoRes = await fetch(`https://api.github.com/repos/${owner}/TEST-Repository`, {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github.v3+json' }
        })
        if (repoRes.ok) {
          testConfig.repository = `${owner}/TEST-Repository`
        } else {
          const reposRes = await fetch('https://api.github.com/user/repos?sort=updated&per_page=1', {
            headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github.v3+json' }
          })
          if (reposRes.ok) {
            const repos = await reposRes.json()
            if (repos.length > 0) testConfig.repository = repos[0].full_name
          }
        }
        if (testConfig.repository) dynamicCache.set(cacheKey, testConfig.repository)
      }
    } catch (err: any) {
      logger.error('[testChains] Failed to resolve GitHub repository:', err.message)
    }
  }

  // ── Google Analytics ──
  if (providerId === 'google-analytics') {
    const gaCacheKey = `ga_resolved_${userId}`
    if (dynamicCache.has(gaCacheKey)) {
      const cached = JSON.parse(dynamicCache.get(gaCacheKey)!)
      if (!testConfig.accountId) testConfig.accountId = cached.accountId
      if (!testConfig.propertyId) testConfig.propertyId = cached.propertyId
      if (!testConfig.measurementId) testConfig.measurementId = cached.measurementId
      if (!testConfig.dataStreamId) testConfig.dataStreamId = cached.dataStreamId
      return testConfig
    }
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'google-analytics')
      const summariesRes = await fetch(
        'https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (summariesRes.ok) {
        const summariesData = await summariesRes.json()
        const summaries = summariesData.accountSummaries || []
        if (summaries.length > 0) {
          const firstAccount = summaries[0]
          const accountId = firstAccount.account?.replace('accounts/', '') || ''
          if (!testConfig.accountId) testConfig.accountId = accountId
          const properties = firstAccount.propertySummaries || []
          if (properties.length > 0) {
            const propertyResource = properties[0].property || ''
            const propertyId = propertyResource.replace('properties/', '')
            if (!testConfig.propertyId) testConfig.propertyId = propertyId
            const streamsRes = await fetch(
              `https://analyticsadmin.googleapis.com/v1beta/properties/${propertyId}/dataStreams?pageSize=200`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            )
            if (streamsRes.ok) {
              const streamsData = await streamsRes.json()
              const webStreams = (streamsData.dataStreams || []).filter(
                (s: any) => s.type === 'WEB_DATA_STREAM' && s.webStreamData?.measurementId
              )
              if (webStreams.length > 0) {
                const stream = webStreams[0]
                if (!testConfig.measurementId) testConfig.measurementId = stream.webStreamData.measurementId
                const streamIdMatch = stream.name?.match(/dataStreams\/(.+)/)
                if (streamIdMatch && !testConfig.dataStreamId) testConfig.dataStreamId = streamIdMatch[1]
              }
            }
          }
          dynamicCache.set(gaCacheKey, JSON.stringify({
            accountId: testConfig.accountId, propertyId: testConfig.propertyId,
            measurementId: testConfig.measurementId, dataStreamId: testConfig.dataStreamId,
          }))
        }
      }
    } catch (err: any) {
      logger.error('[testChains] Failed to resolve Google Analytics config:', err.message)
    }
  }

  // ── Facebook ──
  if (providerId === 'facebook' && (!testConfig.pageId || testConfig.pageId === '')) {
    const cacheKey = `facebook_pageId_${userId}`
    if (dynamicCache.has(cacheKey)) {
      testConfig.pageId = dynamicCache.get(cacheKey)!
      return testConfig
    }
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'facebook')
      const response = await fetch('https://graph.facebook.com/v19.0/me/accounts', {
        headers: { Authorization: `Bearer ${accessToken}` }
      })
      if (response.ok) {
        const data = await response.json()
        if (data.data?.length > 0) {
          testConfig.pageId = data.data[0].id
          dynamicCache.set(cacheKey, testConfig.pageId)
        }
      }
    } catch (err: any) {
      logger.error('[testChains] Failed to resolve Facebook pageId:', err.message)
    }
  }

  // ── Slack: Resolve channel ID ──
  if (providerId === 'slack' && (!testConfig.channel || testConfig.channel?.startsWith('#'))) {
    const cacheKey = `slack_channel_${userId}`
    if (dynamicCache.has(cacheKey)) {
      const channelId = dynamicCache.get(cacheKey)!
      testConfig.channel = channelId
      if (!testConfig.channels || testConfig.channels?.startsWith('#')) testConfig.channels = channelId
    } else {
      try {
        const accessToken = await getDecryptedAccessToken(userId, 'slack')
        const res = await fetch('https://slack.com/api/conversations.list?types=public_channel&exclude_archived=true&limit=10', {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
        if (res.ok) {
          const data = await res.json()
          if (data.ok && data.channels?.length > 0) {
            // Prefer a channel named "test" or "test-automation", otherwise use first
            const testChannel = data.channels.find((c: any) => c.name === 'test-automation' || c.name === 'test' || c.name === 'general')
            const channel = testChannel || data.channels[0]
            testConfig.channel = channel.id
            if (!testConfig.channels || testConfig.channels?.startsWith('#')) testConfig.channels = channel.id
            dynamicCache.set(cacheKey, channel.id)
          }
        }
      } catch (err: any) {
        logger.error('[testChains] Failed to resolve Slack channel:', err.message)
      }
    }
  }

  // ── Discord: Resolve guildId + channelId ──
  if (providerId === 'discord') {
    if (!testConfig.guildId || testConfig.guildId === 'test-guild-id') {
      const cacheKey = `discord_guild_${userId}`
      if (dynamicCache.has(cacheKey)) {
        const cached = JSON.parse(dynamicCache.get(cacheKey)!)
        testConfig.guildId = cached.guildId
        if (!testConfig.channelId || testConfig.channelId === 'test-channel-id') testConfig.channelId = cached.channelId
      } else {
        try {
          const botToken = process.env.DISCORD_BOT_TOKEN
          if (botToken) {
            const guildsRes = await fetch('https://discord.com/api/v10/users/@me/guilds', {
              headers: { Authorization: `Bot ${botToken}` }
            })
            if (guildsRes.ok) {
              const guilds = await guildsRes.json()
              if (guilds.length > 0) {
                testConfig.guildId = guilds[0].id
                // Get channels for the guild
                const channelsRes = await fetch(`https://discord.com/api/v10/guilds/${guilds[0].id}/channels`, {
                  headers: { Authorization: `Bot ${botToken}` }
                })
                if (channelsRes.ok) {
                  const channels = await channelsRes.json()
                  const textChannel = channels.find((c: any) => c.type === 0) // 0 = GUILD_TEXT
                  if (textChannel) testConfig.channelId = textChannel.id
                }
                dynamicCache.set(cacheKey, JSON.stringify({ guildId: testConfig.guildId, channelId: testConfig.channelId }))
              }
            }
          }
        } catch (err: any) {
          logger.error('[testChains] Failed to resolve Discord guild:', err.message)
        }
      }
    }
  }

  // ── Mailchimp: Resolve audience_id ──
  if (providerId === 'mailchimp' && (!testConfig.audience_id || testConfig.audience_id === '')) {
    const cacheKey = `mailchimp_audience_${userId}`
    if (dynamicCache.has(cacheKey)) {
      testConfig.audience_id = dynamicCache.get(cacheKey)!
    } else {
      try {
        const accessToken = await getDecryptedAccessToken(userId, 'mailchimp')
        // Get dc from metadata endpoint
        const metaRes = await fetch('https://login.mailchimp.com/oauth2/metadata', {
          headers: { Authorization: `OAuth ${accessToken}` }
        })
        if (metaRes.ok) {
          const metaData = await metaRes.json()
          const dc = metaData.dc || 'us1'
          const listsRes = await fetch(`https://${dc}.api.mailchimp.com/3.0/lists?count=1`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          })
          if (listsRes.ok) {
            const listsData = await listsRes.json()
            if (listsData.lists?.length > 0) {
              testConfig.audience_id = listsData.lists[0].id
              dynamicCache.set(cacheKey, testConfig.audience_id)
            }
          }
        }
      } catch (err: any) {
        logger.error('[testChains] Failed to resolve Mailchimp audience:', err.message)
      }
    }
  }

  // ── Notion: Resolve database_id and page_id ──
  if (providerId === 'notion') {
    const cacheKey = `notion_resolved_${userId}`
    if (dynamicCache.has(cacheKey)) {
      const cached = JSON.parse(dynamicCache.get(cacheKey)!)
      if (!testConfig.parentDatabase && cached.databaseId) testConfig.parentDatabase = cached.databaseId
      if (!testConfig.database_id && cached.databaseId) testConfig.database_id = cached.databaseId
      if (!testConfig.parentPage && cached.pageId) testConfig.parentPage = cached.pageId
      return testConfig
    }
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'notion')
      // Search for databases
      const dbRes = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28',
        },
        body: JSON.stringify({ filter: { value: 'database', property: 'object' }, page_size: 1 }),
      })
      let databaseId = ''
      let pageId = ''
      if (dbRes.ok) {
        const dbData = await dbRes.json()
        if (dbData.results?.length > 0) {
          databaseId = dbData.results[0].id
          if (!testConfig.parentDatabase) testConfig.parentDatabase = databaseId
          if (!testConfig.database_id) testConfig.database_id = databaseId
        }
      }
      // Search for pages
      const pgRes = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28',
        },
        body: JSON.stringify({ filter: { value: 'page', property: 'object' }, page_size: 1 }),
      })
      if (pgRes.ok) {
        const pgData = await pgRes.json()
        if (pgData.results?.length > 0) {
          pageId = pgData.results[0].id
          if (!testConfig.parentPage) testConfig.parentPage = pageId
        }
      }
      dynamicCache.set(cacheKey, JSON.stringify({ databaseId, pageId }))
    } catch (err: any) {
      logger.error('[testChains] Failed to resolve Notion config:', err.message)
    }
  }

  // ── Microsoft Outlook: Resolve emailId from recent emails ──
  if (providerId === 'microsoft-outlook') {
    // Resolve emailId for actions that need it
    if (!testConfig.emailId || testConfig.emailId === 'test-email-id') {
      const cacheKey = `outlook_emailId_${userId}`
      if (dynamicCache.has(cacheKey)) {
        testConfig.emailId = dynamicCache.get(cacheKey)!
      } else {
        try {
          const accessToken = await getDecryptedAccessToken(userId, 'microsoft-outlook')
          const res = await fetch('https://graph.microsoft.com/v1.0/me/messages?$top=1&$select=id,subject&$orderby=receivedDateTime desc', {
            headers: { Authorization: `Bearer ${accessToken}` }
          })
          if (res.ok) {
            const data = await res.json()
            if (data.value?.length > 0) {
              testConfig.emailId = data.value[0].id
              dynamicCache.set(cacheKey, testConfig.emailId)
            }
          }
        } catch (err: any) {
          logger.error('[testChains] Failed to resolve Outlook emailId:', err.message)
        }
      }
    }
    // Resolve destinationFolderId for move_email
    if (!testConfig.destinationFolderId) {
      const cacheKey = `outlook_folderId_${userId}`
      if (dynamicCache.has(cacheKey)) {
        testConfig.destinationFolderId = dynamicCache.get(cacheKey)!
      } else {
        try {
          const accessToken = await getDecryptedAccessToken(userId, 'microsoft-outlook')
          const res = await fetch('https://graph.microsoft.com/v1.0/me/mailFolders?$top=5', {
            headers: { Authorization: `Bearer ${accessToken}` }
          })
          if (res.ok) {
            const data = await res.json()
            // Find "Archive" or "Drafts" folder as destination
            const archiveFolder = data.value?.find((f: any) => f.displayName === 'Archive' || f.displayName === 'Drafts')
            if (archiveFolder) {
              testConfig.destinationFolderId = archiveFolder.id
              dynamicCache.set(cacheKey, archiveFolder.id)
            }
          }
        } catch (err: any) {
          logger.error('[testChains] Failed to resolve Outlook folder:', err.message)
        }
      }
    }
  }

  // ── Microsoft OneNote: Resolve notebookId + sectionId ──
  if (providerId === 'microsoft-onenote') {
    const cacheKey = `onenote_resolved_${userId}`
    if (dynamicCache.has(cacheKey)) {
      const cached = JSON.parse(dynamicCache.get(cacheKey)!)
      if (!testConfig.notebookId && cached.notebookId) testConfig.notebookId = cached.notebookId
      if (!testConfig.sectionId && cached.sectionId) testConfig.sectionId = cached.sectionId
      return testConfig
    }
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'microsoft-onenote')
      // Get notebooks
      const nbRes = await fetch('https://graph.microsoft.com/v1.0/me/onenote/notebooks?$top=1&$orderby=lastModifiedDateTime desc', {
        headers: { Authorization: `Bearer ${accessToken}` }
      })
      let notebookId = ''
      let sectionId = ''
      if (nbRes.ok) {
        const nbData = await nbRes.json()
        if (nbData.value?.length > 0) {
          notebookId = nbData.value[0].id
          if (!testConfig.notebookId) testConfig.notebookId = notebookId
          // Get sections for this notebook
          const secRes = await fetch(`https://graph.microsoft.com/v1.0/me/onenote/notebooks/${notebookId}/sections?$top=1`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          })
          if (secRes.ok) {
            const secData = await secRes.json()
            if (secData.value?.length > 0) {
              sectionId = secData.value[0].id
              if (!testConfig.sectionId) testConfig.sectionId = sectionId
            }
          }
        }
      }
      dynamicCache.set(cacheKey, JSON.stringify({ notebookId, sectionId }))
    } catch (err: any) {
      logger.error('[testChains] Failed to resolve OneNote config:', err.message)
    }
  }

  // ── Shopify: Build line_items from variant_gid ──
  if (providerId === 'shopify' && testConfig.variant_gid && (!testConfig.line_items || (Array.isArray(testConfig.line_items) && testConfig.line_items.length === 0))) {
    testConfig.line_items = [{ variant_id: testConfig.variant_gid, quantity: 1, price: '10.00' }]
  }

  // ── Shopify: Resolve location_id for inventory actions ──
  if (providerId === 'shopify' && !testConfig.location_id) {
    const shopifyCacheKey = `shopify_location_${userId}`
    if (dynamicCache.has(shopifyCacheKey)) {
      testConfig.location_id = dynamicCache.get(shopifyCacheKey)!
    } else {
      try {
        const accessToken = await getDecryptedAccessToken(userId, 'shopify')
        if (accessToken) {
          const locRes = await fetch('https://shopify-proxy.chainreact.app/api/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ query: '{ locations(first: 1) { edges { node { id legacyResourceId } } } }' }),
          })
          if (locRes.ok) {
            const locData = await locRes.json()
            const locationId = locData?.data?.locations?.edges?.[0]?.node?.legacyResourceId
            if (locationId) {
              testConfig.location_id = locationId
              dynamicCache.set(shopifyCacheKey, locationId)
            }
          }
        }
      } catch (err: any) {
        logger.error('[testChains] Failed to resolve Shopify location:', err.message)
      }
    }
  }

  return testConfig
}

// ── Prereq execution ─────────────────────────────────────────────────────

/**
 * Recursively resolves prerequisites for a test action.
 * Caches prereq outputs so shared chains only run once per test batch.
 */
export async function resolvePrereqs(
  nodeType: string,
  testConfig: Record<string, any>,
  context: {
    userId: string
    providerId: string
    integrationId?: string
    prereqCache: Map<string, Record<string, any>>
    executeActionFn: (params: any) => Promise<any>
    buildTestConfigFn: (params: { type: string; providerId: string; configSchema?: any }) => Record<string, any>
    allNodeComponents: any[]
  }
): Promise<boolean> {
  const prereq = PREREQUISITE_MAP[nodeType]
  if (!prereq) return false

  const cacheKey = prereq.cacheKey || prereq.prereqNodeType
  const { userId, providerId, integrationId, prereqCache, executeActionFn, buildTestConfigFn, allNodeComponents } = context

  // If prereq already ran, reuse cached output
  if (prereqCache.has(cacheKey)) {
    const cached = prereqCache.get(cacheKey)!
    applyOutputMapping(cached, prereq.outputMapping, testConfig)
    applyAdditionalCache(prereq, prereqCache, testConfig)
    if (prereq.testConfigOverrides) Object.assign(testConfig, prereq.testConfigOverrides)
    return true
  }

  // Build prereq config
  const prereqNodeComponent = allNodeComponents.find((c: any) => c.type === prereq.prereqNodeType)
  const prereqProviderId = prereqNodeComponent?.providerId || providerId
  let prereqConfig: Record<string, any> = {}
  if (prereqNodeComponent) {
    prereqConfig = buildTestConfigFn({
      type: prereq.prereqNodeType,
      providerId: prereqProviderId,
      configSchema: prereqNodeComponent.configSchema,
    })
  }
  Object.assign(prereqConfig, prereq.prereqConfig)

  // Recursively resolve prereq's own prereqs (modifies prereqConfig in-place)
  if (PREREQUISITE_MAP[prereq.prereqNodeType]) {
    await resolvePrereqs(prereq.prereqNodeType, prereqConfig, {
      ...context,
      providerId: prereqProviderId,
    })
  }

  // Resolve dynamic config for the prereq
  await resolveDynamicConfig(prereqProviderId, userId, prereqConfig)

  // Dedup name fields to avoid "already exists" errors on re-runs
  dedupTestNames(prereqConfig)

  // Inject integration ID
  if (integrationId) {
    prereqConfig.workspace = prereqConfig.workspace || integrationId
    prereqConfig.integrationId = prereqConfig.integrationId || integrationId
    prereqConfig.account = prereqConfig.account || integrationId
    prereqConfig.connection = prereqConfig.connection || integrationId
  }

  // Execute the prereq
  try {
    const prereqNode = {
      id: `prereq-${prereq.prereqNodeType}`,
      data: { type: prereq.prereqNodeType, config: prereqConfig },
    }
    const result = await Promise.race([
      executeActionFn({
        node: prereqNode,
        input: {},
        userId,
        workflowId: 'test-prereq',
        executionMode: 'live',
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Prerequisite timed out after 30s')), 30000)
      ),
    ])

    if (result.success !== false && result.output) {
      prereqCache.set(cacheKey, result.output)
      applyOutputMapping(result.output, prereq.outputMapping, testConfig)
      logger.debug(`[testChains] Prereq ${prereq.prereqNodeType} succeeded, cached as "${cacheKey}"`)
    } else {
      logger.error(`[testChains] Prereq ${prereq.prereqNodeType} failed:`, result.message || result.error)
    }
  } catch (err: any) {
    logger.error(`[testChains] Prereq ${prereq.prereqNodeType} error:`, err.message)
  }

  // Apply additional cache mappings (from upstream prereqs)
  applyAdditionalCache(prereq, prereqCache, testConfig)

  // Apply static overrides
  if (prereq.testConfigOverrides) Object.assign(testConfig, prereq.testConfigOverrides)

  // Dedup test config name fields after overrides applied
  dedupTestNames(testConfig)

  // Post-prereq: build Shopify line_items from variant_gid if available
  if (testConfig.variant_gid && (!testConfig.line_items || (Array.isArray(testConfig.line_items) && testConfig.line_items.length === 0))) {
    testConfig.line_items = [{ variant_id: testConfig.variant_gid, quantity: 1, price: '10.00' }]
  }

  return true
}

// ── Internal helpers ─────────────────────────────────────────────────────

function applyOutputMapping(
  output: Record<string, any>,
  mapping: Record<string, string>,
  target: Record<string, any>
) {
  for (const [outputPath, configField] of Object.entries(mapping)) {
    const value = extractNestedValue(output, outputPath)
    if (value !== undefined) target[configField] = value
  }
}

function applyAdditionalCache(
  prereq: PrereqDefinition,
  cache: Map<string, Record<string, any>>,
  target: Record<string, any>
) {
  if (!prereq.additionalCacheMapping) return
  for (const [ck, mapping] of Object.entries(prereq.additionalCacheMapping)) {
    const cachedOutput = cache.get(ck)
    if (cachedOutput) {
      for (const [outputPath, configField] of Object.entries(mapping)) {
        const value = extractNestedValue(cachedOutput, outputPath)
        if (value !== undefined) target[configField] = value
      }
    }
  }
}
