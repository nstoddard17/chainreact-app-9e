/**
 * Gmail Data Handlers Registry
 */

import { GmailDataHandler } from '../types'
import { getGmailLabels } from './labels'
import { getGmailEnhancedRecipients } from './enhanced-recipients'
import { getGmailSignatures } from './signatures'
import { getGmailFromAddresses } from './from-addresses'
import { getGmailRecentSenders } from './recent-senders'

/**
 * Registry of all Gmail data handlers
 */
export const gmailHandlers: Record<string, GmailDataHandler> = {
  // Labels
  'gmail_labels': getGmailLabels,

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