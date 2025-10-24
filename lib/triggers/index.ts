/**
 * Trigger Lifecycle Registry
 *
 * Registers all trigger providers with the lifecycle manager.
 * Import this file to initialize all trigger providers.
 */

import { triggerLifecycleManager } from './TriggerLifecycleManager'
import { MicrosoftGraphTriggerLifecycle } from './providers/MicrosoftGraphTriggerLifecycle'
import { AirtableTriggerLifecycle } from './providers/AirtableTriggerLifecycle'
import { DiscordTriggerLifecycle } from './providers/DiscordTriggerLifecycle'
import { SlackTriggerLifecycle } from './providers/SlackTriggerLifecycle'
import { GoogleApisTriggerLifecycle } from './providers/GoogleApisTriggerLifecycle'
import { StripeTriggerLifecycle } from './providers/StripeTriggerLifecycle'
import { ShopifyTriggerLifecycle } from './providers/ShopifyTriggerLifecycle'
import { NotionTriggerLifecycle } from './providers/NotionTriggerLifecycle'
import { HubSpotTriggerLifecycle } from './providers/HubSpotTriggerLifecycle'
import { ConditionalTriggerLifecycle } from './providers/ConditionalTriggerLifecycle'

import { logger } from '@/lib/utils/logger'

// Register Microsoft Graph provider (all Microsoft services use same lifecycle)
const microsoftLifecycle = new MicrosoftGraphTriggerLifecycle()
const microsoftProviders = [
  'microsoft',
  'microsoft-outlook',
  'teams', // NOTE: Teams uses 'teams' not 'microsoft-teams'
  'microsoft-onenote',
  'onedrive'
]

microsoftProviders.forEach(providerId => {
  triggerLifecycleManager.registerProvider({
    providerId,
    lifecycle: microsoftLifecycle, // All Microsoft providers share same lifecycle
    requiresExternalResources: true,
    description: `Microsoft Graph subscriptions for ${providerId}`
  })
})

// Register Airtable provider
triggerLifecycleManager.registerProvider({
  providerId: 'airtable',
  lifecycle: new AirtableTriggerLifecycle(),
  requiresExternalResources: true,
  description: 'Airtable webhooks for base and table triggers'
})

// Register Discord provider
triggerLifecycleManager.registerProvider({
  providerId: 'discord',
  lifecycle: new DiscordTriggerLifecycle(),
  requiresExternalResources: true,
  description: 'Discord slash commands and event triggers'
})

// Register Slack provider
triggerLifecycleManager.registerProvider({
  providerId: 'slack',
  lifecycle: new SlackTriggerLifecycle(),
  requiresExternalResources: true,
  description: 'Slack event subscriptions and message triggers'
})

// Register Google APIs provider (Gmail, Calendar, Drive, Sheets, Docs)
const googleLifecycle = new GoogleApisTriggerLifecycle()
const googleProviders = ['gmail', 'google-calendar', 'google-drive', 'google-sheets', 'google-docs']

googleProviders.forEach(providerId => {
  triggerLifecycleManager.registerProvider({
    providerId,
    lifecycle: googleLifecycle, // All Google providers share same lifecycle
    requiresExternalResources: true,
    description: `Google ${providerId} push notifications`
  })
})

// Register Stripe provider
triggerLifecycleManager.registerProvider({
  providerId: 'stripe',
  lifecycle: new StripeTriggerLifecycle(),
  requiresExternalResources: true,
  description: 'Stripe webhook endpoints for payment and subscription events'
})

// Register Shopify provider
triggerLifecycleManager.registerProvider({
  providerId: 'shopify',
  lifecycle: new ShopifyTriggerLifecycle(),
  requiresExternalResources: true,
  description: 'Shopify webhooks for orders, products, and inventory'
})

// Register Notion provider
triggerLifecycleManager.registerProvider({
  providerId: 'notion',
  lifecycle: new NotionTriggerLifecycle(),
  requiresExternalResources: true,
  description: 'Notion webhooks for page and database triggers (manual setup required)'
})

// Register HubSpot provider
triggerLifecycleManager.registerProvider({
  providerId: 'hubspot',
  lifecycle: new HubSpotTriggerLifecycle(),
  requiresExternalResources: true,
  description: 'HubSpot webhook subscriptions for CRM object events'
})

// Register Utility Conditional Trigger
triggerLifecycleManager.registerProvider({
  providerId: 'utility',
  lifecycle: new ConditionalTriggerLifecycle(),
  requiresExternalResources: false, // Uses polling/cron, not webhooks
  description: 'Conditional trigger for scheduled condition checking'
})

// TODO: Register remaining providers:
// - Dropbox
// - Trello
// - Mailchimp
// etc.

logger.debug('✅ Trigger lifecycle providers registered:', triggerLifecycleManager.getRegisteredProviders())

// Export the manager for use in workflow activation/deactivation
export { triggerLifecycleManager } from './TriggerLifecycleManager'
export * from './types'

// Force rebuild - token decryption fix
