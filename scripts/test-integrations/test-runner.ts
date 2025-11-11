#!/usr/bin/env tsx
/**
 * Automated Integration Test Runner
 *
 * Tests all actions and triggers across all integrations.
 * Generates a comprehensive test report showing what works and what fails.
 *
 * Usage:
 *   npm run test:integrations                    # Test all
 *   npm run test:integrations -- --provider gmail  # Test specific provider
 *   npm run test:integrations -- --actions-only    # Only test actions
 *   npm run test:integrations -- --triggers-only   # Only test triggers
 *   npm run test:integrations -- --verbose         # Show detailed logs
 */

import { testConfigs, type ActionTest, type TriggerTest, type ProviderTestConfig } from './test-config'
import { testAction } from './action-tester'
import { testTrigger } from './trigger-tester'
import { generateReport } from './report-generator'

interface TestResult {
  provider: string
  type: 'action' | 'trigger'
  name: string
  passed: boolean
  error?: string
  duration: number
  skipped: boolean
  skipReason?: string
}

interface TestSummary {
  total: number
  passed: number
  failed: number
  skipped: number
  duration: number
  results: TestResult[]
}

// ================================================================
// CLI ARGUMENTS
// ================================================================

const args = process.argv.slice(2)
const options = {
  provider: args.find(arg => arg.startsWith('--provider='))?.split('=')[1],
  actionsOnly: args.includes('--actions-only'),
  triggersOnly: args.includes('--triggers-only'),
  verbose: args.includes('--verbose') || args.includes('-v'),
  help: args.includes('--help') || args.includes('-h'),
}

if (options.help) {
  console.log(`
Automated Integration Test Runner

Usage:
  npm run test:integrations [options]

Options:
  --provider=<name>     Test only a specific provider (e.g., --provider=gmail)
  --actions-only        Test only actions (skip triggers)
  --triggers-only       Test only triggers (skip actions)
  --verbose, -v         Show detailed logs
  --help, -h            Show this help message

Examples:
  npm run test:integrations
  npm run test:integrations -- --provider=hubspot
  npm run test:integrations -- --actions-only --verbose
  `)
  process.exit(0)
}

// ================================================================
// MAIN TEST RUNNER
// ================================================================

async function runTests(): Promise<TestSummary> {
  const summary: TestSummary = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    duration: 0,
    results: [],
  }

  const startTime = Date.now()

  // Filter configs based on CLI options
  let configs = testConfigs
  if (options.provider) {
    configs = configs.filter(c => c.provider === options.provider)
    if (configs.length === 0) {
      console.error(`❌ Provider "${options.provider}" not found in test configs`)
      process.exit(1)
    }
  }

  console.log('\n🧪 ChainReact Integration Test Suite\n')
  console.log(`Testing ${configs.length} provider(s)...\n`)

  // Test each provider
  for (const config of configs) {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`📦 ${config.displayName} (${config.provider})`)
    console.log('='.repeat(60))

    // Test actions
    if (!options.triggersOnly) {
      console.log(`\n🔧 Testing ${config.actions.length} action(s)...`)
      for (const action of config.actions) {
        const result = await runActionTest(config, action)
        summary.results.push(result)
        summary.total++
        if (result.skipped) {
          summary.skipped++
        } else if (result.passed) {
          summary.passed++
        } else {
          summary.failed++
        }
      }
    }

    // Test triggers
    if (!options.actionsOnly) {
      console.log(`\n🎯 Testing ${config.triggers.length} trigger(s)...`)
      for (const trigger of config.triggers) {
        const result = await runTriggerTest(config, trigger)
        summary.results.push(result)
        summary.total++
        if (result.skipped) {
          summary.skipped++
        } else if (result.passed) {
          summary.passed++
        } else {
          summary.failed++
        }
      }
    }
  }

  summary.duration = Date.now() - startTime

  return summary
}

// ================================================================
// TEST EXECUTION
// ================================================================

async function runActionTest(
  config: ProviderTestConfig,
  action: ActionTest
): Promise<TestResult> {
  const startTime = Date.now()

  // Check if skipped
  if (action.skipReason) {
    console.log(`  ⏭️  ${action.actionName} - SKIPPED`)
    if (options.verbose) {
      console.log(`      Reason: ${action.skipReason}`)
    }
    return {
      provider: config.provider,
      type: 'action',
      name: action.actionName,
      passed: false,
      skipped: true,
      skipReason: action.skipReason,
      duration: 0,
    }
  }

  try {
    if (options.verbose) {
      console.log(`  🔍 Testing: ${action.actionName}`)
      console.log(`      Node Type: ${action.nodeType}`)
      console.log(`      Config:`, JSON.stringify(action.config, null, 2))
    }

    await testAction(config.provider, action)

    const duration = Date.now() - startTime
    console.log(`  ✅ ${action.actionName} - PASSED (${duration}ms)`)

    return {
      provider: config.provider,
      type: 'action',
      name: action.actionName,
      passed: true,
      duration,
      skipped: false,
    }
  } catch (error: any) {
    const duration = Date.now() - startTime
    console.log(`  ❌ ${action.actionName} - FAILED (${duration}ms)`)
    if (options.verbose) {
      console.log(`      Error: ${error.message}`)
      if (error.stack) {
        console.log(`      Stack: ${error.stack}`)
      }
    } else {
      console.log(`      Error: ${error.message}`)
    }

    return {
      provider: config.provider,
      type: 'action',
      name: action.actionName,
      passed: false,
      error: error.message,
      duration,
      skipped: false,
    }
  }
}

async function runTriggerTest(
  config: ProviderTestConfig,
  trigger: TriggerTest
): Promise<TestResult> {
  const startTime = Date.now()

  // Check if skipped
  if (trigger.skipReason) {
    console.log(`  ⏭️  ${trigger.triggerName} - SKIPPED`)
    if (options.verbose) {
      console.log(`      Reason: ${trigger.skipReason}`)
    }
    return {
      provider: config.provider,
      type: 'trigger',
      name: trigger.triggerName,
      passed: false,
      skipped: true,
      skipReason: trigger.skipReason,
      duration: 0,
    }
  }

  try {
    if (options.verbose) {
      console.log(`  🔍 Testing: ${trigger.triggerName}`)
      console.log(`      Node Type: ${trigger.nodeType}`)
      console.log(`      Payload:`, JSON.stringify(trigger.webhookPayload, null, 2))
    }

    await testTrigger(config.provider, trigger)

    const duration = Date.now() - startTime
    console.log(`  ✅ ${trigger.triggerName} - PASSED (${duration}ms)`)

    return {
      provider: config.provider,
      type: 'trigger',
      name: trigger.triggerName,
      passed: true,
      duration,
      skipped: false,
    }
  } catch (error: any) {
    const duration = Date.now() - startTime
    console.log(`  ❌ ${trigger.triggerName} - FAILED (${duration}ms)`)
    if (options.verbose) {
      console.log(`      Error: ${error.message}`)
      if (error.stack) {
        console.log(`      Stack: ${error.stack}`)
      }
    } else {
      console.log(`      Error: ${error.message}`)
    }

    return {
      provider: config.provider,
      type: 'trigger',
      name: trigger.triggerName,
      passed: false,
      error: error.message,
      duration,
      skipped: false,
    }
  }
}

// ================================================================
// RUN AND REPORT
// ================================================================

runTests()
  .then(summary => {
    // Print summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 TEST SUMMARY')
    console.log('='.repeat(60))
    console.log(`Total Tests:    ${summary.total}`)
    console.log(`✅ Passed:      ${summary.passed} (${Math.round((summary.passed / summary.total) * 100)}%)`)
    console.log(`❌ Failed:      ${summary.failed} (${Math.round((summary.failed / summary.total) * 100)}%)`)
    console.log(`⏭️  Skipped:     ${summary.skipped} (${Math.round((summary.skipped / summary.total) * 100)}%)`)
    console.log(`⏱️  Duration:    ${(summary.duration / 1000).toFixed(2)}s`)

    // Generate detailed report
    const reportPath = generateReport(summary)
    console.log(`\n📄 Detailed report saved to: ${reportPath}`)

    // Exit with appropriate code
    process.exit(summary.failed > 0 ? 1 : 0)
  })
  .catch(error => {
    console.error('\n❌ Test runner failed:', error)
    process.exit(1)
  })
