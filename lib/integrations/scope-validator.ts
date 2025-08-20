/**
 * ScopeValidator handles integration scope validation and management
 * Extracted from integrationStore.ts for better separation of concerns
 */

export interface ScopeValidationResult {
  isValid: boolean
  missingScopes: string[]
  requiredScopes: string[]
  hasAllRequired: boolean
  warningScopes?: string[]
}

export interface ProviderScopeConfig {
  required: string[]
  optional?: string[]
  deprecated?: string[]
  description?: Record<string, string>
}

/**
 * ScopeValidator provides centralized scope validation for all integrations
 */
export class ScopeValidator {
  
  // Comprehensive scope definitions for all supported providers
  private static readonly PROVIDER_SCOPES: Record<string, ProviderScopeConfig> = {
    'gmail': {
      required: [
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.labels'
      ],
      optional: [
        'https://www.googleapis.com/auth/gmail.compose',
        'https://www.googleapis.com/auth/gmail.send'
      ],
      description: {
        'https://www.googleapis.com/auth/gmail.modify': 'Read, compose, send, and permanently delete all your email from Gmail',
        'https://www.googleapis.com/auth/gmail.labels': 'Manage mailbox labels',
        'https://www.googleapis.com/auth/gmail.compose': 'Manage drafts and compose emails',
        'https://www.googleapis.com/auth/gmail.send': 'Send email on your behalf'
      }
    },
    
    'google-drive': {
      required: [
        'https://www.googleapis.com/auth/drive.file'
      ],
      optional: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.readonly'
      ],
      description: {
        'https://www.googleapis.com/auth/drive.file': 'View and manage Google Drive files that you have opened or created with this app',
        'https://www.googleapis.com/auth/drive': 'See, create, and delete all of your Google Drive files',
        'https://www.googleapis.com/auth/drive.readonly': 'View your Google Drive files'
      }
    },
    
    'google-calendar': {
      required: [
        'https://www.googleapis.com/auth/calendar'
      ],
      optional: [
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/calendar.events'
      ],
      description: {
        'https://www.googleapis.com/auth/calendar': 'See, create, change, and delete events on all your calendars',
        'https://www.googleapis.com/auth/calendar.readonly': 'View events on all your calendars',
        'https://www.googleapis.com/auth/calendar.events': 'View and edit events on all your calendars'
      }
    },
    
    'discord': {
      required: [
        'identify',
        'guilds'
      ],
      optional: [
        'guilds.join',
        'guilds.members.read',
        'bot'
      ],
      description: {
        'identify': 'Access to user account information',
        'guilds': 'Access to user\'s Discord servers',
        'guilds.join': 'Join servers on your behalf',
        'guilds.members.read': 'Read server member information',
        'bot': 'Add bot to servers'
      }
    },
    
    'slack': {
      required: [
        'channels:read',
        'chat:write'
      ],
      optional: [
        'files:read',
        'files:write',
        'users:read',
        'channels:history'
      ],
      description: {
        'channels:read': 'View basic information about public channels',
        'chat:write': 'Send messages as user',
        'files:read': 'View files shared in channels',
        'files:write': 'Upload and share files',
        'users:read': 'View people in workspace',
        'channels:history': 'View messages and content in channels'
      }
    },
    
    'notion': {
      required: [
        'read_content',
        'update_content'
      ],
      optional: [
        'insert_content',
        'read_user_with_email'
      ],
      description: {
        'read_content': 'Read content from Notion',
        'update_content': 'Update existing content in Notion',
        'insert_content': 'Create new content in Notion',
        'read_user_with_email': 'Read user information'
      }
    },
    
    'microsoft-teams': {
      required: [
        'https://graph.microsoft.com/Chat.Read',
        'https://graph.microsoft.com/Channel.ReadBasic.All'
      ],
      optional: [
        'https://graph.microsoft.com/ChatMessage.Send',
        'https://graph.microsoft.com/Files.Read.All'
      ],
      description: {
        'https://graph.microsoft.com/Chat.Read': 'Read user chat messages',
        'https://graph.microsoft.com/Channel.ReadBasic.All': 'Read the names and descriptions of channels',
        'https://graph.microsoft.com/ChatMessage.Send': 'Send chat messages',
        'https://graph.microsoft.com/Files.Read.All': 'Read all files'
      }
    },
    
    'hubspot': {
      required: [
        'crm.objects.contacts.read',
        'crm.objects.companies.read'
      ],
      optional: [
        'crm.objects.contacts.write',
        'crm.objects.companies.write',
        'crm.objects.deals.read',
        'crm.objects.deals.write'
      ],
      description: {
        'crm.objects.contacts.read': 'Read contact records',
        'crm.objects.companies.read': 'Read company records',
        'crm.objects.contacts.write': 'Create and update contact records',
        'crm.objects.companies.write': 'Create and update company records',
        'crm.objects.deals.read': 'Read deal records',
        'crm.objects.deals.write': 'Create and update deal records'
      }
    },
    
    'airtable': {
      required: [
        'data.records:read',
        'schema.bases:read'
      ],
      optional: [
        'data.records:write',
        'schema.bases:write'
      ],
      description: {
        'data.records:read': 'Read records from tables',
        'schema.bases:read': 'Read base schemas',
        'data.records:write': 'Create, update, and delete records',
        'schema.bases:write': 'Modify base schemas'
      }
    },
    
    'trello': {
      required: [
        'read',
        'write'
      ],
      description: {
        'read': 'Read your boards, lists, and cards',
        'write': 'Create and update boards, lists, and cards'
      }
    }
  }

  /**
   * Validate scopes for a specific provider
   */
  static validateScopes(providerId: string, grantedScopes: string[]): ScopeValidationResult {
    const config = this.PROVIDER_SCOPES[providerId.toLowerCase()]
    
    if (!config) {
      return {
        isValid: true, // Unknown provider - assume valid
        missingScopes: [],
        requiredScopes: [],
        hasAllRequired: true
      }
    }

    const requiredScopes = config.required
    const missingScopes = requiredScopes.filter(scope => !grantedScopes.includes(scope))
    const hasAllRequired = missingScopes.length === 0
    
    // Check for deprecated scopes
    const warningScopes = config.deprecated?.filter(scope => grantedScopes.includes(scope)) || []

    return {
      isValid: hasAllRequired,
      missingScopes,
      requiredScopes,
      hasAllRequired,
      warningScopes: warningScopes.length > 0 ? warningScopes : undefined
    }
  }

  /**
   * Get required scopes for a provider
   */
  static getRequiredScopes(providerId: string): string[] {
    const config = this.PROVIDER_SCOPES[providerId.toLowerCase()]
    return config?.required || []
  }

  /**
   * Get optional scopes for a provider
   */
  static getOptionalScopes(providerId: string): string[] {
    const config = this.PROVIDER_SCOPES[providerId.toLowerCase()]
    return config?.optional || []
  }

  /**
   * Get all available scopes for a provider
   */
  static getAllScopes(providerId: string): string[] {
    const config = this.PROVIDER_SCOPES[providerId.toLowerCase()]
    if (!config) return []
    
    return [
      ...config.required,
      ...(config.optional || [])
    ]
  }

  /**
   * Get scope descriptions for a provider
   */
  static getScopeDescriptions(providerId: string): Record<string, string> {
    const config = this.PROVIDER_SCOPES[providerId.toLowerCase()]
    return config?.description || {}
  }

  /**
   * Get missing scopes with descriptions
   */
  static getMissingScopesWithDescriptions(providerId: string, grantedScopes: string[]): Array<{
    scope: string
    description: string
    required: boolean
  }> {
    const validation = this.validateScopes(providerId, grantedScopes)
    const descriptions = this.getScopeDescriptions(providerId)
    const optionalScopes = this.getOptionalScopes(providerId)
    
    const missingRequired = validation.missingScopes.map(scope => ({
      scope,
      description: descriptions[scope] || 'No description available',
      required: true
    }))

    const missingOptional = optionalScopes
      .filter(scope => !grantedScopes.includes(scope))
      .map(scope => ({
        scope,
        description: descriptions[scope] || 'No description available',
        required: false
      }))

    return [...missingRequired, ...missingOptional]
  }

  /**
   * Check if a specific scope is required for a provider
   */
  static isScopeRequired(providerId: string, scope: string): boolean {
    const requiredScopes = this.getRequiredScopes(providerId)
    return requiredScopes.includes(scope)
  }

  /**
   * Format scopes for display
   */
  static formatScopesForDisplay(scopes: string[]): string[] {
    return scopes.map(scope => {
      // Remove common prefixes for cleaner display
      return scope
        .replace('https://www.googleapis.com/auth/', 'Google: ')
        .replace('https://graph.microsoft.com/', 'Microsoft: ')
        .replace('crm.objects.', 'HubSpot: ')
        .replace('data.records:', 'Airtable: ')
    })
  }

  /**
   * Get provider scope configuration
   */
  static getProviderConfig(providerId: string): ProviderScopeConfig | undefined {
    return this.PROVIDER_SCOPES[providerId.toLowerCase()]
  }

  /**
   * Add or update provider scope configuration
   */
  static setProviderConfig(providerId: string, config: ProviderScopeConfig): void {
    this.PROVIDER_SCOPES[providerId.toLowerCase()] = config
  }

  /**
   * Get all supported providers
   */
  static getSupportedProviders(): string[] {
    return Object.keys(this.PROVIDER_SCOPES)
  }

  /**
   * Validate and suggest scope upgrades
   */
  static suggestScopeUpgrades(providerId: string, grantedScopes: string[]): {
    canUpgrade: boolean
    suggestedScopes: string[]
    benefits: string[]
  } {
    const optionalScopes = this.getOptionalScopes(providerId)
    const descriptions = this.getScopeDescriptions(providerId)
    
    const availableUpgrades = optionalScopes.filter(scope => !grantedScopes.includes(scope))
    
    const benefits = availableUpgrades.map(scope => descriptions[scope] || scope)
    
    return {
      canUpgrade: availableUpgrades.length > 0,
      suggestedScopes: availableUpgrades,
      benefits
    }
  }

  /**
   * Check if scopes are sufficient for specific operations
   */
  static checkOperationPermissions(
    providerId: string, 
    grantedScopes: string[], 
    operation: 'read' | 'write' | 'delete' | 'admin'
  ): { allowed: boolean; requiredScopes: string[] } {
    const config = this.getProviderConfig(providerId)
    if (!config) {
      return { allowed: true, requiredScopes: [] }
    }

    // Define operation requirements per provider
    const operationScopeMap: Record<string, Record<string, string[]>> = {
      'gmail': {
        'read': ['https://www.googleapis.com/auth/gmail.readonly'],
        'write': ['https://www.googleapis.com/auth/gmail.modify'],
        'delete': ['https://www.googleapis.com/auth/gmail.modify'],
        'admin': ['https://www.googleapis.com/auth/gmail.modify']
      },
      'google-drive': {
        'read': ['https://www.googleapis.com/auth/drive.readonly'],
        'write': ['https://www.googleapis.com/auth/drive.file'],
        'delete': ['https://www.googleapis.com/auth/drive'],
        'admin': ['https://www.googleapis.com/auth/drive']
      },
      'discord': {
        'read': ['identify', 'guilds'],
        'write': ['bot'],
        'delete': ['bot'],
        'admin': ['bot', 'guilds.members.read']
      }
    }

    const requiredForOperation = operationScopeMap[providerId]?.[operation] || []
    const hasRequiredScopes = requiredForOperation.every(scope => grantedScopes.includes(scope))

    return {
      allowed: hasRequiredScopes,
      requiredScopes: requiredForOperation
    }
  }
}