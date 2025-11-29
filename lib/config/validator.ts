import { DiscordBotConfig } from '@/types/integration'

/**
 * Validates that all required environment variables are present
 * This prevents runtime errors due to missing configuration
 */
export class ConfigValidator {
  private static instance: ConfigValidator
  private validationResults: Map<string, boolean> = new Map()

  private constructor() {}

  static getInstance(): ConfigValidator {
    if (!ConfigValidator.instance) {
      ConfigValidator.instance = new ConfigValidator()
    }
    return ConfigValidator.instance
  }

  /**
   * Validates Discord bot configuration
   */
  validateDiscordBotConfig(): { isValid: boolean; missingVars: string[]; config?: DiscordBotConfig } {
    const clientId = process.env.DISCORD_CLIENT_ID
    const clientSecret = process.env.DISCORD_CLIENT_SECRET
    const botToken = process.env.DISCORD_BOT_TOKEN

    const missingVars = [
      ...(!clientId ? ['DISCORD_CLIENT_ID'] : []),
      ...(!clientSecret ? ['DISCORD_CLIENT_SECRET'] : []),
      ...(!botToken ? ['DISCORD_BOT_TOKEN'] : [])
    ]

    const isValid = missingVars.length === 0

    this.validationResults.set('discord_bot', isValid)

    return {
      isValid,
      missingVars,
      config: isValid ? {
        clientId: clientId!,
        clientSecret: clientSecret!,
        botToken: botToken!
      } : undefined
    }
  }

  /**
   * Validates OAuth configuration for a specific provider
   */
  validateOAuthConfig(provider: string): { isValid: boolean; missingVars: string[] } {
    const clientIdEnv = `${provider.toUpperCase()}_CLIENT_ID`
    const clientSecretEnv = `${provider.toUpperCase()}_CLIENT_SECRET`

    const clientId = process.env[clientIdEnv]
    const clientSecret = process.env[clientSecretEnv]

    const missingVars = [
      ...(!clientId ? [clientIdEnv] : []),
      ...(!clientSecret ? [clientSecretEnv] : [])
    ]

    const isValid = missingVars.length === 0
    this.validationResults.set(`oauth_${provider}`, isValid)

    return { isValid, missingVars }
  }

  /**
   * Validates encryption configuration
   */
  validateEncryptionConfig(): { isValid: boolean; missingVars: string[] } {
    const encryptionKey = process.env.ENCRYPTION_KEY
    const missingVars = !encryptionKey ? ['ENCRYPTION_KEY'] : []

    const isValid = missingVars.length === 0
    this.validationResults.set('encryption', isValid)

    return { isValid, missingVars }
  }

  /**
   * Validates database configuration
   */
  validateDatabaseConfig(): { isValid: boolean; missingVars: string[] } {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY

    const missingVars = [
      ...(!supabaseUrl ? ['NEXT_PUBLIC_SUPABASE_URL'] : []),
      ...(!supabaseAnonKey ? ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] : []),
      ...(!supabaseServiceKey ? ['SUPABASE_SECRET_KEY'] : [])
    ]

    const isValid = missingVars.length === 0
    this.validationResults.set('database', isValid)

    return { isValid, missingVars }
  }

  /**
   * Validates all configurations
   */
  validateAll(): { isValid: boolean; results: Record<string, { isValid: boolean; missingVars: string[] }> } {
    const results = {
      discord_bot: this.validateDiscordBotConfig(),
      encryption: this.validateEncryptionConfig(),
      database: this.validateDatabaseConfig(),
      oauth_discord: this.validateOAuthConfig('discord'),
      oauth_notion: this.validateOAuthConfig('notion'),
      oauth_teams: this.validateOAuthConfig('teams')
    }

    const isValid = Object.values(results).every(result => result.isValid)

    return { isValid, results }
  }

  /**
   * Gets validation result for a specific component
   */
  getValidationResult(component: string): boolean {
    return this.validationResults.get(component) || false
  }

  /**
   * Throws an error if configuration is invalid
   */
  requireValidConfig(component: string): void {
    if (!this.getValidationResult(component)) {
      throw new Error(`Configuration validation failed for ${component}. Please check environment variables.`)
    }
  }
}

// Export singleton instance
export const configValidator = ConfigValidator.getInstance() 