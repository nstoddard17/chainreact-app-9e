/**
 * Data Handler Registry Initialization
 *
 * Imports all per-provider handler indexes and registers them.
 * This file is imported as a side-effect by the dynamic data route.
 *
 * Created: 2026-03-28
 */

import { registerDataProvider, type ProviderDataConfig } from './data-handler-registry'

// ================================================================
// SHARED CONFIGS
// ================================================================

const STANDARD_CONFIG: ProviderDataConfig = {
  dbProviderName: '',
  tokenDecryption: 'none',
  decryptRefreshToken: false,
  validStatuses: ['connected', 'active'],
  tokenRefresh: 'none',
}

const STRICT_CONNECTED_CONFIG: ProviderDataConfig = {
  ...STANDARD_CONFIG,
  validStatuses: ['connected'],
}

// ================================================================
// PROVIDER REGISTRATIONS
// ================================================================

// --- Slack ---
import { slackHandlers } from '@/app/api/integrations/slack/data/handlers'
registerDataProvider('slack', slackHandlers, {
  dbProviderName: 'slack',
  tokenDecryption: 'decryptToken',
  decryptRefreshToken: true,
  validStatuses: ['connected', 'active', 'authorized'],
  tokenRefresh: 'none',
})

// --- Discord ---
import { discordHandlers } from '@/app/api/integrations/discord/data/handlers'
registerDataProvider('discord', discordHandlers, {
  dbProviderName: 'discord',
  tokenDecryption: 'none',
  decryptRefreshToken: false,
  validStatuses: ['connected', 'active'],
  tokenRefresh: 'none',
})

// --- Gmail ---
import { gmailHandlers } from '@/app/api/integrations/gmail/data/handlers'
registerDataProvider('gmail', gmailHandlers, {
  dbProviderName: 'gmail',
  tokenDecryption: 'none',
  decryptRefreshToken: false,
  validStatuses: ['connected', 'active'],
  tokenRefresh: 'none',
})

// --- GitHub (unique handler signature) ---
import { githubHandlers } from '@/app/api/integrations/github/data/handlers'
registerDataProvider('github', githubHandlers, {
  dbProviderName: 'github',
  tokenDecryption: 'decrypt-with-key',
  decryptRefreshToken: false,
  validStatuses: ['connected', 'active'],
  tokenRefresh: 'none',
  transformHandlerCall: async (handler, integration, decryptedToken, options) => {
    // GitHub handlers take (accessToken, params) instead of (integration, options)
    return handler(decryptedToken!, options)
  },
})

// --- Google (multi-provider, token refresh) ---
import { googleHandlers } from '@/app/api/integrations/google/data/handlers'
registerDataProvider('google', googleHandlers, {
  dbProviderName: ['google', 'google-calendar', 'google-drive', 'google-sheets', 'google-docs', 'gmail', 'youtube'],
  tokenDecryption: 'none',
  decryptRefreshToken: false,
  validStatuses: ['connected', 'active'],
  tokenRefresh: 'refresh-and-retry',
})

// --- Google Analytics ---
import { googleAnalyticsHandlers } from '@/app/api/integrations/google-analytics/data/handlers'
registerDataProvider('google-analytics', googleAnalyticsHandlers, {
  dbProviderName: 'google-analytics',
  tokenDecryption: 'none',
  decryptRefreshToken: false,
  validStatuses: ['connected', 'active'],
  tokenRefresh: 'none',
})

// --- Google Sheets ---
import { googleSheetsHandlers } from '@/app/api/integrations/google-sheets/data/handlers'
registerDataProvider('google-sheets', googleSheetsHandlers, {
  dbProviderName: 'google-sheets',
  tokenDecryption: 'none',
  decryptRefreshToken: false,
  validStatuses: ['connected', 'active'],
  tokenRefresh: 'none',
})

// --- Stripe (decryptToken + token refresh) ---
import { stripeHandlers } from '@/app/api/integrations/stripe/data/handlers'
registerDataProvider('stripe', stripeHandlers, {
  dbProviderName: 'stripe',
  tokenDecryption: 'decryptToken',
  decryptRefreshToken: true,
  validStatuses: ['connected'],
  tokenRefresh: 'refresh-and-retry',
})

// --- HubSpot ---
import { hubspotHandlers } from '@/app/api/integrations/hubspot/data/handlers'
registerDataProvider('hubspot', hubspotHandlers, {
  dbProviderName: 'hubspot',
  tokenDecryption: 'none',
  decryptRefreshToken: false,
  validStatuses: ['connected'],
  tokenRefresh: 'none',
})

// --- Notion ---
import { notionHandlers } from '@/app/api/integrations/notion/data/handlers'
registerDataProvider('notion', notionHandlers, {
  dbProviderName: 'notion',
  tokenDecryption: 'none',
  decryptRefreshToken: false,
  validStatuses: ['connected', 'active'],
  tokenRefresh: 'none',
})

// --- Airtable ---
import { airtableHandlers } from '@/app/api/integrations/airtable/data/handlers'
registerDataProvider('airtable', airtableHandlers, {
  dbProviderName: 'airtable',
  tokenDecryption: 'decrypt-with-key',
  decryptRefreshToken: true,
  validStatuses: ['connected'],
  tokenRefresh: 'none',
})

// --- Trello ---
import { trelloHandlers } from '@/app/api/integrations/trello/data/handlers'
registerDataProvider('trello', trelloHandlers, {
  dbProviderName: 'trello',
  tokenDecryption: 'none',
  decryptRefreshToken: false,
  validStatuses: ['connected', 'active'],
  tokenRefresh: 'none',
})

// --- Dropbox ---
import { dropboxHandlers } from '@/app/api/integrations/dropbox/data/handlers'
registerDataProvider('dropbox', dropboxHandlers, {
  dbProviderName: 'dropbox',
  tokenDecryption: 'none',
  decryptRefreshToken: false,
  validStatuses: ['connected'],
  tokenRefresh: 'none',
})

// --- Facebook ---
import { facebookHandlers } from '@/app/api/integrations/facebook/data/handlers'
registerDataProvider('facebook', facebookHandlers, {
  dbProviderName: 'facebook',
  tokenDecryption: 'none',
  decryptRefreshToken: false,
  validStatuses: ['connected', 'active'],
  tokenRefresh: 'none',
})

// --- Box ---
import { boxHandlers } from '@/app/api/integrations/box/data/handlers'
registerDataProvider('box', boxHandlers, {
  dbProviderName: 'box',
  tokenDecryption: 'none',
  decryptRefreshToken: false,
  validStatuses: ['connected', 'active'],
  tokenRefresh: 'none',
})

// --- Mailchimp ---
import { mailchimpHandlers } from '@/app/api/integrations/mailchimp/data/handlers'
registerDataProvider('mailchimp', mailchimpHandlers, {
  dbProviderName: 'mailchimp',
  tokenDecryption: 'none',
  decryptRefreshToken: false,
  validStatuses: ['connected', 'active'],
  tokenRefresh: 'none',
})

// --- Monday.com ---
import { mondayHandlers } from '@/app/api/integrations/monday/data/handlers'
registerDataProvider('monday', mondayHandlers, {
  dbProviderName: 'monday',
  tokenDecryption: 'none',
  decryptRefreshToken: false,
  validStatuses: ['connected', 'active'],
  tokenRefresh: 'none',
})

// --- Gumroad ---
import { gumroadHandlers } from '@/app/api/integrations/gumroad/data/handlers'
registerDataProvider('gumroad', gumroadHandlers, {
  dbProviderName: 'gumroad',
  tokenDecryption: 'none',
  decryptRefreshToken: false,
  validStatuses: ['connected', 'active'],
  tokenRefresh: 'none',
})

// --- Blackbaud ---
import { blackbaudHandlers } from '@/app/api/integrations/blackbaud/data/handlers'
registerDataProvider('blackbaud', blackbaudHandlers, {
  dbProviderName: 'blackbaud',
  tokenDecryption: 'none',
  decryptRefreshToken: false,
  validStatuses: ['connected'],
  tokenRefresh: 'none',
})

// --- Shopify ---
import { shopifyHandlers } from '@/app/api/integrations/shopify/data/handlers'
registerDataProvider('shopify', shopifyHandlers, {
  dbProviderName: 'shopify',
  tokenDecryption: 'none',
  decryptRefreshToken: false,
  validStatuses: ['connected', 'active'],
  tokenRefresh: 'none',
})

// --- OneDrive ---
import { onedriveHandlers } from '@/app/api/integrations/onedrive/data/handlers'
registerDataProvider('onedrive', onedriveHandlers, {
  dbProviderName: 'onedrive',
  tokenDecryption: 'none',
  decryptRefreshToken: false,
  validStatuses: ['connected', 'active'],
  tokenRefresh: 'none',
})

// --- OneNote ---
import { oneNoteHandlers } from '@/app/api/integrations/onenote/data/handlers'
registerDataProvider('onenote', oneNoteHandlers, {
  dbProviderName: 'microsoft-onenote',
  tokenDecryption: 'none',
  decryptRefreshToken: false,
  validStatuses: ['connected', 'active'],
  tokenRefresh: 'none',
})

// --- Microsoft Excel ---
import { microsoftExcelHandlers } from '@/app/api/integrations/microsoft-excel/data/handlers'
registerDataProvider('microsoft-excel', microsoftExcelHandlers, {
  dbProviderName: 'microsoft-excel',
  tokenDecryption: 'none',
  decryptRefreshToken: false,
  validStatuses: ['connected', 'active'],
  tokenRefresh: 'none',
})
