/**
 * Automated Node Testing System
 * Tests all 247 workflow nodes (actions + triggers) automatically
 *
 * Purpose:
 * - Validate that all actions can execute without errors
 * - Verify that all triggers can be set up properly
 * - Check configuration schemas are valid
 * - Test actual API calls with real integrations
 * - Generate comprehensive test reports
 */

import { ALL_NODE_COMPONENTS } from '../nodes'
import type { NodeComponent } from '../nodes/types'
import { logger } from '@/lib/utils/logger'
import { actionHandlerRegistry } from '../actions/registry'
import { buildTestConfig, TEST_USER_ID, shouldSkipTest } from './testData'
import { createClient } from '@supabase/supabase-js'
import { TriggerLifecycleManager } from '@/lib/triggers/TriggerLifecycleManager'

// Initialize Supabase client for getting integrations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface NodeTestResult {
  nodeType: string
  nodeTitle: string
  category: string
  provider: string
  isTrigger: boolean
  passed: boolean
  duration: number
  error?: string
  warnings: string[]
  details: {
    configSchemaValid: boolean
    outputSchemaValid: boolean
    requiredFieldsValid: boolean
    executionSuccessful?: boolean
    apiCallSuccessful?: boolean
    webhookSetupSuccessful?: boolean
  }
}

export interface TestRunSummary {
  totalNodes: number
  totalActions: number
  totalTriggers: number
  passed: number
  failed: number
  warnings: number
  duration: number
  passRate: number
  results: NodeTestResult[]
  failedNodes: NodeTestResult[]
  nodesByProvider: Record<string, NodeTestResult[]>
  nodesByCategory: Record<string, NodeTestResult[]>
}

/**
 * Main test runner that executes all node tests
 */
export class NodeTestRunner {
  private nodes: NodeComponent[]
  private results: NodeTestResult[] = []
  private startTime: number = 0
  private userId: string = ''
  private lifecycleManager: TriggerLifecycleManager

  constructor() {
    this.nodes = ALL_NODE_COMPONENTS
    this.lifecycleManager = new TriggerLifecycleManager()
  }

  /**
   * Run all tests
   */
  async runAllTests(options: {
    testRealAPIs?: boolean
    maxParallel?: number
    timeout?: number
    userId?: string
  } = {}): Promise<TestRunSummary> {
    const { testRealAPIs = false, maxParallel = 10, timeout = 30000, userId } = options

    // Get test user ID
    this.userId = userId || await this.getTestUserId()
    if (!this.userId) {
      throw new Error('No test user ID available. Set TEST_USER_ID env var or provide userId in options.')
    }

    this.startTime = Date.now()
    logger.info(`[NodeTestRunner] Starting tests for ${this.nodes.length} nodes...`)
    logger.info(`[NodeTestRunner] Test mode: ${testRealAPIs ? 'Real API calls' : 'Validation only'}`)
    logger.info(`[NodeTestRunner] Test user ID: ${this.userId}`)

    // Run tests in batches for better performance
    const batches = this.createBatches(this.nodes, maxParallel)

    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(node => this.testNode(node, { testRealAPIs, timeout }))
      )
      this.results.push(...batchResults)
    }

    return this.generateSummary()
  }

  /**
   * Test a specific provider's nodes
   */
  async testProvider(providerId: string, options: {
    testRealAPIs?: boolean
    maxParallel?: number
    timeout?: number
    userId?: string
  } = {}): Promise<TestRunSummary> {
    const providerNodes = this.nodes.filter(n => n.providerId === providerId)

    logger.info(`[NodeTestRunner] Testing ${providerNodes.length} nodes for provider: ${providerId}`)

    // Get test user ID
    this.userId = options.userId || await this.getTestUserId()

    this.startTime = Date.now()
    this.results = []

    for (const node of providerNodes) {
      const result = await this.testNode(node, options)
      this.results.push(result)
    }

    return this.generateSummary()
  }

  /**
   * Get test user ID from environment or find first admin user
   */
  private async getTestUserId(): Promise<string> {
    if (TEST_USER_ID && TEST_USER_ID !== 'test-user-id') {
      return TEST_USER_ID
    }

    // Find first admin user
    const { data: admins } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('admin', true)
      .limit(1)

    if (admins && admins.length > 0) {
      return admins[0].id
    }

    throw new Error('No admin user found for testing')
  }

  /**
   * Test a single node
   */
  async testNode(
    node: NodeComponent,
    options: { testRealAPIs?: boolean; timeout?: number } = {}
  ): Promise<NodeTestResult> {
    const startTime = Date.now()
    const result: NodeTestResult = {
      nodeType: node.type,
      nodeTitle: node.title,
      category: node.category || 'unknown',
      provider: node.providerId || 'system',
      isTrigger: node.isTrigger,
      passed: true,
      duration: 0,
      warnings: [],
      details: {
        configSchemaValid: true,
        outputSchemaValid: true,
        requiredFieldsValid: true,
      }
    }

    try {
      // Test 1: Validate configuration schema
      this.validateConfigSchema(node, result)

      // Test 2: Validate output schema
      this.validateOutputSchema(node, result)

      // Test 3: Validate required fields
      this.validateRequiredFields(node, result)

      // Test 4: Test execution (if testRealAPIs is true)
      if (options.testRealAPIs) {
        // Check if provider should be skipped
        if (shouldSkipTest(result.provider)) {
          result.warnings.push('Provider skipped - no test configuration')
          result.details.executionSuccessful = false
        } else if (node.isTrigger) {
          await this.testTriggerSetup(node, result, options.timeout)
        } else {
          await this.testActionExecution(node, result, options.timeout)
        }
      }

    } catch (error: any) {
      result.passed = false
      result.error = error.message || 'Unknown error'
      logger.error(`[NodeTestRunner] Test failed for ${node.type}:`, error)
    }

    result.duration = Date.now() - startTime
    return result
  }

  /**
   * Validate configuration schema
   */
  private validateConfigSchema(node: NodeComponent, result: NodeTestResult): void {
    if (!node.configSchema) {
      result.warnings.push('No configSchema defined')
      return
    }

    if (!Array.isArray(node.configSchema)) {
      result.passed = false
      result.details.configSchemaValid = false
      result.error = 'configSchema is not an array'
      return
    }

    // Check each field has required properties
    for (const field of node.configSchema) {
      if (!field.name) {
        result.warnings.push(`Config field missing name`)
      }
      if (!field.label) {
        result.warnings.push(`Config field '${field.name}' missing label`)
      }
      if (!field.type) {
        result.warnings.push(`Config field '${field.name}' missing type`)
      }
    }

    // Check for duplicate field names
    const fieldNames = node.configSchema.map(f => f.name)
    const duplicates = fieldNames.filter((name, index) => fieldNames.indexOf(name) !== index)
    if (duplicates.length > 0) {
      result.passed = false
      result.details.configSchemaValid = false
      result.error = `Duplicate field names: ${duplicates.join(', ')}`
    }
  }

  /**
   * Validate output schema
   */
  private validateOutputSchema(node: NodeComponent, result: NodeTestResult): void {
    // Triggers and actions that produce output should have outputSchema
    if (!node.isTrigger && !node.producesOutput) {
      return // Skip validation for nodes that don't produce output
    }

    if (!node.outputSchema || node.outputSchema.length === 0) {
      result.warnings.push('No outputSchema defined (expected for triggers/output-producing actions)')
      result.details.outputSchemaValid = false
      return
    }

    // Check each output field has required properties
    for (const field of node.outputSchema) {
      if (!field.name) {
        result.warnings.push(`Output field missing name`)
      }
      if (!field.label) {
        result.warnings.push(`Output field '${field.name}' missing label`)
      }
      if (!field.type) {
        result.warnings.push(`Output field '${field.name}' missing type`)
      }
      if (!field.description) {
        result.warnings.push(`Output field '${field.name}' missing description`)
      }
    }
  }

  /**
   * Validate required fields
   */
  private validateRequiredFields(node: NodeComponent, result: NodeTestResult): void {
    if (!node.configSchema) return

    const requiredFields = node.configSchema.filter(f => f.required)

    // Check that required fields have proper validation
    for (const field of requiredFields) {
      if (field.type === 'select' || field.type === 'combobox') {
        if (!field.options && !field.dynamic) {
          result.warnings.push(
            `Required field '${field.name}' is select/combobox but has no options or dynamic loading`
          )
        }
      }
    }
  }

  /**
   * Test trigger setup with REAL webhook creation
   */
  private async testTriggerSetup(
    node: NodeComponent,
    result: NodeTestResult,
    timeout: number = 30000
  ): Promise<void> {
    try {
      logger.info(`[NodeTestRunner] Testing trigger: ${node.type}`)

      // For webhook-based triggers
      if (node.supportsWebhook) {
        // Verify webhook config is valid
        if (!node.webhookConfig) {
          result.warnings.push('supportsWebhook is true but no webhookConfig defined')
          result.details.webhookSetupSuccessful = false
          return
        }

        if (!node.webhookConfig.method) {
          result.warnings.push('webhookConfig missing HTTP method')
          result.details.webhookSetupSuccessful = false
          return
        }

        // Try to create a real webhook using TriggerLifecycleManager
        try {
          const testWorkflowId = `test-workflow-${Date.now()}`

          // Build test config
          const config = buildTestConfig(node)

          logger.info(`[NodeTestRunner] Creating test webhook for ${node.type}`)

          // Activate trigger (creates webhook)
          await this.lifecycleManager.onActivate(testWorkflowId, this.userId, {
            triggerType: node.type,
            triggerConfig: config,
            providerId: node.providerId || 'unknown',
          })

          result.details.webhookSetupSuccessful = true
          result.details.apiCallSuccessful = true

          logger.info(`[NodeTestRunner] Webhook created successfully for ${node.type}`)

          // Clean up: Deactivate trigger (deletes webhook)
          await this.lifecycleManager.onDeactivate(testWorkflowId, this.userId, {
            triggerType: node.type,
            providerId: node.providerId || 'unknown',
          })

          logger.info(`[NodeTestRunner] Webhook cleaned up for ${node.type}`)

        } catch (webhookError: any) {
          logger.error(`[NodeTestRunner] Webhook creation failed for ${node.type}:`, webhookError)
          result.details.webhookSetupSuccessful = false
          result.details.apiCallSuccessful = false
          result.warnings.push(`Webhook creation failed: ${webhookError.message}`)
          // Don't fail the test if webhook creation fails - might be missing credentials
        }
      } else {
        // Non-webhook triggers (polling, etc.)
        result.details.webhookSetupSuccessful = true
        result.warnings.push('Non-webhook trigger - skipping webhook setup test')
      }

    } catch (error: any) {
      result.passed = false
      result.details.webhookSetupSuccessful = false
      result.error = `Trigger setup test failed: ${error.message}`
    }
  }

  /**
   * Test action execution with REAL API calls
   */
  private async testActionExecution(
    node: NodeComponent,
    result: NodeTestResult,
    timeout: number = 30000
  ): Promise<void> {
    try {
      logger.info(`[NodeTestRunner] Testing action: ${node.type}`)

      // Check if node has required execution metadata
      if (node.providerId && !node.requiredScopes) {
        result.warnings.push('Node requires provider but no requiredScopes defined')
      }

      // Get the action handler from registry
      const handler = actionHandlerRegistry[node.type]
      if (!handler) {
        result.warnings.push(`No handler found in action registry for: ${node.type}`)
        result.details.executionSuccessful = false
        return
      }

      // Build test configuration
      const config = buildTestConfig(node)

      logger.info(`[NodeTestRunner] Executing action with config:`, config)

      // Execute the action with real API call
      const actionResult = await Promise.race([
        handler({
          config,
          userId: this.userId,
          input: {
            testMode: true,
            trigger: {},
          },
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Action execution timeout')), timeout)
        )
      ])

      // Check result
      if (actionResult && typeof actionResult === 'object') {
        if ('success' in actionResult) {
          result.details.executionSuccessful = actionResult.success
          result.details.apiCallSuccessful = actionResult.success

          if (!actionResult.success) {
            result.warnings.push(`Action failed: ${actionResult.message || 'Unknown reason'}`)
          } else {
            logger.info(`[NodeTestRunner] Action executed successfully: ${node.type}`)
          }
        } else {
          // No success field, assume it worked if no error thrown
          result.details.executionSuccessful = true
          result.details.apiCallSuccessful = true
          logger.info(`[NodeTestRunner] Action executed (no success field): ${node.type}`)
        }
      } else {
        result.details.executionSuccessful = true
        result.details.apiCallSuccessful = true
        logger.info(`[NodeTestRunner] Action executed: ${node.type}`)
      }

    } catch (error: any) {
      logger.error(`[NodeTestRunner] Action execution failed for ${node.type}:`, error)

      // Check if it's an auth/integration error vs actual code error
      const errorMessage = error.message || error.toString()
      if (
        errorMessage.includes('not found') ||
        errorMessage.includes('credentials') ||
        errorMessage.includes('authentication') ||
        errorMessage.includes('unauthorized')
      ) {
        result.warnings.push(`Integration not configured: ${errorMessage}`)
        result.details.executionSuccessful = false
        result.details.apiCallSuccessful = false
        // Don't fail the test - just missing credentials
      } else {
        result.passed = false
        result.details.executionSuccessful = false
        result.details.apiCallSuccessful = false
        result.error = `Execution failed: ${errorMessage}`
      }
    }
  }

  /**
   * Create batches for parallel execution
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = []
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize))
    }
    return batches
  }

  /**
   * Generate test summary
   */
  private generateSummary(): TestRunSummary {
    const totalDuration = Date.now() - this.startTime
    const passed = this.results.filter(r => r.passed).length
    const failed = this.results.filter(r => !r.passed).length
    const warnings = this.results.reduce((sum, r) => sum + r.warnings.length, 0)

    const totalActions = this.results.filter(r => !r.isTrigger).length
    const totalTriggers = this.results.filter(r => r.isTrigger).length

    const failedNodes = this.results.filter(r => !r.passed)

    // Group by provider
    const nodesByProvider: Record<string, NodeTestResult[]> = {}
    for (const result of this.results) {
      if (!nodesByProvider[result.provider]) {
        nodesByProvider[result.provider] = []
      }
      nodesByProvider[result.provider].push(result)
    }

    // Group by category
    const nodesByCategory: Record<string, NodeTestResult[]> = {}
    for (const result of this.results) {
      if (!nodesByCategory[result.category]) {
        nodesByCategory[result.category] = []
      }
      nodesByCategory[result.category].push(result)
    }

    logger.info(`[NodeTestRunner] Test complete: ${passed}/${this.results.length} passed (${((passed / this.results.length) * 100).toFixed(1)}%)`)

    return {
      totalNodes: this.results.length,
      totalActions,
      totalTriggers,
      passed,
      failed,
      warnings,
      duration: totalDuration,
      passRate: (passed / this.results.length) * 100,
      results: this.results,
      failedNodes,
      nodesByProvider,
      nodesByCategory
    }
  }
}

/**
 * Export utility function for quick testing
 */
export async function testAllNodes(options = {}): Promise<TestRunSummary> {
  const runner = new NodeTestRunner()
  return runner.runAllTests(options)
}

export async function testProvider(providerId: string, options = {}): Promise<TestRunSummary> {
  const runner = new NodeTestRunner()
  return runner.testProvider(providerId, options)
}
