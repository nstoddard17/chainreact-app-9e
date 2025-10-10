import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

export interface ProviderTemplate {
  providerId: string
  name: string
  description?: string
  baseUrl: string
  authType: 'oauth2' | 'api_key' | 'bearer_token' | 'basic_auth'
  capabilities: Array<{
    name: string
    interface: string
    methods: Array<{
      name: string
      description: string
      parameters: Record<string, any>
      returnType: string
    }>
  }>
  endpoints: Array<{
    name: string
    method: 'GET' | 'POST' | 'PUT' | 'DELETE'
    path: string
    description: string
    parameters?: Record<string, any>
  }>
  webhooks?: boolean
  rateLimits?: Array<{
    limit: number
    window: number
    type: 'requests' | 'operations'
  }>
}

export class ProviderGenerator {
  private outputDir: string

  constructor(outputDir: string = 'src/infrastructure/providers') {
    this.outputDir = outputDir
  }

  /**
   * Generate a complete provider from template
   */
  generateProvider(template: ProviderTemplate): void {
    console.log(`🏗️  Generating provider: ${template.name}`)

    // Ensure output directory exists
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true })
    }

    // Generate the main provider file
    const providerCode = this.generateProviderClass(template)
    const providerFile = join(this.outputDir, `${template.providerId}-adapter.ts`)
    writeFileSync(providerFile, providerCode)
    console.log(`  ✅ Generated: ${providerFile}`)

    // Generate types file if needed
    const typesCode = this.generateTypesFile(template)
    if (typesCode) {
      const typesFile = join(this.outputDir, `${template.providerId}-types.ts`)
      writeFileSync(typesFile, typesCode)
      console.log(`  ✅ Generated: ${typesFile}`)
    }

    // Generate test file
    const testCode = this.generateTestFile(template)
    const testFile = join(this.outputDir, `__tests__/${template.providerId}-adapter.test.ts`)
    const testDir = join(this.outputDir, '__tests__')
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true })
    }
    writeFileSync(testFile, testCode)
    console.log(`  ✅ Generated: ${testFile}`)

    // Generate registration code
    const registrationCode = this.generateRegistrationCode(template)
    const registrationFile = join(this.outputDir, `${template.providerId}-registration.ts`)
    writeFileSync(registrationFile, registrationCode)
    console.log(`  ✅ Generated: ${registrationFile}`)

    console.log(`🎉 Provider ${template.name} generated successfully!`)
    console.log(`📝 Next steps:`)
    console.log(`   1. Review generated files`)
    console.log(`   2. Implement custom logic in the provider class`)
    console.log(`   3. Add the provider to bootstrap system`)
    console.log(`   4. Test the integration`)
  }

  /**
   * Generate the main provider class
   */
  private generateProviderClass(template: ProviderTemplate): string {
    const className = `${this.toPascalCase(template.providerId) }Adapter`
    const interfaces = template.capabilities.map(cap => cap.interface).join(', ')
    const imports = this.generateImports(template)
    const capabilityDescriptor = this.generateCapabilityDescriptor(template)
    const methods = this.generateMethods(template)
    
    return `${imports}

export class ${className} implements ${interfaces} {
  readonly providerId = '${template.providerId}'
  readonly capabilities: CapabilityDescriptor = ${capabilityDescriptor}

  async validateConnection(userId: string): Promise<boolean> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, '${template.providerId}')
      
      // Test API access with a simple endpoint
      const response = await fetch('${template.baseUrl}/', {
        headers: {
          ${this.generateAuthHeader(template.authType)},
          'Content-Type': 'application/json'
        }
      })
      
      return response.ok
    } catch {
      return false
    }
  }

${methods}

  classifyError(error: Error): ErrorClassification {
    const message = error.message.toLowerCase()
    
    if (message.includes('unauthorized') || message.includes('invalid token')) {
      return 'authentication'
    }
    if (message.includes('forbidden') || message.includes('insufficient privileges')) {
      return 'authorization'
    }
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return 'rateLimit'
    }
    if (message.includes('network') || message.includes('timeout')) {
      return 'network'
    }
    if (message.includes('not found') || message.includes('does not exist')) {
      return 'notFound'
    }
    if (message.includes('invalid') || message.includes('bad request')) {
      return 'validation'
    }
    
    return 'unknown'
  }
}
`
  }

  /**
   * Generate imports for the provider
   */
  private generateImports(template: ProviderTemplate): string {
    const capabilityImports = template.capabilities.map(cap => cap.interface).join(', ')
    
    return `import { 
  ${capabilityImports}
} from '../../domains/integrations/ports/capability-interfaces'
import { CapabilityDescriptor, ErrorClassification } from '../../domains/integrations/ports/connector-contract'
import { getDecryptedAccessToken } from '../../../lib/workflows/actions/core/getDecryptedAccessToken'`
  }

  /**
   * Generate capability descriptor
   */
  private generateCapabilityDescriptor(template: ProviderTemplate): string {
    const rateLimits = template.rateLimits || [
      { type: 'requests', limit: 10, window: 1000 },
      { type: 'requests', limit: 1000, window: 60000 }
    ]

    const features = template.endpoints.map(endpoint => 
      endpoint.name.toLowerCase().replace(/\s+/g, '_')
    )

    return `{
    supportsWebhooks: ${template.webhooks || false},
    rateLimits: ${JSON.stringify(rateLimits, null, 6)},
    supportedFeatures: ${JSON.stringify(features, null, 6)}
  }`
  }

  /**
   * Generate auth header for different auth types
   */
  private generateAuthHeader(authType: string): string {
    switch (authType) {
      case 'oauth2':
      case 'bearer_token':
        return `'Authorization': \`Bearer \${accessToken}\``
      case 'api_key':
        return `'X-API-Key': accessToken`
      case 'basic_auth':
        return `'Authorization': \`Basic \${Buffer.from(accessToken).toString('base64')}\``
      default:
        return `'Authorization': \`Bearer \${accessToken}\``
    }
  }

  /**
   * Generate method implementations
   */
  private generateMethods(template: ProviderTemplate): string {
    let methods = ''

    for (const capability of template.capabilities) {
      for (const method of capability.methods) {
        methods += this.generateMethod(template, method)
      }
    }

    return methods
  }

  /**
   * Generate a single method implementation
   */
  private generateMethod(template: ProviderTemplate, method: any): string {
    const params = Object.keys(method.parameters).map(p => `${p}: ${method.parameters[p]}`).join(', ')
    const methodName = method.name
    const returnType = method.returnType
    
    return `
  async ${methodName}(${params}, userId: string): Promise<${returnType}> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, '${template.providerId}')
      
      // TODO: Implement ${method.description}
      // Example endpoint: ${template.baseUrl}/api/endpoint
      const response = await fetch('${template.baseUrl}/api/endpoint', {
        method: 'GET', // TODO: Update method
        headers: {
          ${this.generateAuthHeader(template.authType)},
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(\`${template.name} API error: \${response.status} - \${errorData.message || response.statusText}\`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: result,
        message: '${method.description} completed successfully'
      }
    } catch (error: any) {
      console.error('${template.name} ${method.name} error:', error)
      return {
        success: false,
        error: error.message || 'Failed to ${method.description.toLowerCase()}',
        output: { error: error.message, timestamp: new Date().toISOString() }
      }
    }
  }
`
  }

  /**
   * Generate types file
   */
  private generateTypesFile(template: ProviderTemplate): string | null {
    // Only generate if we have custom types
    if (!template.endpoints.some(e => e.parameters)) return null

    let types = `// Generated types for ${template.name} integration\n\n`
    
    for (const endpoint of template.endpoints) {
      if (endpoint.parameters) {
        const typeName = `${this.toPascalCase(endpoint.name) }Params`
        types += `export interface ${typeName} {\n`
        
        for (const [key, type] of Object.entries(endpoint.parameters)) {
          types += `  ${key}: ${type}\n`
        }
        
        types += `}\n\n`
      }
    }

    return types
  }

  /**
   * Generate test file
   */
  private generateTestFile(template: ProviderTemplate): string {
    const className = `${this.toPascalCase(template.providerId) }Adapter`
    
    return `import { ${className} } from '../${template.providerId}-adapter'

describe('${className}', () => {
  let provider: ${className}

  beforeEach(() => {
    provider = new ${className}()
  })

  describe('validateConnection', () => {
    it('should validate connection successfully', async () => {
      // TODO: Mock the API call
      const result = await provider.validateConnection('test-user-id')
      expect(typeof result).toBe('boolean')
    })

    it('should handle connection errors gracefully', async () => {
      // TODO: Test error scenarios
    })
  })

  describe('capabilities', () => {
    it('should have correct provider ID', () => {
      expect(provider.providerId).toBe('${template.providerId}')
    })

    it('should have valid capabilities', () => {
      expect(provider.capabilities).toBeDefined()
      expect(provider.capabilities.supportedFeatures).toBeInstanceOf(Array)
      expect(provider.capabilities.rateLimits).toBeInstanceOf(Array)
    })
  })

  // TODO: Add tests for each capability method
})
`
  }

  /**
   * Generate registration code for bootstrap
   */
  private generateRegistrationCode(template: ProviderTemplate): string {
    const className = `${this.toPascalCase(template.providerId) }Adapter`
    const capabilities = template.capabilities.map(c => `'${c.name}'`).join(', ')
    
    return `import { ${className} } from './${template.providerId}-adapter'
import { providerRegistry } from '../../domains/integrations/use-cases/provider-registry'
import { actionRegistry } from '../../domains/workflows/use-cases/action-registry'

export function register${className}(): void {
  const adapter = new ${className}()
  
  // Register provider with capabilities
  providerRegistry.register(
    adapter,
    [${capabilities}], // capability types
    { name: '${template.name}', version: '1.0.0' }
  )

  // Register actions
  actionRegistry.registerProvider('${template.providerId}', [
    // TODO: Add action configurations
    {
      actionType: 'test_action',
      handler: async (config, context) => {
        // TODO: Implement action handler
        return { success: true, message: 'Action completed' }
      },
      metadata: {
        name: 'Test Action',
        description: 'Test action for ${template.name}',
        version: '1.0.0',
        category: 'api'
      }
    }
  ])

  console.log('✅ ${template.name} provider registered')
}
`
  }

  /**
   * Convert string to PascalCase
   */
  private toPascalCase(str: string): string {
    return str
      .split(/[-_\s]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('')
  }

  /**
   * Generate provider from API specification
   */
  static fromOpenAPI(openApiSpec: any, providerId: string, name: string): ProviderTemplate {
    // TODO: Parse OpenAPI spec and generate template
    // This would analyze the spec and create endpoints, parameters, etc.
    throw new Error('OpenAPI parsing not implemented yet')
  }

  /**
   * Generate provider from existing API documentation
   */
  static fromDocumentation(docUrl: string, providerId: string, name: string): ProviderTemplate {
    // TODO: Scrape API documentation and generate template
    throw new Error('Documentation parsing not implemented yet')
  }

  /**
   * Quick templates for common provider types
   */
  static getTemplate(type: 'crm' | 'email' | 'chat' | 'file' | 'social', providerId: string, name: string, baseUrl: string): ProviderTemplate {
    const templates = {
      crm: {
        capabilities: [
          {
            name: 'crm',
            interface: 'CRMProvider',
            methods: [
              {
                name: 'createContact',
                description: 'Create a new contact',
                parameters: { contact: 'CRMContact' },
                returnType: 'ContactResult'
              },
              {
                name: 'getContacts',
                description: 'Get contacts',
                parameters: { filters: 'CRMFilters' },
                returnType: 'CRMContact[]'
              }
            ]
          }
        ],
        endpoints: [
          { name: 'Create Contact', method: 'POST' as const, path: '/contacts', description: 'Create a new contact' },
          { name: 'Get Contacts', method: 'GET' as const, path: '/contacts', description: 'List contacts' }
        ]
      },
      email: {
        capabilities: [
          {
            name: 'email',
            interface: 'EmailProvider',
            methods: [
              {
                name: 'sendMessage',
                description: 'Send an email',
                parameters: { params: 'EmailMessage' },
                returnType: 'EmailResult'
              }
            ]
          }
        ],
        endpoints: [
          { name: 'Send Email', method: 'POST' as const, path: '/messages/send', description: 'Send an email message' }
        ]
      },
      chat: {
        capabilities: [
          {
            name: 'chat',
            interface: 'ChatProvider',
            methods: [
              {
                name: 'sendMessage',
                description: 'Send a chat message',
                parameters: { params: 'ChatMessage' },
                returnType: 'ChatResult'
              }
            ]
          }
        ],
        endpoints: [
          { name: 'Send Message', method: 'POST' as const, path: '/messages', description: 'Send a chat message' }
        ]
      },
      file: {
        capabilities: [
          {
            name: 'file',
            interface: 'FileProvider',
            methods: [
              {
                name: 'uploadFile',
                description: 'Upload a file',
                parameters: { params: 'FileUpload' },
                returnType: 'FileResult'
              }
            ]
          }
        ],
        endpoints: [
          { name: 'Upload File', method: 'POST' as const, path: '/files', description: 'Upload a file' }
        ]
      },
      social: {
        capabilities: [
          {
            name: 'social',
            interface: 'SocialProvider',
            methods: [
              {
                name: 'createPost',
                description: 'Create a social media post',
                parameters: { params: 'SocialPost' },
                returnType: 'SocialResult'
              }
            ]
          }
        ],
        endpoints: [
          { name: 'Create Post', method: 'POST' as const, path: '/posts', description: 'Create a social media post' }
        ]
      }
    }

    const template = templates[type]
    
    return {
      providerId,
      name,
      baseUrl,
      authType: 'oauth2',
      capabilities: template.capabilities,
      endpoints: template.endpoints,
      webhooks: false
    }
  }
}

/**
 * Interactive provider generator CLI
 */
export class InteractiveProviderGenerator {
  async generateProvider(): Promise<void> {
    console.log('🚀 Welcome to the ChainReact Provider Generator!')
    
    // In a real implementation, this would use a CLI library like inquirer
    // to interactively collect information from the developer
    
    console.log('This would interactively collect:')
    console.log('- Provider name and ID')
    console.log('- API base URL')
    console.log('- Authentication type')
    console.log('- Capabilities and features')
    console.log('- API endpoints to implement')
    console.log('- Rate limiting configuration')
    console.log('- Webhook support')
    
    // For now, just show how it would work
    const template: ProviderTemplate = {
      providerId: 'example-api',
      name: 'Example API',
      baseUrl: 'https://api.example.com',
      authType: 'oauth2',
      capabilities: [
        {
          name: 'crm',
          interface: 'CRMProvider',
          methods: [
            {
              name: 'createContact',
              description: 'Create a new contact',
              parameters: { contact: 'CRMContact' },
              returnType: 'ContactResult'
            }
          ]
        }
      ],
      endpoints: [
        {
          name: 'Create Contact',
          method: 'POST',
          path: '/contacts',
          description: 'Create a new contact'
        }
      ],
      webhooks: true
    }
    
    const generator = new ProviderGenerator()
    generator.generateProvider(template)
  }
}