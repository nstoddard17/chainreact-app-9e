/**
 * Provider Swapping Utilities
 *
 * Swap providers in workflow plans without LLM calls.
 * Cost: $0.00 (just string replacement)
 */

import type { PlanNode } from '@/src/lib/workflows/builder/BuildState'

/**
 * Node type mapping for provider swapping
 * Maps pattern -> provider-specific node types
 */
const PROVIDER_NODE_MAPPINGS: Record<string, Record<string, string>> = {
  // Email Triggers
  'trigger_new_email': {
    'gmail': 'gmail_trigger_new_email',
    'outlook': 'outlook_trigger_new_email',
    'yahoo-mail': 'yahoo_mail_trigger_new_email',
  },
  'trigger_email_labeled': {
    'gmail': 'gmail_trigger_email_labeled',
    'outlook': 'outlook_trigger_email_labeled',
  },

  // Email Actions
  'action_send_email': {
    'gmail': 'gmail_action_send_email',
    'outlook': 'outlook_action_send_email',
    'yahoo-mail': 'yahoo_mail_action_send_email',
  },

  // Calendar Triggers (future)
  'trigger_new_event': {
    'google-calendar': 'google_calendar_trigger_new_event',
    'outlook-calendar': 'outlook_calendar_trigger_new_event',
  },

  // Messaging/Notification Actions
  'action_send_message': {
    'slack': 'slack_action_send_message',
    'discord': 'discord_action_send_message',
    'microsoft-teams': 'microsoft_teams_action_send_message',
  },
  'action_send_channel_message': {
    'slack': 'slack_action_send_channel_message',
    'discord': 'discord_action_send_channel_message',
    'microsoft-teams': 'microsoft_teams_action_send_channel_message',
  },

  // Messaging Triggers
  'trigger_new_message': {
    'slack': 'slack_trigger_new_message',
    'discord': 'discord_trigger_new_message',
    'microsoft-teams': 'microsoft_teams_trigger_new_message',
  },

  // Add more mappings as needed
}

/**
 * Detect the generic pattern from a provider-specific node type
 * e.g., "gmail_trigger_new_email" -> "trigger_new_email"
 */
function detectNodePattern(nodeType: string): string | null {
  // Try each pattern
  for (const [pattern, providers] of Object.entries(PROVIDER_NODE_MAPPINGS)) {
    // Check if this nodeType matches any provider's version
    if (Object.values(providers).includes(nodeType)) {
      return pattern
    }
  }
  return null
}

/**
 * Swap provider in a single plan node
 * Cost: $0.00 (no API call)
 */
export function swapProviderInNode(
  node: PlanNode,
  oldProviderId: string,
  newProviderId: string
): PlanNode {
  // If this node doesn't use the old provider, return unchanged
  if (node.providerId !== oldProviderId) {
    return node
  }

  // Detect the generic pattern
  const pattern = detectNodePattern(node.nodeType)
  if (!pattern) {
    // Unknown node type - just update providerId
    console.warn(`[ProviderSwap] Unknown pattern for ${node.nodeType}, updating providerId only`)
    return {
      ...node,
      providerId: newProviderId,
    }
  }

  // Get the new node type
  const newNodeType = PROVIDER_NODE_MAPPINGS[pattern][newProviderId]
  if (!newNodeType) {
    console.warn(`[ProviderSwap] No mapping for ${pattern} + ${newProviderId}`)
    return node
  }

  // Update both nodeType and providerId
  return {
    ...node,
    nodeType: newNodeType,
    providerId: newProviderId,
  }
}

/**
 * Swap provider in entire workflow plan
 * Cost: $0.00 (no API call, just array mapping)
 *
 * @param plan - Current workflow plan
 * @param oldProviderId - Provider being replaced (e.g., "gmail")
 * @param newProviderId - New provider (e.g., "outlook")
 * @returns Updated plan with swapped providers
 */
export function swapProviderInPlan(
  plan: PlanNode[],
  oldProviderId: string,
  newProviderId: string
): PlanNode[] {
  return plan.map(node => swapProviderInNode(node, oldProviderId, newProviderId))
}

/**
 * Get category from provider ID
 * Used to determine which nodes to swap
 */
export function getProviderCategory(providerId: string): string | null {
  const emailProviders = ['gmail', 'outlook', 'yahoo-mail']
  const calendarProviders = ['google-calendar', 'outlook-calendar']
  const messagingProviders = ['slack', 'discord', 'microsoft-teams']
  const storageProviders = ['google-drive', 'dropbox', 'onedrive']
  const spreadsheetProviders = ['google-sheets', 'airtable', 'microsoft-excel']
  const documentProviders = ['google-docs', 'notion', 'onenote', 'evernote']
  const crmProviders = ['hubspot', 'salesforce']

  if (emailProviders.includes(providerId)) return 'email'
  if (calendarProviders.includes(providerId)) return 'calendar'
  if (messagingProviders.includes(providerId)) return 'messaging'
  if (storageProviders.includes(providerId)) return 'storage'
  if (spreadsheetProviders.includes(providerId)) return 'spreadsheet'
  if (documentProviders.includes(providerId)) return 'document'
  if (crmProviders.includes(providerId)) return 'crm'

  return null
}

/**
 * Check if provider swap is valid
 * e.g., can't swap Gmail (email) for Google Calendar (calendar)
 */
export function canSwapProviders(oldProviderId: string, newProviderId: string): boolean {
  const oldCategory = getProviderCategory(oldProviderId)
  const newCategory = getProviderCategory(newProviderId)

  if (!oldCategory || !newCategory) return false

  return oldCategory === newCategory
}
