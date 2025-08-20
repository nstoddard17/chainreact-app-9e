#!/usr/bin/env node

import { program } from 'commander'
import { ProviderGenerator, ProviderTemplate, InteractiveProviderGenerator } from '../src/sdk/provider-generator'
import { ProviderTestUtils } from '../src/sdk/provider-sdk'
import { providerRegistry } from '../src/domains/integrations/use-cases/provider-registry'
import { actionRegistry } from '../src/domains/workflows/use-cases/action-registry'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

/**
 * ChainReact Provider CLI
 * A command-line tool for managing integration providers
 */

program
  .name('provider-cli')
  .description('ChainReact Provider Development CLI')
  .version('1.0.0')

// Generate a new provider
program
  .command('generate')
  .alias('gen')
  .description('Generate a new provider')
  .option('-t, --template <type>', 'Template type (crm, email, chat, file, social)')
  .option('-i, --id <id>', 'Provider ID')
  .option('-n, --name <name>', 'Provider name')
  .option('-u, --url <url>', 'Base API URL')
  .option('-a, --auth <type>', 'Auth type (oauth2, api_key, bearer_token, basic_auth)')
  .option('--interactive', 'Interactive mode')
  .option('--output <dir>', 'Output directory', 'src/infrastructure/providers')
  .action(async (options) => {
    try {
      if (options.interactive) {
        const interactive = new InteractiveProviderGenerator()
        await interactive.generateProvider()
        return
      }

      if (!options.template || !options.id || !options.name || !options.url) {
        console.error('❌ Missing required options. Use --interactive or provide --template, --id, --name, and --url')
        process.exit(1)
      }

      const template = ProviderGenerator.getTemplate(
        options.template,
        options.id,
        options.name,
        options.url
      )

      if (options.auth) {
        template.authType = options.auth
      }

      const generator = new ProviderGenerator(options.output)
      generator.generateProvider(template)

      console.log('\n🎉 Provider generated successfully!')
      console.log('\n📝 Next steps:')
      console.log('  1. Review the generated files')
      console.log('  2. Implement the API methods')
      console.log('  3. Add the provider to your bootstrap file')
      console.log('  4. Test the integration')

    } catch (error) {
      console.error('❌ Error generating provider:', error)
      process.exit(1)
    }
  })

// List all providers
program
  .command('list')
  .alias('ls')
  .description('List all registered providers')
  .option('-d, --detailed', 'Show detailed information')
  .option('-c, --capabilities', 'Group by capabilities')
  .action((options) => {
    try {
      const providers = providerRegistry.listProviders()
      
      if (providers.length === 0) {
        console.log('📭 No providers registered')
        return
      }

      console.log(`\n📦 Registered Providers (${providers.length} total)\n`)

      if (options.capabilities) {
        // Group by capabilities
        const grouped = new Map<string, any[]>()
        
        providers.forEach(provider => {
          provider.types.forEach(type => {
            if (!grouped.has(type)) {
              grouped.set(type, [])
            }
            grouped.get(type)!.push(provider)
          })
        })

        for (const [capability, providerList] of grouped.entries()) {
          console.log(`🔧 ${capability.toUpperCase()} (${providerList.length} providers)`)
          providerList.forEach(provider => {
            console.log(`  ├─ ${provider.name} (${provider.providerId})`)
          })
          console.log()
        }
      } else {
        // Simple list
        providers.forEach(provider => {
          if (options.detailed) {
            console.log(`📋 ${provider.name}`)
            console.log(`   ID: ${provider.providerId}`)
            console.log(`   Types: ${provider.types.join(', ')}`)
            console.log(`   Features: ${provider.capabilities.supportedFeatures.slice(0, 3).join(', ')}${provider.capabilities.supportedFeatures.length > 3 ? '...' : ''}`)
            console.log(`   Webhooks: ${provider.capabilities.supportsWebhooks ? '✅' : '❌'}`)
            console.log()
          } else {
            console.log(`📋 ${provider.name} (${provider.providerId}) - ${provider.types.join(', ')}`)
          }
        })
      }

      // Show actions count
      const actions = actionRegistry.listActions()
      console.log(`🎯 Total Actions: ${actions.length}`)

    } catch (error) {
      console.error('❌ Error listing providers:', error)
      process.exit(1)
    }
  })

// Test a provider
program
  .command('test [providerId]')
  .description('Run comprehensive integration tests')
  .option('-u, --user <userId>', 'User ID for testing', 'test-user')
  .option('-t, --types <types>', 'Test types (connection,auth,actions,errors,webhooks,performance)', 'connection,auth,actions,errors')
  .option('-m, --mock', 'Run in mock mode for safe testing')
  .option('-v, --verbose', 'Verbose output')
  .option('-e, --export <file>', 'Export results to file')
  .option('--quick', 'Run quick validation tests only')
  .action(async (providerId, options) => {
    try {
      if (options.quick) {
        const { TestFrameworkCLI } = await import('../src/sdk/test-framework')
        console.log('🚀 Running quick validation tests...')
        const success = await TestFrameworkCLI.runQuickTests(providerId)
        if (success) {
          console.log('✅ Quick tests passed')
        } else {
          console.log('❌ Quick tests failed')
          process.exit(1)
        }
        return
      }

      const { TestFrameworkCLI } = await import('../src/sdk/test-framework')
      
      const testTypes = options.types.split(',').map(t => t.trim())
      
      console.log(`🧪 Running comprehensive integration tests...`)
      if (providerId) {
        console.log(`📋 Testing provider: ${providerId}`)
      } else {
        console.log('📋 Testing all providers')
      }

      const results = await TestFrameworkCLI.runAllTests({
        providerId,
        testTypes,
        mockMode: options.mock,
        verbose: options.verbose,
        exportPath: options.export
      })

      const passed = results.filter(r => r.success).length
      const total = results.length

      if (passed === total) {
        console.log('\n🎉 All tests passed!')
      } else {
        console.log(`\n⚠️ ${total - passed} tests failed`)
        process.exit(1)
      }

    } catch (error) {
      console.error('❌ Error running tests:', error)
      process.exit(1)
    }
  })

// Validate provider configuration
program
  .command('validate <file>')
  .description('Validate a provider configuration file')
  .action((file) => {
    try {
      if (!existsSync(file)) {
        console.error(`❌ File not found: ${file}`)
        process.exit(1)
      }

      console.log(`🔍 Validating provider configuration: ${file}`)
      
      const content = readFileSync(file, 'utf-8')
      const config = JSON.parse(content)
      
      const errors = ProviderTestUtils.validateProviderConfig(config)
      
      if (errors.length === 0) {
        console.log('✅ Provider configuration is valid!')
      } else {
        console.log('❌ Validation errors:')
        errors.forEach(error => console.log(`  - ${error}`))
        process.exit(1)
      }

    } catch (error) {
      console.error('❌ Error validating configuration:', error)
      process.exit(1)
    }
  })

// Generate documentation
program
  .command('docs')
  .description('Generate provider documentation')
  .option('-o, --output <dir>', 'Output directory', 'docs')
  .option('-f, --format <formats>', 'Output formats (markdown,html,json,openapi)', 'markdown')
  .option('-p, --provider <id>', 'Generate docs for specific provider')
  .option('-t, --template <type>', 'Template type (comprehensive, minimal, api-reference)', 'comprehensive')
  .action(async (options) => {
    try {
      const { DocGeneratorCLI } = await import('../src/sdk/doc-generator')
      
      const formats = options.format.split(',').map(f => f.trim())
      
      if (options.provider) {
        console.log(`📚 Generating documentation for provider: ${options.provider}`)
        await DocGeneratorCLI.generateProvider(options.provider, {
          formats,
          outputDir: options.output
        })
      } else {
        console.log('📚 Generating comprehensive provider documentation...')
        await DocGeneratorCLI.generateAll({
          formats,
          outputDir: options.output,
          template: options.template
        })
      }

    } catch (error) {
      console.error('❌ Error generating documentation:', error)
      process.exit(1)
    }
  })

// Generate test templates
program
  .command('test-template <providerId>')
  .description('Generate test template for a provider')
  .option('-o, --output <file>', 'Output file path')
  .action(async (providerId, options) => {
    try {
      const { TestFrameworkCLI } = await import('../src/sdk/test-framework')
      
      const template = TestFrameworkCLI.generateTestTemplate(providerId)
      const outputFile = options.output || `${providerId}.test.ts`
      
      writeFileSync(outputFile, template)
      console.log(`✅ Test template generated: ${outputFile}`)
      
      console.log('\n📝 Next steps:')
      console.log('  1. Review the generated test template')
      console.log('  2. Add provider-specific test cases')
      console.log('  3. Run tests with: npm run provider-cli test')
      
    } catch (error) {
      console.error('❌ Error generating test template:', error)
      process.exit(1)
    }
  })

// Bootstrap helpers
program
  .command('bootstrap')
  .description('Bootstrap development environment')
  .option('--init', 'Initialize provider development environment')
  .option('--test-env', 'Set up testing environment')
  .action(async (options) => {
    if (options.init) {
      console.log('🚀 Initializing provider development environment...')
      
      // Create example configuration
      const exampleConfig = {
        providerId: 'example-api',
        name: 'Example API',
        description: 'An example API integration',
        baseUrl: 'https://api.example.com',
        authType: 'oauth2',
        capabilities: ['crm'],
        features: ['create_contact', 'get_contacts'],
        rateLimits: [
          { type: 'requests', limit: 10, window: 1000 }
        ],
        supportsWebhooks: true
      }
      
      writeFileSync('provider-config.example.json', JSON.stringify(exampleConfig, null, 2))
      console.log('✅ Created example configuration: provider-config.example.json')
      
      console.log('\n📝 Quick start:')
      console.log('  1. Copy provider-config.example.json to your-provider.json')
      console.log('  2. Edit the configuration for your API')
      console.log('  3. Run: npm run provider-cli generate --config your-provider.json')
      console.log('  4. Implement the generated provider methods')
      
    } else if (options.testEnv) {
      console.log('🧪 Setting up testing environment...')
      
      // Create test configuration
      const testConfig = {
        testFramework: {
          timeout: 30000,
          retries: 2,
          mockMode: true,
          verbose: true
        },
        testData: {
          userId: 'test-user-123',
          validCredentials: {
            accessToken: 'test-token'
          }
        }
      }
      
      writeFileSync('test.config.json', JSON.stringify(testConfig, null, 2))
      console.log('✅ Created test configuration: test.config.json')
      
      console.log('\n🧪 Testing commands:')
      console.log('  npm run provider-cli test --quick          # Quick validation')
      console.log('  npm run provider-cli test --mock           # Safe mock testing')
      console.log('  npm run provider-cli test provider-id      # Test specific provider')
      console.log('  npm run provider-cli test --export report.json  # Export results')
      
    } else {
      console.log('Available bootstrap options:')
      console.log('  --init      Initialize development environment')
      console.log('  --test-env  Set up testing environment')
    }
  })

// Error handling
program.configureHelp({
  sortSubcommands: true,
})

program.parseAsync(process.argv).catch((error) => {
  console.error('❌ CLI Error:', error)
  process.exit(1)
})