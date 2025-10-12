import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { providerRegistry } from '../domains/integrations/use-cases/provider-registry'
import { actionRegistry } from '../domains/workflows/use-cases/action-registry'

import { logger } from '@/lib/utils/logger'

/**
 * Documentation format options
 */
export type DocFormat = 'markdown' | 'html' | 'json' | 'openapi'

/**
 * Documentation configuration
 */
export interface DocConfig {
  title?: string
  description?: string
  version?: string
  outputDir?: string
  includeExamples?: boolean
  includeSchemas?: boolean
  includeTesting?: boolean
  template?: 'comprehensive' | 'minimal' | 'api-reference'
}

/**
 * Provider documentation metadata
 */
export interface ProviderDocs {
  provider: {
    id: string
    name: string
    description?: string
    version: string
    capabilities: string[]
    features: string[]
    authType?: string
    baseUrl?: string
    webhookSupport: boolean
    rateLimits: Array<{
      type: string
      limit: number
      window: number
    }>
  }
  actions: Array<{
    actionType: string
    name: string
    description: string
    category: string
    parameters?: Record<string, any>
    examples?: Array<{
      name: string
      description: string
      parameters: Record<string, any>
      response?: any
    }>
  }>
  examples?: {
    authentication?: string
    basicUsage?: string
    errorHandling?: string
  }
}

/**
 * Auto-generated documentation system for integration providers
 */
export class DocGenerator {
  private config: DocConfig

  constructor(config: DocConfig = {}) {
    this.config = {
      title: 'ChainReact Integration Providers',
      description: 'Comprehensive documentation for all integration providers',
      version: '1.0.0',
      outputDir: 'docs',
      includeExamples: true,
      includeSchemas: true,
      includeTesting: true,
      template: 'comprehensive',
      ...config
    }
  }

  /**
   * Generate documentation for all providers
   */
  async generateAll(formats: DocFormat[] = ['markdown']): Promise<void> {
    logger.debug('📚 Generating provider documentation...')
    
    // Ensure output directory exists
    if (!existsSync(this.config.outputDir!)) {
      mkdirSync(this.config.outputDir!, { recursive: true })
    }

    const providers = providerRegistry.listProviders()
    const actions = actionRegistry.listActions()
    
    if (providers.length === 0) {
      logger.debug('⚠️ No providers found to document')
      return
    }

    // Generate documentation for each format
    for (const format of formats) {
      await this.generateFormat(format, providers, actions)
    }

    // Generate index/overview
    await this.generateOverview(providers, actions)
    
    logger.debug(`✅ Documentation generated in ${this.config.outputDir}`)
    logger.debug(`📄 Documented ${providers.length} providers with ${actions.length} actions`)
  }

  /**
   * Generate documentation for a specific provider
   */
  async generateProvider(providerId: string, formats: DocFormat[] = ['markdown']): Promise<void> {
    const provider = providerRegistry.getProvider(providerId)
    if (!provider) {
      throw new Error(`Provider '${providerId}' not found`)
    }

    const providerInfo = providerRegistry.listProviders().find(p => p.providerId === providerId)
    const providerActions = actionRegistry.listActions().filter(a => a.providerId === providerId)

    if (!providerInfo) {
      throw new Error(`Provider info for '${providerId}' not found`)
    }

    const docs = this.extractProviderDocs(providerInfo, providerActions)
    
    for (const format of formats) {
      await this.generateProviderDocs(docs, format)
    }
  }

  /**
   * Generate documentation in specific format
   */
  private async generateFormat(format: DocFormat, providers: any[], actions: any[]): Promise<void> {
    switch (format) {
      case 'markdown':
        await this.generateMarkdown(providers, actions)
        break
      case 'html':
        await this.generateHtml(providers, actions)
        break
      case 'json':
        await this.generateJson(providers, actions)
        break
      case 'openapi':
        await this.generateOpenApi(providers, actions)
        break
    }
  }

  /**
   * Generate Markdown documentation
   */
  private async generateMarkdown(providers: any[], actions: any[]): Promise<void> {
    let markdown = this.generateMarkdownHeader()
    
    // Table of contents
    markdown += '## Table of Contents\n\n'
    markdown += '- [Overview](#overview)\n'
    markdown += '- [Quick Start](#quick-start)\n'
    markdown += '- [Authentication](#authentication)\n'
    markdown += '- [Rate Limiting](#rate-limiting)\n'
    markdown += '- [Error Handling](#error-handling)\n'
    
    // Group providers by capability
    const byCapability = this.groupByCapability(providers)
    for (const [capability, providerList] of byCapability.entries()) {
      markdown += `- [${capability.charAt(0).toUpperCase() + capability.slice(1)} Providers](#${capability}-providers)\n`
      for (const provider of providerList) {
        markdown += `  - [${provider.name}](#${provider.providerId})\n`
      }
    }
    
    markdown += '- [Testing](#testing)\n'
    markdown += '- [Contributing](#contributing)\n\n'

    // Overview section
    markdown += this.generateOverviewSection(providers, actions)
    
    // Quick start
    markdown += this.generateQuickStartSection()
    
    // Authentication
    markdown += this.generateAuthenticationSection(providers)
    
    // Rate limiting
    markdown += this.generateRateLimitingSection(providers)
    
    // Error handling
    markdown += this.generateErrorHandlingSection()

    // Provider sections
    for (const [capability, providerList] of byCapability.entries()) {
      markdown += `## ${capability.charAt(0).toUpperCase() + capability.slice(1)} Providers\n\n`
      
      for (const provider of providerList) {
        const providerActions = actions.filter(a => a.providerId === provider.providerId)
        markdown += this.generateProviderMarkdown(provider, providerActions)
      }
    }

    // Testing section
    if (this.config.includeTesting) {
      markdown += this.generateTestingSection()
    }

    // Contributing section
    markdown += this.generateContributingSection()

    // Write to file
    const filePath = join(this.config.outputDir!, 'README.md')
    writeFileSync(filePath, markdown)
    logger.debug(`  ✅ Generated: ${filePath}`)
  }

  /**
   * Generate HTML documentation
   */
  private async generateHtml(providers: any[], actions: any[]): Promise<void> {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.config.title}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; border-radius: 10px; margin-bottom: 30px; }
        .provider { background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #007bff; }
        .action { background: white; border-radius: 6px; padding: 15px; margin: 10px 0; border: 1px solid #e9ecef; }
        .badge { background: #007bff; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; margin: 2px; }
        .code { background: #f8f9fa; padding: 15px; border-radius: 6px; font-family: 'Courier New', monospace; margin: 10px 0; overflow-x: auto; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
        .stat { background: white; padding: 20px; border-radius: 8px; text-align: center; border: 1px solid #e9ecef; }
        .stat-value { font-size: 2em; font-weight: bold; color: #007bff; }
        .nav { background: #343a40; padding: 10px; border-radius: 6px; margin: 20px 0; }
        .nav a { color: #ffffff; text-decoration: none; margin: 0 15px; }
        .nav a:hover { color: #007bff; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${this.config.title}</h1>
        <p>${this.config.description}</p>
        <p>Version: ${this.config.version} | Generated: ${new Date().toLocaleDateString()}</p>
    </div>

    <div class="stats">
        <div class="stat">
            <div class="stat-value">${providers.length}</div>
            <div>Providers</div>
        </div>
        <div class="stat">
            <div class="stat-value">${actions.length}</div>
            <div>Actions</div>
        </div>
        <div class="stat">
            <div class="stat-value">${new Set(providers.flatMap(p => p.types)).size}</div>
            <div>Capabilities</div>
        </div>
        <div class="stat">
            <div class="stat-value">${providers.filter(p => p.capabilities.supportsWebhooks).length}</div>
            <div>Webhook Support</div>
        </div>
    </div>

    <div class="nav">
        ${Array.from(this.groupByCapability(providers).keys()).map(cap => 
          `<a href="#${cap}">${cap.charAt(0).toUpperCase() + cap.slice(1)}</a>`
        ).join('')}
    </div>

    ${this.generateProvidersHtml(providers, actions)}
</body>
</html>`

    const filePath = join(this.config.outputDir!, 'index.html')
    writeFileSync(filePath, html)
    logger.debug(`  ✅ Generated: ${filePath}`)
  }

  /**
   * Generate JSON documentation
   */
  private async generateJson(providers: any[], actions: any[]): Promise<void> {
    const docs = {
      metadata: {
        title: this.config.title,
        description: this.config.description,
        version: this.config.version,
        generated: new Date().toISOString(),
        totalProviders: providers.length,
        totalActions: actions.length
      },
      providers: providers.map(provider => {
        const providerActions = actions.filter(a => a.providerId === provider.providerId)
        return this.extractProviderDocs(provider, providerActions)
      }),
      capabilities: Array.from(this.groupByCapability(providers).entries()).map(([cap, provs]) => ({
        name: cap,
        providers: provs.length,
        providerIds: provs.map(p => p.providerId)
      })),
      statistics: {
        byCapability: Object.fromEntries(this.groupByCapability(providers)),
        webhookEnabled: providers.filter(p => p.capabilities.supportsWebhooks).length,
        authTypes: Object.fromEntries(
          Object.entries(
            providers.reduce((acc, p) => {
              const authType = p.authType || 'unknown'
              acc[authType] = (acc[authType] || 0) + 1
              return acc
            }, {})
          )
        )
      }
    }

    const filePath = join(this.config.outputDir!, 'providers.json')
    writeFileSync(filePath, JSON.stringify(docs, null, 2))
    logger.debug(`  ✅ Generated: ${filePath}`)
  }

  /**
   * Generate OpenAPI specification
   */
  private async generateOpenApi(providers: any[], actions: any[]): Promise<void> {
    const openapi = {
      openapi: '3.0.3',
      info: {
        title: this.config.title!,
        description: this.config.description!,
        version: this.config.version!,
        contact: {
          name: 'ChainReact Integration Team',
          url: 'https://github.com/your-org/chainreact'
        }
      },
      servers: [
        {
          url: 'https://api.chainreact.app',
          description: 'Production server'
        }
      ],
      paths: {},
      components: {
        schemas: {},
        securitySchemes: {
          oauth2: {
            type: 'oauth2',
            flows: {
              authorizationCode: {
                authorizationUrl: 'https://api.chainreact.app/oauth/authorize',
                tokenUrl: 'https://api.chainreact.app/oauth/token',
                scopes: {}
              }
            }
          },
          apiKey: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key'
          }
        }
      }
    }

    // Add provider-specific paths and schemas
    for (const provider of providers) {
      const providerActions = actions.filter(a => a.providerId === provider.providerId)
      
      for (const action of providerActions) {
        const path = `/integrations/${provider.providerId}/actions/${action.actionType}`
        openapi.paths[path] = {
          post: {
            summary: action.metadata.name,
            description: action.metadata.description,
            tags: [provider.name],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      parameters: {
                        type: 'object',
                        description: 'Action parameters'
                      }
                    }
                  }
                }
              }
            },
            responses: {
              '200': {
                description: 'Action executed successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        output: { type: 'object' },
                        message: { type: 'string' }
                      }
                    }
                  }
                }
              },
              '400': {
                description: 'Bad request'
              },
              '401': {
                description: 'Unauthorized'
              },
              '500': {
                description: 'Internal server error'
              }
            },
            security: [
              { oauth2: [] },
              { apiKey: [] }
            ]
          }
        }
      }
    }

    const filePath = join(this.config.outputDir!, 'openapi.yaml')
    writeFileSync(filePath, JSON.stringify(openapi, null, 2))
    logger.debug(`  ✅ Generated: ${filePath}`)
  }

  /**
   * Generate overview documentation
   */
  private async generateOverview(providers: any[], actions: any[]): Promise<void> {
    const overview = `# Integration Overview

## Quick Statistics
- **${providers.length}** total providers
- **${actions.length}** total actions
- **${new Set(providers.flatMap(p => p.types)).size}** capabilities supported
- **${providers.filter(p => p.capabilities.supportsWebhooks).length}** providers with webhook support

## Capabilities Distribution
${Array.from(this.groupByCapability(providers).entries())
  .map(([cap, provs]) => `- **${cap}**: ${provs.length} providers`)
  .join('\n')}

## Recently Updated
${providers
  .slice(0, 5)
  .map(p => `- [${p.name}](${p.providerId}.md) - ${p.capabilities.supportedFeatures.length} features`)
  .join('\n')}

## Getting Started
1. Choose a provider from the capability you need
2. Set up authentication (OAuth2, API key, etc.)
3. Configure the integration in your workflow
4. Test the connection and actions

## Support
- [API Reference](README.md)
- [Testing Guide](testing.md)
- [Contributing](contributing.md)
`

    const filePath = join(this.config.outputDir!, 'overview.md')
    writeFileSync(filePath, overview)
    logger.debug(`  ✅ Generated: ${filePath}`)
  }

  // Helper methods
  private generateMarkdownHeader(): string {
    return `# ${this.config.title}

${this.config.description}

**Version:** ${this.config.version}  
**Generated:** ${new Date().toLocaleDateString()}

---

`
  }

  private generateOverviewSection(providers: any[], actions: any[]): string {
    return `## Overview

ChainReact supports **${providers.length} integration providers** with **${actions.length} total actions** across **${new Set(providers.flatMap(p => p.types)).size} capabilities**.

### Supported Capabilities
${Array.from(this.groupByCapability(providers).entries())
  .map(([cap, provs]) => `- **${cap.charAt(0).toUpperCase() + cap.slice(1)}** (${provs.length} providers): ${provs.map(p => p.name).join(', ')}`)
  .join('\n')}

### Authentication Support
- **OAuth2**: ${providers.filter(p => (p.authType || 'oauth2') === 'oauth2').length} providers
- **API Key**: ${providers.filter(p => (p.authType || 'oauth2') === 'api_key').length} providers
- **Bearer Token**: ${providers.filter(p => (p.authType || 'oauth2') === 'bearer_token').length} providers

### Webhook Support
**${providers.filter(p => p.capabilities.supportsWebhooks).length}** providers support real-time webhooks for instant notifications.

`
  }

  private generateQuickStartSection(): string {
    return `## Quick Start

### 1. Install Dependencies
\`\`\`bash
npm install @chainreact/sdk
\`\`\`

### 2. Initialize Provider
\`\`\`typescript
import { ProviderSDK } from '@chainreact/sdk'

const provider = ProviderSDK.createApiProvider({
  providerId: 'your-provider',
  name: 'Your Provider',
  baseUrl: 'https://api.yourservice.com',
  capabilities: ['email'],
  features: ['send_message']
})
\`\`\`

### 3. Register and Use
\`\`\`typescript
provider.register(new YourProviderAdapter())

// Use in workflows
const result = await provider.sendMessage({
  to: ['user@example.com'],
  subject: 'Hello World',
  body: 'Your integration is working!'
}, userId)
\`\`\`

`
  }

  private generateAuthenticationSection(providers: any[]): string {
    const authTypes = new Set(providers.map(p => p.authType || 'oauth2'))
    
    return `## Authentication

ChainReact supports multiple authentication methods:

${Array.from(authTypes).map(authType => {
  switch (authType) {
    case 'oauth2':
      return `### OAuth2
Standard OAuth2 flow with authorization code grant. Most secure for user-facing integrations.

\`\`\`typescript
// OAuth2 setup handled automatically by ChainReact
// Users authenticate through provider's OAuth flow
\`\`\``
    case 'api_key':
      return `### API Key
Simple API key authentication for server-to-server integrations.

\`\`\`typescript
// Set API key in environment or user settings
process.env.PROVIDER_API_KEY = 'your-api-key'
\`\`\``
    case 'bearer_token':
      return `### Bearer Token
Bearer token authentication for modern APIs.

\`\`\`typescript
// Bearer token stored securely and included in requests
Authorization: Bearer your-token
\`\`\``
    default:
      return ''
  }
}).join('\n\n')}

`
  }

  private generateRateLimitingSection(providers: any[]): string {
    return `## Rate Limiting

All providers implement intelligent rate limiting to respect API constraints:

### Default Limits
- **10 requests/second** for real-time operations
- **1000 requests/minute** for batch operations

### Provider-Specific Limits
${providers.slice(0, 5).map(p => 
  `- **${p.name}**: ${p.capabilities.rateLimits.map(rl => `${rl.limit}/${rl.window}ms`).join(', ')}`
).join('\n')}

### Rate Limit Handling
- Automatic retry with exponential backoff
- Queue management for burst requests
- Error classification for rate limit errors

`
  }

  private generateErrorHandlingSection(): string {
    return `## Error Handling

ChainReact provides comprehensive error classification and handling:

### Error Types
- **Authentication**: Invalid or expired tokens
- **Authorization**: Insufficient permissions
- **Rate Limit**: API rate limits exceeded
- **Network**: Connection and timeout errors
- **Validation**: Invalid input parameters
- **Not Found**: Resource doesn't exist

### Error Response Format
\`\`\`typescript
{
  success: false,
  error: "Error message",
  classification: "authentication",
  output: {
    error: "Detailed error info",
    timestamp: "2025-01-20T10:30:00Z"
  }
}
\`\`\`

### Retry Logic
- Automatic retry for transient errors
- Exponential backoff for rate limits
- Circuit breaker for persistent failures

`
  }

  private generateProviderMarkdown(provider: any, actions: any[]): string {
    return `### ${provider.name} {#${provider.providerId}}

${provider.description || `Integration with ${provider.name} API`}

**Provider ID:** \`${provider.providerId}\`  
**Capabilities:** ${provider.types.join(', ')}  
**Features:** ${provider.capabilities.supportedFeatures.slice(0, 5).join(', ')}${provider.capabilities.supportedFeatures.length > 5 ? '...' : ''}  
**Webhooks:** ${provider.capabilities.supportsWebhooks ? '✅' : '❌'}  
**Rate Limits:** ${provider.capabilities.rateLimits.map(rl => `${rl.limit}/${rl.window}ms`).join(', ')}

#### Available Actions (${actions.length})

${actions.slice(0, 10).map(action => `
**\`${action.actionType}\`** - ${action.metadata.name}  
${action.metadata.description}
`).join('')}

${actions.length > 10 ? `\n*...and ${actions.length - 10} more actions*\n` : ''}

#### Example Usage

\`\`\`typescript
import { providerRegistry } from '@chainreact/sdk'

const provider = providerRegistry.getProvider('${provider.providerId}')
const result = await provider.${actions[0]?.actionType || 'someAction'}(params, userId)
\`\`\`

---

`
  }

  private generateTestingSection(): string {
    return `## Testing

### Provider Testing
\`\`\`bash
# Test all providers
npm run provider-cli test

# Test specific provider
npm run provider-cli test gmail

# Validate provider configuration
npm run provider-cli validate config.json
\`\`\`

### Integration Testing
\`\`\`typescript
import { ProviderTestUtils } from '@chainreact/sdk'

// Test provider registration
const isValid = await ProviderTestUtils.testProviderRegistration(provider)

// Test connection
const canConnect = await provider.validateConnection(userId)
\`\`\`

### Mock Testing
\`\`\`typescript
const mockProvider = ProviderTestUtils.createMockProvider('test-provider')
// Use mock for unit tests
\`\`\`

`
  }

  private generateContributingSection(): string {
    return `## Contributing

### Adding New Providers

1. **Generate scaffold**
   \`\`\`bash
   npm run provider-cli generate --interactive
   \`\`\`

2. **Implement methods**
   \`\`\`typescript
   export class YourProviderAdapter extends BaseProvider implements EmailProvider {
     // Implement required methods
   }
   \`\`\`

3. **Add tests**
   \`\`\`bash
   npm run provider-cli test your-provider
   \`\`\`

4. **Register provider**
   \`\`\`typescript
   import { registerYourProvider } from './your-provider-registration'
   registerYourProvider()
   \`\`\`

### Development Tools
- **CLI**: \`npm run provider-cli --help\`
- **Templates**: Pre-built templates for common provider types
- **Testing**: Automated testing and validation
- **Documentation**: Auto-generated from code

### Guidelines
- Follow existing patterns and conventions
- Include comprehensive error handling
- Add rate limiting configuration
- Write tests for all methods
- Update documentation

---

*Generated automatically by ChainReact Doc Generator*
`
  }

  private generateProvidersHtml(providers: any[], actions: any[]): string {
    const byCapability = this.groupByCapability(providers)
    
    return Array.from(byCapability.entries()).map(([capability, providerList]) => `
      <h2 id="${capability}">${capability.charAt(0).toUpperCase() + capability.slice(1)} Providers</h2>
      ${providerList.map(provider => {
        const providerActions = actions.filter(a => a.providerId === provider.providerId)
        return `
          <div class="provider">
            <h3>${provider.name}</h3>
            <p><strong>ID:</strong> <code>${provider.providerId}</code></p>
            <p><strong>Features:</strong> ${provider.capabilities.supportedFeatures.slice(0, 5).map(f => `<span class="badge">${f}</span>`).join('')}</p>
            <p><strong>Webhooks:</strong> ${provider.capabilities.supportsWebhooks ? '✅' : '❌'}</p>
            <p><strong>Actions:</strong> ${providerActions.length}</p>
            
            <h4>Available Actions</h4>
            ${providerActions.slice(0, 5).map(action => `
              <div class="action">
                <strong>${action.metadata.name}</strong> (<code>${action.actionType}</code>)
                <br><small>${action.metadata.description}</small>
              </div>
            `).join('')}
            ${providerActions.length > 5 ? `<p><em>...and ${providerActions.length - 5} more actions</em></p>` : ''}
          </div>
        `
      }).join('')}
    `).join('')
  }

  private groupByCapability(providers: any[]): Map<string, any[]> {
    const grouped = new Map<string, any[]>()
    
    providers.forEach(provider => {
      provider.types.forEach(type => {
        if (!grouped.has(type)) {
          grouped.set(type, [])
        }
        grouped.get(type)!.push(provider)
      })
    })
    
    return grouped
  }

  private extractProviderDocs(provider: any, actions: any[]): ProviderDocs {
    return {
      provider: {
        id: provider.providerId,
        name: provider.name,
        description: provider.description,
        version: '1.0.0',
        capabilities: provider.types,
        features: provider.capabilities.supportedFeatures,
        authType: provider.authType || 'oauth2',
        baseUrl: provider.baseUrl,
        webhookSupport: provider.capabilities.supportsWebhooks,
        rateLimits: provider.capabilities.rateLimits
      },
      actions: actions.map(action => ({
        actionType: action.actionType,
        name: action.metadata.name,
        description: action.metadata.description,
        category: action.metadata.category || 'api',
        parameters: action.parameters
      })),
      examples: this.config.includeExamples ? {
        authentication: this.generateAuthExample(provider),
        basicUsage: this.generateUsageExample(provider, actions[0]),
        errorHandling: this.generateErrorExample(provider)
      } : undefined
    }
  }

  private generateAuthExample(provider: any): string {
    return `// ${provider.name} authentication example
const provider = providerRegistry.getProvider('${provider.providerId}')
const isConnected = await provider.validateConnection(userId)`
  }

  private generateUsageExample(provider: any, action?: any): string {
    if (!action) return `// No actions available for ${provider.name}`
    
    return `// ${provider.name} usage example
const provider = providerRegistry.getProvider('${provider.providerId}')
const result = await provider.${action.actionType}(parameters, userId)`
  }

  private generateErrorExample(provider: any): string {
    return `// ${provider.name} error handling
try {
  const result = await provider.someAction(params, userId)
} catch (error) {
  const classification = provider.classifyError(error)
  logger.debug('Error type:', classification)
}`
  }

  private async generateProviderDocs(docs: ProviderDocs, format: DocFormat): Promise<void> {
    const fileName = `${docs.provider.id}.${format === 'markdown' ? 'md' : format}`
    const filePath = join(this.config.outputDir!, fileName)
    
    let content: string
    
    switch (format) {
      case 'markdown':
        content = this.generateSingleProviderMarkdown(docs)
        break
      case 'json':
        content = JSON.stringify(docs, null, 2)
        break
      default:
        throw new Error(`Format ${format} not supported for single provider docs`)
    }
    
    writeFileSync(filePath, content)
    logger.debug(`  ✅ Generated: ${filePath}`)
  }

  private generateSingleProviderMarkdown(docs: ProviderDocs): string {
    return `# ${docs.provider.name}

${docs.provider.description || `Integration with ${docs.provider.name} API`}

## Provider Information

- **Provider ID**: \`${docs.provider.id}\`
- **Version**: ${docs.provider.version}
- **Capabilities**: ${docs.provider.capabilities.join(', ')}
- **Authentication**: ${docs.provider.authType}
- **Base URL**: ${docs.provider.baseUrl || 'N/A'}
- **Webhook Support**: ${docs.provider.webhookSupport ? '✅ Yes' : '❌ No'}

## Features

${docs.provider.features.map(feature => `- \`${feature}\``).join('\n')}

## Rate Limits

${docs.provider.rateLimits.map(limit => `- ${limit.limit} ${limit.type} per ${limit.window}ms`).join('\n')}

## Actions

${docs.actions.map(action => `
### \`${action.actionType}\` - ${action.name}

${action.description}

**Category**: ${action.category}

\`\`\`typescript
// Example usage
const result = await provider.${action.actionType}(parameters, userId)
\`\`\`
`).join('')}

${docs.examples ? `
## Examples

### Authentication
\`\`\`typescript
${docs.examples.authentication}
\`\`\`

### Basic Usage
\`\`\`typescript
${docs.examples.basicUsage}
\`\`\`

### Error Handling
\`\`\`typescript
${docs.examples.errorHandling}
\`\`\`
` : ''}

## Support

For issues with this provider, please check:
1. Authentication credentials are valid
2. Required permissions are granted
3. Rate limits are not exceeded
4. API endpoints are accessible

---

*Auto-generated documentation for ${docs.provider.name}*
`
  }
}

/**
 * CLI integration for documentation generation
 */
export class DocGeneratorCLI {
  static async generateAll(options: {
    formats?: DocFormat[]
    outputDir?: string
    template?: 'comprehensive' | 'minimal' | 'api-reference'
  } = {}): Promise<void> {
    const generator = new DocGenerator({
      outputDir: options.outputDir || 'docs',
      template: options.template || 'comprehensive'
    })
    
    await generator.generateAll(options.formats || ['markdown', 'html', 'json'])
  }
  
  static async generateProvider(providerId: string, options: {
    formats?: DocFormat[]
    outputDir?: string
  } = {}): Promise<void> {
    const generator = new DocGenerator({
      outputDir: options.outputDir || 'docs'
    })
    
    await generator.generateProvider(providerId, options.formats || ['markdown'])
  }
}