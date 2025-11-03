/**
 * Provider Disambiguation Utility
 * Detects vague provider terms and helps users select the right integration
 */

export interface ProviderCategory {
  vagueTerm: string // "email", "calendar", "storage"
  displayName: string // "Email", "Calendar", "File Storage"
  providers: string[] // ["gmail", "outlook", "yahoo-mail"]
}

export const PROVIDER_CATEGORIES: ProviderCategory[] = [
  {
    vagueTerm: 'email',
    displayName: 'Email',
    providers: ['gmail', 'outlook', 'yahoo-mail']
  },
  {
    vagueTerm: 'calendar',
    displayName: 'Calendar',
    providers: ['google-calendar', 'outlook']
  },
  {
    vagueTerm: 'storage',
    displayName: 'File Storage',
    providers: ['google-drive', 'dropbox', 'onedrive']
  },
  {
    vagueTerm: 'files',
    displayName: 'File Storage',
    providers: ['google-drive', 'dropbox', 'onedrive']
  },
  {
    vagueTerm: 'spreadsheet',
    displayName: 'Spreadsheet',
    providers: ['google-sheets', 'airtable', 'microsoft-excel']
  },
  {
    vagueTerm: 'chat',
    displayName: 'Chat/Messaging',
    providers: ['slack', 'discord', 'microsoft-teams']
  },
  {
    vagueTerm: 'crm',
    displayName: 'CRM',
    providers: ['hubspot', 'salesforce']
  },
  {
    vagueTerm: 'documents',
    displayName: 'Documents',
    providers: ['google-docs', 'notion', 'onenote']
  },
  {
    vagueTerm: 'notes',
    displayName: 'Notes',
    providers: ['notion', 'onenote', 'evernote']
  },
  {
    vagueTerm: 'task',
    displayName: 'Task Management',
    providers: ['trello', 'asana', 'notion']
  },
  {
    vagueTerm: 'social',
    displayName: 'Social Media',
    providers: ['twitter', 'facebook', 'linkedin', 'instagram']
  }
]

export interface VagueTermDetection {
  found: boolean
  category: ProviderCategory | null
  position: number // Index in prompt where term was found
}

/**
 * Detects if a prompt contains vague provider terms
 */
export function detectVagueTerms(prompt: string): VagueTermDetection {
  const normalized = prompt.toLowerCase()

  for (const category of PROVIDER_CATEGORIES) {
    // Look for patterns like:
    // - "when I get an email"
    // - "send to email"
    // - "from my calendar"
    // - "save to storage"
    const patterns = [
      new RegExp(`\\b(an?|the|my)\\s+${category.vagueTerm}\\b`, 'i'),
      new RegExp(`\\b${category.vagueTerm}\\s+(app|service|account)\\b`, 'i'),
      new RegExp(`\\bget\\s+(an?\\s+)?${category.vagueTerm}\\b`, 'i'),
      new RegExp(`\\bsend\\s+to\\s+${category.vagueTerm}\\b`, 'i'),
      new RegExp(`\\bfrom\\s+(my\\s+)?${category.vagueTerm}\\b`, 'i'),
      new RegExp(`\\bsave\\s+to\\s+${category.vagueTerm}\\b`, 'i'),
      new RegExp(`\\b${category.vagueTerm}\\s+(trigger|notification)\\b`, 'i'),
    ]

    for (const pattern of patterns) {
      const match = normalized.match(pattern)
      if (match) {
        return {
          found: true,
          category,
          position: match.index || 0
        }
      }
    }
  }

  return { found: false, category: null, position: -1 }
}

export interface ProviderOption {
  id: string // "gmail", "outlook"
  displayName: string // "Gmail", "Outlook"
  icon: string // Icon identifier
  isConnected: boolean
  integrationId?: string // Integration ID if connected
}

/**
 * Helper to check if a status represents a connected/usable integration
 * Matches the logic in integrationStore.ts getConnectedProviders()
 */
function isConnectedStatus(status?: string): boolean {
  if (!status) return false
  const v = status.toLowerCase()
  // Include 'expired' as connected because user just needs to reauthorize
  // The OAuth flow will handle token refresh automatically
  return v === 'connected' ||
         v === 'authorized' ||
         v === 'active' ||
         v === 'valid' ||
         v === 'ok' ||
         v === 'ready' ||
         v === 'expired'  // Include expired - can be refreshed
}

/**
 * Gets provider options for a category, marking which are connected
 */
export function getProviderOptions(
  category: ProviderCategory,
  connectedIntegrations: Array<{ provider: string; id: string; status: string }>
): ProviderOption[] {
  return category.providers.map(providerId => {
    const integration = connectedIntegrations.find(
      i => i.provider === providerId && isConnectedStatus(i.status)
    )

    return {
      id: providerId,
      displayName: getProviderDisplayName(providerId),
      icon: getProviderIcon(providerId),
      isConnected: !!integration,
      integrationId: integration?.id
    }
  })
}

/**
 * Gets display name for a provider ID
 */
export function getProviderDisplayName(providerId: string): string {
  const displayNames: Record<string, string> = {
    'gmail': 'Gmail',
    'outlook': 'Outlook',
    'yahoo-mail': 'Yahoo Mail',
    'google-calendar': 'Google Calendar',
    'google-drive': 'Google Drive',
    'dropbox': 'Dropbox',
    'onedrive': 'OneDrive',
    'google-sheets': 'Google Sheets',
    'airtable': 'Airtable',
    'microsoft-excel': 'Microsoft Excel',
    'slack': 'Slack',
    'discord': 'Discord',
    'microsoft-teams': 'Microsoft Teams',
    'hubspot': 'HubSpot',
    'salesforce': 'Salesforce',
    'google-docs': 'Google Docs',
    'notion': 'Notion',
    'onenote': 'OneNote',
    'evernote': 'Evernote',
    'trello': 'Trello',
    'asana': 'Asana',
    'twitter': 'Twitter',
    'facebook': 'Facebook',
    'linkedin': 'LinkedIn',
    'instagram': 'Instagram'
  }

  return displayNames[providerId] || providerId
}

/**
 * Gets icon for a provider ID
 */
export function getProviderIcon(providerId: string): string {
  const icons: Record<string, string> = {
    'gmail': '📧',
    'outlook': '📧',
    'yahoo-mail': '📧',
    'google-calendar': '📅',
    'google-drive': '📁',
    'dropbox': '📁',
    'onedrive': '📁',
    'google-sheets': '📊',
    'airtable': '📊',
    'microsoft-excel': '📊',
    'slack': '💬',
    'discord': '💬',
    'microsoft-teams': '💬',
    'hubspot': '🤝',
    'salesforce': '🤝',
    'google-docs': '📄',
    'notion': '📝',
    'onenote': '📝',
    'evernote': '📝',
    'trello': '✅',
    'asana': '✅',
    'twitter': '🐦',
    'facebook': '👥',
    'linkedin': '💼',
    'instagram': '📸'
  }

  return icons[providerId] || '🔌'
}

/**
 * Replaces vague term in prompt with specific provider
 * Example: "when I get an email" + "gmail" -> "when I get a Gmail email"
 */
export function replaceVagueTermWithProvider(
  prompt: string,
  vagueTerm: string,
  providerId: string
): string {
  const providerName = getProviderDisplayName(providerId)
  const normalized = prompt.toLowerCase()

  // Patterns to replace
  const replacements = [
    { pattern: new RegExp(`\\b(an?|the|my)\\s+${vagueTerm}\\b`, 'gi'), replacement: `a ${providerName}` },
    { pattern: new RegExp(`\\b${vagueTerm}\\s+(app|service|account)\\b`, 'gi'), replacement: `${providerName}` },
    { pattern: new RegExp(`\\bget\\s+(an?\\s+)?${vagueTerm}\\b`, 'gi'), replacement: `get a ${providerName}` },
    { pattern: new RegExp(`\\bsend\\s+to\\s+${vagueTerm}\\b`, 'gi'), replacement: `send to ${providerName}` },
    { pattern: new RegExp(`\\bfrom\\s+(my\\s+)?${vagueTerm}\\b`, 'gi'), replacement: `from ${providerName}` },
  ]

  let result = prompt
  for (const { pattern, replacement } of replacements) {
    if (pattern.test(result)) {
      result = result.replace(pattern, replacement)
      break // Only replace first match
    }
  }

  return result
}
