/**
 * Gmail Data Handlers Registry
 */

import { GmailDataHandler } from '../types'
import { getGmailLabels } from './labels'
import { getGmailEnhancedRecipients } from './enhanced-recipients'
import { getGmailSignatures } from './signatures'
import { getGmailFromAddresses } from './from-addresses'
import { getGmailRecentSenders } from './recent-senders'
import { getSearchEmailsPreview, getAdvancedSearchPreview, getMarkAsReadPreview, getMarkAsUnreadPreview } from './email-preview'
import { getRecentEmails } from './recent-emails'

/**
 * Registry of all Gmail data handlers
 */
export const gmailHandlers: Record<string, GmailDataHandler> = {
  // Labels - support both underscore and hyphen variants
  'gmail_labels': getGmailLabels,
  'gmail-labels': getGmailLabels,

  // Recipients and contacts - both use enhanced version now
  'gmail-recent-recipients': getGmailEnhancedRecipients,
  'gmail-enhanced-recipients': getGmailEnhancedRecipients,

  // Signatures
  'gmail_signatures': getGmailSignatures,

  // From addresses (send-as aliases + recent senders for Send Email action)
  'gmail_from_addresses': getGmailFromAddresses,

  // Recent senders (for New Email trigger filtering)
  'gmail_recent_senders': getGmailRecentSenders,

  // Contacts (for Google Drive "created by" filter - reuses recent senders handler)
  'gmail-contacts': getGmailRecentSenders,

  // Preview handlers
  'search-emails-preview': getSearchEmailsPreview,
  'advanced-search-preview': getAdvancedSearchPreview,
  'mark-as-read-preview': getMarkAsReadPreview,
  'mark-as-unread-preview': getMarkAsUnreadPreview,

  // Recent emails (for message ID dropdown in Get Attachment)
  'gmail-recent-emails': getRecentEmails,
}

/**
 * Get available Gmail data types
 */
export function getAvailableGmailDataTypes(): string[] {
  return Object.keys(gmailHandlers)
}

/**
 * Check if a data type is supported
 */
export function isGmailDataTypeSupported(dataType: string): boolean {
  return dataType in gmailHandlers
}

/**
 * Get handler for a specific data type
 */
export function getGmailHandler(dataType: string): GmailDataHandler | null {
  return gmailHandlers[dataType] || null
}