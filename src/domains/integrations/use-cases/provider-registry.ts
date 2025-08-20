import { ConnectorContract, CapabilityDescriptor } from '../ports/connector-contract'
import { 
  EmailProvider, 
  ChatProvider, 
  CalendarProvider, 
  FileProvider, 
  CRMProvider, 
  ProjectProvider,
  DatabaseProvider,
  SocialProvider,
  DevOpsProvider,
  DocumentProvider,
  PaymentProvider,
  EcommerceProvider
} from '../ports/capability-interfaces'

export type ProviderType = 'email' | 'chat' | 'calendar' | 'file' | 'crm' | 'project' | 'database' | 'social' | 'devops' | 'document' | 'payment' | 'ecommerce'

export interface RegisteredProvider {
  contract: ConnectorContract
  capabilities: CapabilityDescriptor
  types: ProviderType[]
  metadata: {
    name: string
    version: string
    registeredAt: Date
  }
}

/**
 * Registry for managing integration providers and their capabilities
 */
export class ProviderRegistry {
  private providers = new Map<string, RegisteredProvider>()
  private typeIndex = new Map<ProviderType, Set<string>>()

  /**
   * Register a provider with its capabilities
   */
  register(provider: ConnectorContract, types: ProviderType[], metadata: { name: string; version: string }): void {
    const registration: RegisteredProvider = {
      contract: provider,
      capabilities: provider.capabilities,
      types,
      metadata: {
        ...metadata,
        registeredAt: new Date()
      }
    }

    this.providers.set(provider.providerId, registration)

    // Update type index
    types.forEach(type => {
      if (!this.typeIndex.has(type)) {
        this.typeIndex.set(type, new Set())
      }
      this.typeIndex.get(type)!.add(provider.providerId)
    })
  }

  /**
   * Get a provider by ID
   */
  getProvider(providerId: string): ConnectorContract | undefined {
    return this.providers.get(providerId)?.contract
  }

  /**
   * Get provider with specific capability type
   */
  getProviderAs<T extends ConnectorContract>(providerId: string): T | undefined {
    const provider = this.getProvider(providerId)
    return provider as T
  }

  /**
   * Get email provider
   */
  getEmailProvider(providerId: string): EmailProvider | undefined {
    const provider = this.getProvider(providerId)
    if (provider && this.hasType(providerId, 'email')) {
      return provider as EmailProvider
    }
    return undefined
  }

  /**
   * Get chat provider
   */
  getChatProvider(providerId: string): ChatProvider | undefined {
    const provider = this.getProvider(providerId)
    if (provider && this.hasType(providerId, 'chat')) {
      return provider as ChatProvider
    }
    return undefined
  }

  /**
   * Get calendar provider
   */
  getCalendarProvider(providerId: string): CalendarProvider | undefined {
    const provider = this.getProvider(providerId)
    if (provider && this.hasType(providerId, 'calendar')) {
      return provider as CalendarProvider
    }
    return undefined
  }

  /**
   * Get file provider
   */
  getFileProvider(providerId: string): FileProvider | undefined {
    const provider = this.getProvider(providerId)
    if (provider && this.hasType(providerId, 'file')) {
      return provider as FileProvider
    }
    return undefined
  }

  /**
   * Get CRM provider
   */
  getCRMProvider(providerId: string): CRMProvider | undefined {
    const provider = this.getProvider(providerId)
    if (provider && this.hasType(providerId, 'crm')) {
      return provider as CRMProvider
    }
    return undefined
  }

  /**
   * Get project provider
   */
  getProjectProvider(providerId: string): ProjectProvider | undefined {
    const provider = this.getProvider(providerId)
    if (provider && this.hasType(providerId, 'project')) {
      return provider as ProjectProvider
    }
    return undefined
  }

  /**
   * Get database provider
   */
  getDatabaseProvider(providerId: string): DatabaseProvider | undefined {
    const provider = this.getProvider(providerId)
    if (provider && this.hasType(providerId, 'database')) {
      return provider as DatabaseProvider
    }
    return undefined
  }

  /**
   * Get social provider
   */
  getSocialProvider(providerId: string): SocialProvider | undefined {
    const provider = this.getProvider(providerId)
    if (provider && this.hasType(providerId, 'social')) {
      return provider as SocialProvider
    }
    return undefined
  }

  /**
   * Get DevOps provider
   */
  getDevOpsProvider(providerId: string): DevOpsProvider | undefined {
    const provider = this.getProvider(providerId)
    if (provider && this.hasType(providerId, 'devops')) {
      return provider as DevOpsProvider
    }
    return undefined
  }

  /**
   * Get document provider
   */
  getDocumentProvider(providerId: string): DocumentProvider | undefined {
    const provider = this.getProvider(providerId)
    if (provider && this.hasType(providerId, 'document')) {
      return provider as DocumentProvider
    }
    return undefined
  }

  /**
   * Get payment provider
   */
  getPaymentProvider(providerId: string): PaymentProvider | undefined {
    const provider = this.getProvider(providerId)
    if (provider && this.hasType(providerId, 'payment')) {
      return provider as PaymentProvider
    }
    return undefined
  }

  /**
   * Get ecommerce provider
   */
  getEcommerceProvider(providerId: string): EcommerceProvider | undefined {
    const provider = this.getProvider(providerId)
    if (provider && this.hasType(providerId, 'ecommerce')) {
      return provider as EcommerceProvider
    }
    return undefined
  }

  /**
   * Get all providers of a specific type
   */
  getProvidersByType(type: ProviderType): ConnectorContract[] {
    const providerIds = this.typeIndex.get(type) || new Set()
    return Array.from(providerIds)
      .map(id => this.getProvider(id))
      .filter(Boolean) as ConnectorContract[]
  }

  /**
   * Get provider capabilities
   */
  getCapabilities(providerId: string): CapabilityDescriptor | undefined {
    return this.providers.get(providerId)?.capabilities
  }

  /**
   * Check if provider supports a specific capability type
   */
  hasType(providerId: string, type: ProviderType): boolean {
    const provider = this.providers.get(providerId)
    return provider?.types.includes(type) || false
  }

  /**
   * List all registered providers
   */
  listProviders(): Array<{ providerId: string; name: string; types: ProviderType[]; capabilities: CapabilityDescriptor }> {
    return Array.from(this.providers.entries()).map(([providerId, registration]) => ({
      providerId,
      name: registration.metadata.name,
      types: registration.types,
      capabilities: registration.capabilities
    }))
  }

  /**
   * Unregister a provider
   */
  unregister(providerId: string): boolean {
    const provider = this.providers.get(providerId)
    if (!provider) {
      return false
    }

    // Remove from type index
    provider.types.forEach(type => {
      const typeSet = this.typeIndex.get(type)
      if (typeSet) {
        typeSet.delete(providerId)
        if (typeSet.size === 0) {
          this.typeIndex.delete(type)
        }
      }
    })

    // Remove from main registry
    this.providers.delete(providerId)
    return true
  }

  /**
   * Check if a provider is registered
   */
  isRegistered(providerId: string): boolean {
    return this.providers.has(providerId)
  }

  /**
   * Get provider registration metadata
   */
  getRegistrationInfo(providerId: string): RegisteredProvider['metadata'] | undefined {
    return this.providers.get(providerId)?.metadata
  }
}

// Singleton instance
export const providerRegistry = new ProviderRegistry()