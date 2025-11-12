/**
 * Integration Provider Brand Names
 *
 * Centralized mapping of provider IDs to their proper branded names
 * for consistent display across the application.
 */

/**
 * Get proper branding name for integration providers
 *
 * @param providerId - The provider ID (e.g., 'github', 'google-drive')
 * @returns Properly formatted brand name (e.g., 'GitHub', 'Google Drive')
 *
 * @example
 * getProviderBrandName('github') // => 'GitHub'
 * getProviderBrandName('google-sheets') // => 'Google Sheets'
 * getProviderBrandName('teams') // => 'Microsoft Teams'
 */
export function getProviderBrandName(providerId: string): string {
  const brandNames: Record<string, string> = {
    // Google Suite
    'gmail': 'Gmail',
    'google-calendar': 'Google Calendar',
    'google-drive': 'Google Drive',
    'google-sheets': 'Google Sheets',
    'google-docs': 'Google Docs',
    'google-analytics': 'Google Analytics',

    // Microsoft Suite
    'microsoft-excel': 'Microsoft Excel',
    'outlook': 'Outlook',
    'onedrive': 'OneDrive',
    'onenote': 'OneNote',
    'teams': 'Microsoft Teams',

    // Communication
    'slack': 'Slack',
    'discord': 'Discord',
    'zoom': 'Zoom',

    // Social Media
    'twitter': 'Twitter',
    'facebook': 'Facebook',
    'instagram': 'Instagram',
    'linkedin': 'LinkedIn',
    'youtube': 'YouTube',

    // Productivity & Project Management
    'notion': 'Notion',
    'airtable': 'Airtable',
    'trello': 'Trello',
    'asana': 'Asana',
    'monday': 'Monday.com',
    'clickup': 'ClickUp',

    // Development
    'github': 'GitHub',
    'gitlab': 'GitLab',
    'bitbucket': 'Bitbucket',

    // CRM & Sales
    'hubspot': 'HubSpot',
    'salesforce': 'Salesforce',
    'pipedrive': 'Pipedrive',

    // Payment & E-commerce
    'stripe': 'Stripe',
    'shopify': 'Shopify',
    'paypal': 'PayPal',
    'square': 'Square',

    // Marketing
    'mailchimp': 'Mailchimp',
    'sendgrid': 'SendGrid',
    'intercom': 'Intercom',

    // Storage
    'dropbox': 'Dropbox',
    'box': 'Box',

    // Other
    'zapier': 'Zapier',
    'make': 'Make',
    'integromat': 'Integromat',
    'ai': 'AI Agent',
    'ask-human': 'Ask Human via Chat',
  }

  // Return mapped name or capitalize first letter as fallback
  return brandNames[providerId] || providerId.charAt(0).toUpperCase() + providerId.slice(1)
}
