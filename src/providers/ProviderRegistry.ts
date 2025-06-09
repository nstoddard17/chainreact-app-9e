import type { OAuthProviderAdapter } from "./OAuthProviderAdapter"
import { GoogleOAuthAdapter } from "./GoogleOAuthAdapter"
import { MicrosoftOAuthAdapter } from "./MicrosoftOAuthAdapter"
import { NotionOAuthAdapter } from "./NotionOAuthAdapter"
import { SlackOAuthAdapter } from "./SlackOAuthAdapter"

export class ProviderRegistry {
  private providers: Map<string, OAuthProviderAdapter>

  constructor() {
    this.providers = new Map()
    this.registerDefaultProviders()
  }

  /**
   * Register a provider adapter
   */
  registerProvider(name: string, adapter: OAuthProviderAdapter): void {
    this.providers.set(name.toLowerCase(), adapter)
  }

  /**
   * Get a provider adapter by name
   */
  getProviderAdapter(name: string): OAuthProviderAdapter | undefined {
    return this.providers.get(name.toLowerCase())
  }

  /**
   * Register default provider adapters
   */
  private registerDefaultProviders(): void {
    this.registerProvider("google", new GoogleOAuthAdapter())
    this.registerProvider("microsoft", new MicrosoftOAuthAdapter())
    this.registerProvider("notion", new NotionOAuthAdapter())
    this.registerProvider("slack", new SlackOAuthAdapter())

    // Register aliases for specific Google services
    this.registerProvider("gmail", new GoogleOAuthAdapter())
    this.registerProvider("google-drive", new GoogleOAuthAdapter())
    this.registerProvider("google-calendar", new GoogleOAuthAdapter())

    // Register aliases for specific Microsoft services
    this.registerProvider("teams", new MicrosoftOAuthAdapter())
    this.registerProvider("onedrive", new MicrosoftOAuthAdapter())
  }

  /**
   * Get all registered provider names
   */
  getProviderNames(): string[] {
    return Array.from(this.providers.keys())
  }
}
