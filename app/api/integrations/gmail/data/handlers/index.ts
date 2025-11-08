/**
 * Gmail Data Handlers Registry
 */

import { GmailDataHandler } from '../types'
import { getGmailLabels } from './labels'
import { getGmailEnhancedRecipients } from './enhanced-recipients'
import { getGmailSignatures } from './signatures'
import { getGmailFromAddresses } from './from-addresses'

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

  // From addresses (send-as aliases + recent senders)
  'gmail_from_addresses': getGmailFromAddresses,

  // Messages (placeholder - can be implemented later)
  // 'gmail_messages': getGmailMessages,
  // 'gmail_recent_senders': getGmailRecentSenders,
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