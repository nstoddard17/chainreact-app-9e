/**
 * Provider display name mapping
 * Maps provider IDs to their official capitalization
 */
export const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  // Communication
  discord: 'Discord',
  gmail: 'Gmail',
  slack: 'Slack',
  outlook: 'Outlook',
  teams: 'Microsoft Teams',
  telegram: 'Telegram',

  // Productivity
  notion: 'Notion',
  airtable: 'Airtable',
  asana: 'Asana',
  trello: 'Trello',
  clickup: 'ClickUp',
  monday: 'Monday.com',

  // Storage
  googledrive: 'Google Drive',
  dropbox: 'Dropbox',
  onedrive: 'OneDrive',

  // Business
  hubspot: 'HubSpot',
  salesforce: 'Salesforce',
  stripe: 'Stripe',
  shopify: 'Shopify',

  // Social
  twitter: 'Twitter',
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',

  // Developer
  github: 'GitHub',
  gitlab: 'GitLab',

  // Generic
  ai: 'AI',
  logic: 'Logic',
  mapper: 'Data',
  http: 'HTTP',
}

/**
 * Get the display name for a provider
 * Falls back to title case if not in mapping
 */
export function getProviderDisplayName(providerId: string): string {
  if (PROVIDER_DISPLAY_NAMES[providerId.toLowerCase()]) {
    return PROVIDER_DISPLAY_NAMES[providerId.toLowerCase()]
  }

  // Fallback to title case
  return providerId
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}
