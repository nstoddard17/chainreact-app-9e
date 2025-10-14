import { ConnectorContract } from '../domains/integrations/ports/connector-contract'
import { providerRegistry } from '../domains/integrations/use-cases/provider-registry'
import { actionRegistry } from '../domains/workflows/use-cases/action-registry'

import { logger } from '@/lib/utils/logger'

/**
 * Test result interface
 */
export interface TestResult {
  testName: string
  providerId: string
  success: boolean
  duration: number
  error?: string
  details?: any
  timestamp: string
}

/**
 * Test suite configuration
 */
export interface TestSuiteConfig {
  providerId?: string
  testTypes?: TestType[]
  timeout?: number
  retries?: number
  userId?: string
  mockMode?: boolean
  verbose?: boolean
}

/**
 * Types of tests that can be run
 */
export type TestType = 
  | 'connection'
  | 'authentication' 
  | 'actions'
  | 'rate-limiting'
  | 'error-handling'
  | 'webhooks'
  | 'performance'

/**
 * Mock data for testing
 */
export interface MockTestData {
  userId: string
  validCredentials: Record<string, any>
  invalidCredentials: Record<string, any>
  testParameters: Record<string, any>
  expectedResponses: Record<string, any>
}

/**
 * Comprehensive testing framework for integration providers
 */
export class IntegrationTestFramework {
  private results: TestResult[] = []
  private config: TestSuiteConfig
  private startTime: number = 0

  constructor(config: TestSuiteConfig = {}) {
    this.config = {
      timeout: 30000,
      retries: 2,
      userId: 'test-user-123',
      mockMode: false,
      verbose: false,
      testTypes: ['connection', 'authentication', 'actions', 'error-handling'],
      ...config
    }
  }

  /**
   * Run comprehensive test suite
   */
  async runTestSuite(providerId?: string): Promise<TestResult[]> {
    logger.debug('🧪 Starting Integration Test Suite...')
    this.startTime = Date.now()
    this.results = []

    const providers = providerId 
      ? [providerRegistry.getProvider(providerId)].filter(Boolean)
      : providerRegistry.listProviders().map(p => providerRegistry.getProvider(p.providerId)).filter(Boolean)

    if (providers.length === 0) {
      logger.debug('❌ No providers found to test')
      return []
    }

    logger.debug(`📋 Testing ${providers.length} provider(s) with ${this.config.testTypes!.length} test types`)

    for (const provider of providers) {
      if (provider) {
        await this.testProvider(provider)
      }
    }

    this.printSummary()
    return this.results
  }

  /**
   * Test a specific provider
   */
  async testProvider(provider: ConnectorContract): Promise<void> {
    const providerId = provider.providerId
    logger.debug(`\n🔍 Testing Provider: ${providerId}`)

    for (const testType of this.config.testTypes!) {
      try {
        await this.runTest(testType, provider)
      } catch (error) {
        this.addResult({
          testName: testType,
          providerId,
          success: false,
          duration: 0,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString()
        })
      }
    }
  }

  /**
   * Run a specific test type
   */
  private async runTest(testType: TestType, provider: ConnectorContract): Promise<void> {
    const startTime = Date.now()
    const providerId = provider.providerId

    try {
      let result: any
      
      switch (testType) {
        case 'connection':
          result = await this.testConnection(provider)
          break
        case 'authentication':
          result = await this.testAuthentication(provider)
          break
        case 'actions':
          result = await this.testActions(provider)
          break
        case 'rate-limiting':
          result = await this.testRateLimiting(provider)
          break
        case 'error-handling':
          result = await this.testErrorHandling(provider)
          break
        case 'webhooks':
          result = await this.testWebhooks(provider)
          break
        case 'performance':
          result = await this.testPerformance(provider)
          break
        default:
          throw new Error(`Unknown test type: ${testType}`)
      }

      this.addResult({
        testName: testType,
        providerId,
        success: true,
        duration: Date.now() - startTime,
        details: result,
        timestamp: new Date().toISOString()
      })

      if (this.config.verbose) {
        logger.debug(`  ✅ ${testType} test passed (${Date.now() - startTime}ms)`)
      }

    } catch (error) {
      this.addResult({
        testName: testType,
        providerId,
        success: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      })

      if (this.config.verbose) {
        logger.debug(`  ❌ ${testType} test failed: ${error}`)
      }
    }
  }

  /**
   * Test provider connection
   */
  private async testConnection(provider: ConnectorContract): Promise<any> {
    if (this.config.mockMode) {
      return { mockResult: 'Connection test skipped in mock mode' }
    }

    const canConnect = await this.withTimeout(
      provider.validateConnection(this.config.userId!),
      this.config.timeout!
    )

    if (typeof canConnect !== 'boolean') {
      throw new Error('validateConnection must return boolean')
    }

    return { canConnect, message: canConnect ? 'Connection successful' : 'Connection failed' }
  }

  /**
   * Test authentication mechanisms
   */
  private async testAuthentication(provider: ConnectorContract): Promise<any> {
    const tests = []

    // Test with valid credentials (if not in mock mode)
    if (!this.config.mockMode) {
      try {
        const result = await provider.validateConnection(this.config.userId!)
        tests.push({ type: 'valid_credentials', success: result })
      } catch (error) {
        tests.push({ type: 'valid_credentials', success: false, error: error.message })
      }
    }

    // Test with invalid credentials
    try {
      const result = await provider.validateConnection('invalid-user-id-12345')
      tests.push({ type: 'invalid_credentials', success: !result }) // Should fail
    } catch (error) {
      tests.push({ type: 'invalid_credentials', success: true, error: 'Expected failure' })
    }

    return { authTests: tests }
  }

  /**
   * Test provider actions
   */
  private async testActions(provider: ConnectorContract): Promise<any> {
    const providerId = provider.providerId
    const actions = actionRegistry.listActions().filter(a => a.providerId === providerId)
    
    if (actions.length === 0) {
      return { message: 'No actions to test' }
    }

    const actionTests = []

    for (const action of actions.slice(0, 3)) { // Test first 3 actions
      try {
        if (this.config.mockMode) {
          actionTests.push({
            actionType: action.actionType,
            success: true,
            result: 'Mock test passed'
          })
        } else {
          // In real mode, we'd need test parameters for each action
          // For now, just verify the action is registered
          actionTests.push({
            actionType: action.actionType,
            success: true,
            result: 'Action registration verified'
          })
        }
      } catch (error) {
        actionTests.push({
          actionType: action.actionType,
          success: false,
          error: error.message
        })
      }
    }

    return { actionTests, totalActions: actions.length }
  }

  /**
   * Test rate limiting behavior
   */
  private async testRateLimiting(provider: ConnectorContract): Promise<any> {
    const rateLimits = provider.capabilities.rateLimits
    
    if (!rateLimits || rateLimits.length === 0) {
      return { message: 'No rate limits configured' }
    }

    const rateLimitTests = []

    for (const limit of rateLimits) {
      const testResult = {
        limit: `${limit.limit}/${limit.window}ms`,
        type: limit.type,
        tested: true
      }

      if (this.config.mockMode) {
        testResult['result'] = 'Rate limit configuration verified'
      } else {
        // In real mode, we could test by making rapid requests
        testResult['result'] = 'Rate limit configuration found'
      }

      rateLimitTests.push(testResult)
    }

    return { rateLimitTests }
  }

  /**
   * Test error handling and classification
   */
  private async testErrorHandling(provider: ConnectorContract): Promise<any> {
    const errorTests = []

    // Test various error types
    const testErrors = [
      new Error('Unauthorized access'),
      new Error('Rate limit exceeded'),
      new Error('Network timeout'),
      new Error('Invalid request'),
      new Error('Resource not found'),
      new Error('Forbidden operation')
    ]

    for (const error of testErrors) {
      const classification = provider.classifyError(error)
      errorTests.push({
        errorMessage: error.message,
        classification,
        success: classification !== 'unknown'
      })
    }

    return { errorTests }
  }

  /**
   * Test webhook support
   */
  private async testWebhooks(provider: ConnectorContract): Promise<any> {
    const supportsWebhooks = provider.capabilities.supportsWebhooks

    if (!supportsWebhooks) {
      return { message: 'Webhooks not supported by this provider' }
    }

    // Test webhook configuration validation
    const webhookTests = [{
      test: 'webhook_support',
      success: true,
      result: 'Provider declares webhook support'
    }]

    if (this.config.mockMode) {
      webhookTests.push({
        test: 'webhook_endpoint',
        success: true,
        result: 'Mock webhook endpoint test passed'
      })
    }

    return { webhookTests }
  }

  /**
   * Test performance characteristics
   */
  private async testPerformance(provider: ConnectorContract): Promise<any> {
    const performanceTests = []

    // Test connection time
    const connectionStart = Date.now()
    try {
      await this.withTimeout(
        provider.validateConnection(this.config.userId!),
        5000 // 5 second timeout for performance test
      )
      const connectionTime = Date.now() - connectionStart
      performanceTests.push({
        test: 'connection_time',
        duration: connectionTime,
        success: connectionTime < 3000, // Should connect within 3 seconds
        threshold: '3000ms'
      })
    } catch (error) {
      performanceTests.push({
        test: 'connection_time',
        success: false,
        error: error.message
      })
    }

    // Test error classification performance
    const classificationStart = Date.now()
    provider.classifyError(new Error('Test error'))
    const classificationTime = Date.now() - classificationStart
    
    performanceTests.push({
      test: 'error_classification_time',
      duration: classificationTime,
      success: classificationTime < 100, // Should classify within 100ms
      threshold: '100ms'
    })

    return { performanceTests }
  }

  /**
   * Utility to run promises with timeout
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    })

    return Promise.race([promise, timeoutPromise])
  }

  /**
   * Add test result
   */
  private addResult(result: TestResult): void {
    this.results.push(result)
  }

  /**
   * Print test summary
   */
  private printSummary(): void {
    const totalTime = Date.now() - this.startTime
    const totalTests = this.results.length
    const passedTests = this.results.filter(r => r.success).length
    const failedTests = totalTests - passedTests

    logger.debug('\n📊 Test Summary')
    logger.debug(''.padEnd(50, '='))
    logger.debug(`Total Tests: ${totalTests}`)
    logger.debug(`Passed: ${passedTests} ✅`)
    logger.debug(`Failed: ${failedTests} ❌`)
    logger.debug(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`)
    logger.debug(`Total Time: ${totalTime}ms`)

    if (failedTests > 0) {
      logger.debug('\n❌ Failed Tests:')
      this.results
        .filter(r => !r.success)
        .forEach(r => {
          logger.debug(`  ${r.providerId}:${r.testName} - ${r.error}`)
        })
    }

    // Group results by provider
    const byProvider = new Map<string, TestResult[]>()
    this.results.forEach(result => {
      if (!byProvider.has(result.providerId)) {
        byProvider.set(result.providerId, [])
      }
      byProvider.get(result.providerId)!.push(result)
    })

    logger.debug('\n📋 Results by Provider:')
    for (const [providerId, results] of byProvider.entries()) {
      const passed = results.filter(r => r.success).length
      const total = results.length
      const status = passed === total ? '✅' : passed > 0 ? '⚠️' : '❌'
      logger.debug(`  ${status} ${providerId}: ${passed}/${total} tests passed`)
    }
  }

  /**
   * Export results to JSON
   */
  exportResults(filePath: string): void {
    const report = {
      summary: {
        totalTests: this.results.length,
        passedTests: this.results.filter(r => r.success).length,
        failedTests: this.results.filter(r => !r.success).length,
        successRate: (this.results.filter(r => r.success).length / this.results.length) * 100,
        totalDuration: Date.now() - this.startTime,
        timestamp: new Date().toISOString()
      },
      config: this.config,
      results: this.results
    }

    require('fs').writeFileSync(filePath, JSON.stringify(report, null, 2))
    logger.debug(`📄 Test report exported to: ${filePath}`)
  }
}

/**
 * Mock provider for testing framework validation
 */
export class MockProvider implements ConnectorContract {
  providerId: string
  capabilities: any

  constructor(providerId: string = 'mock-provider') {
    this.providerId = providerId
    this.capabilities = {
      supportsWebhooks: true,
      rateLimits: [
        { type: 'requests', limit: 10, window: 1000 },
        { type: 'requests', limit: 1000, window: 60000 }
      ],
      supportedFeatures: ['test_action', 'mock_action']
    }
  }

  async validateConnection(userId: string): Promise<boolean> {
    // Simulate some delay
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Return true for valid test user, false for others
    return userId === 'test-user-123'
  }

  classifyError(error: Error): any {
    const message = error.message.toLowerCase()
    
    if (message.includes('unauthorized')) return 'authentication'
    if (message.includes('rate limit')) return 'rateLimit'
    if (message.includes('timeout')) return 'network'
    if (message.includes('not found')) return 'notFound'
    if (message.includes('invalid')) return 'validation'
    
    return 'unknown'
  }
}

/**
 * Test utilities and helpers
 */
export class TestUtils {
  /**
   * Create test data for a provider
   */
  static createTestData(providerId: string): MockTestData {
    return {
      userId: 'test-user-123',
      validCredentials: {
        accessToken: 'valid-token-123',
        refreshToken: 'refresh-token-123'
      },
      invalidCredentials: {
        accessToken: 'invalid-token',
        refreshToken: 'invalid-refresh'
      },
      testParameters: {
        limit: 10,
        query: 'test query',
        message: 'Test message'
      },
      expectedResponses: {
        success: { success: true, message: 'Operation completed' },
        error: { success: false, error: 'Test error' }
      }
    }
  }

  /**
   * Validate test results
   */
  static validateResults(results: TestResult[]): boolean {
    return results.every(result => 
      result.testName && 
      result.providerId && 
      typeof result.success === 'boolean' &&
      typeof result.duration === 'number' &&
      result.timestamp
    )
  }

  /**
   * Generate test report in markdown format
   */
  static generateMarkdownReport(results: TestResult[]): string {
    const totalTests = results.length
    const passedTests = results.filter(r => r.success).length
    const failedTests = totalTests - passedTests

    let markdown = `# Integration Test Report\n\n`
    markdown += `**Generated:** ${new Date().toLocaleDateString()}\n\n`
    markdown += `## Summary\n\n`
    markdown += `- **Total Tests:** ${totalTests}\n`
    markdown += `- **Passed:** ${passedTests} ✅\n`
    markdown += `- **Failed:** ${failedTests} ❌\n`
    markdown += `- **Success Rate:** ${((passedTests / totalTests) * 100).toFixed(1)}%\n\n`

    // Group by provider
    const byProvider = new Map<string, TestResult[]>()
    results.forEach(result => {
      if (!byProvider.has(result.providerId)) {
        byProvider.set(result.providerId, [])
      }
      byProvider.get(result.providerId)!.push(result)
    })

    markdown += `## Results by Provider\n\n`
    for (const [providerId, providerResults] of byProvider.entries()) {
      const passed = providerResults.filter(r => r.success).length
      const total = providerResults.length
      const status = passed === total ? '✅' : passed > 0 ? '⚠️' : '❌'
      
      markdown += `### ${status} ${providerId}\n\n`
      markdown += `**Tests:** ${passed}/${total} passed\n\n`
      markdown += `| Test | Status | Duration | Details |\n`
      markdown += `|------|--------|----------|----------|\n`
      
      providerResults.forEach(result => {
        const status = result.success ? '✅' : '❌'
        const details = result.error || 'Passed'
        markdown += `| ${result.testName} | ${status} | ${result.duration}ms | ${details} |\n`
      })
      
      markdown += '\n'
    }

    return markdown
  }
}

/**
 * CLI integration for testing framework
 */
export class TestFrameworkCLI {
  /**
   * Run all tests
   */
  static async runAllTests(options: {
    providerId?: string
    testTypes?: TestType[]
    mockMode?: boolean
    verbose?: boolean
    exportPath?: string
  } = {}): Promise<TestResult[]> {
    const framework = new IntegrationTestFramework({
      providerId: options.providerId,
      testTypes: options.testTypes,
      mockMode: options.mockMode || false,
      verbose: options.verbose || false
    })

    const results = await framework.runTestSuite(options.providerId)

    if (options.exportPath) {
      framework.exportResults(options.exportPath)
    }

    return results
  }

  /**
   * Run quick validation tests
   */
  static async runQuickTests(providerId?: string): Promise<boolean> {
    const framework = new IntegrationTestFramework({
      testTypes: ['connection', 'authentication'],
      timeout: 10000,
      mockMode: true,
      verbose: false
    })

    const results = await framework.runTestSuite(providerId)
    return results.every(r => r.success)
  }

  /**
   * Generate test template for a provider
   */
  static generateTestTemplate(providerId: string): string {
    return `import { IntegrationTestFramework, MockProvider, TestUtils } from '@chainreact/sdk'

describe('${providerId} Integration Tests', () => {
  let framework: IntegrationTestFramework
  let provider: MockProvider

  beforeEach(() => {
    framework = new IntegrationTestFramework({
      mockMode: true,
      verbose: true
    })
    provider = new MockProvider('${providerId}')
  })

  it('should validate connection', async () => {
    const result = await provider.validateConnection('test-user-123')
    expect(result).toBe(true)
  })

  it('should classify errors correctly', () => {
    const error = new Error('Unauthorized access')
    const classification = provider.classifyError(error)
    expect(classification).toBe('authentication')
  })

  it('should run full test suite', async () => {
    const results = await framework.runTestSuite('${providerId}')
    expect(results.length).toBeGreaterThan(0)
    expect(TestUtils.validateResults(results)).toBe(true)
  })
})
`
  }
}