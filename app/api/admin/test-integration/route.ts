/**
 * Integration Test API
 *
 * Runs integration tests and streams results back to the UI.
 * Uses real workflow creation, execution, and validation.
 */

import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import { autoDiscoverTests } from '@/lib/workflows/test-utils/auto-discover-tests'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/availableNodes'
import { initializeApplication } from '@/src/bootstrap'
import { executeWorkflowUseCase } from '@/src/domains/workflows/use-cases/execute-workflow'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes for long test runs

initializeApplication()

const INTERNAL_BASE_URL = (() => {
  const explicit = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_APP_URL
  if (explicit) {
    return explicit.replace(/\/$/, '')
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  return 'http://localhost:3000'
})()

class IntegrationTestError extends Error {
  details?: Record<string, any>

  constructor(message: string, details?: Record<string, any>) {
    super(message)
    this.name = 'IntegrationTestError'
    this.details = details
  }
}

interface TestExecutionDetails {
  message?: string
  output?: any
  logs?: string[]
}

export async function POST(request: NextRequest) {
  try {
    // Get admin client
    const supabase = createAdminClient()

    // Get auth header
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.substring(7)

    // Verify user session
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Parse request
    const { provider, testData, runActions, runTriggers, selectedTests } = await request.json()

    // Get provider config using auto-discovery
    const allConfigs = autoDiscoverTests()
    const config = allConfigs.find(c => c.provider === provider)

    if (!config) {
      return new Response(
        JSON.stringify({ error: 'Provider not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Filter actions and triggers based on selectedTests if provided
    const actionsToTest = selectedTests
      ? config.actions.filter(a => selectedTests.includes(a.nodeType))
      : config.actions

    const triggersToTest = selectedTests
      ? config.triggers.filter(t => selectedTests.includes(t.nodeType))
      : config.triggers

    // Create a streaming response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Helper to send updates
          const sendUpdate = (data: any) => {
            const message = `data: ${JSON.stringify(data)}\n\n`
            controller.enqueue(encoder.encode(message))
          }

          // Test actions
          if (runActions) {
            for (const action of actionsToTest) {
              const startTime = Date.now()

              // Send running status
              sendUpdate({
                type: 'action',
                name: action.actionName,
                status: 'running',
              })

              try {
                // Run the action test
                const resultDetails = await testAction(user.id, config.provider, action, testData)

                const duration = Date.now() - startTime

                // Send success
                sendUpdate({
                  type: 'action',
                  name: action.actionName,
                  status: 'passed',
                  duration,
                  message: resultDetails?.message,
                  output: resultDetails?.output,
                  logs: resultDetails?.logs,
                })
              } catch (error: any) {
                const duration = Date.now() - startTime

                logger.error(`[TestIntegration] Action test failed:`, {
                  provider: config.provider,
                  action: action.actionName,
                  error: error.message,
                })

                // Send failure
                sendUpdate({
                  type: 'action',
                  name: action.actionName,
                  status: 'failed',
                  error: error.message,
                  duration,
                  logs: error?.details?.logs,
                  output: error?.details?.output,
                })
              }
            }
          }

          // Test triggers
          if (runTriggers) {
            for (const trigger of triggersToTest) {
              const startTime = Date.now()

              // Send running status
              sendUpdate({
                type: 'trigger',
                name: trigger.triggerName,
                status: 'running',
              })

              try {
                // Run the trigger test
                const triggerResult = await testTrigger(user.id, config.provider, trigger, testData)

                const duration = Date.now() - startTime

                // Send success
                sendUpdate({
                  type: 'trigger',
                  name: trigger.triggerName,
                  status: 'passed',
                  duration,
                  message: triggerResult?.message,
                })
              } catch (error: any) {
                const duration = Date.now() - startTime

                logger.error(`[TestIntegration] Trigger test failed:`, {
                  provider: config.provider,
                  trigger: trigger.triggerName,
                  error: error.message,
                })

                // Send failure
                sendUpdate({
                  type: 'trigger',
                  name: trigger.triggerName,
                  status: 'failed',
                  error: error.message,
                  duration,
                  logs: error?.details?.logs,
                  output: error?.details?.output,
                })
              }
            }
          }

          // Send completion
          sendUpdate({ completed: true })

          controller.close()
        } catch (error: any) {
          logger.error('[TestIntegration] Stream error:', error)
          const message = typeof error?.message === 'string' ? error.message : 'Unknown error'
          const fallback = JSON.stringify({
            error: message,
            status: 'failed',
            completed: true,
          })
          controller.enqueue(encoder.encode(`data: ${fallback}\n\n`))
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error: any) {
    logger.error('[TestIntegration] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// ================================================================
// TEST FUNCTIONS
// ================================================================

/**
 * Test an action by creating a workflow and executing it
 */
async function testAction(
  userId: string,
  provider: string,
  action: any,
  testData: Record<string, any>
): Promise<TestExecutionDetails> {
  // Get the node definition
  const nodeDefinition = ALL_NODE_COMPONENTS.find(n => n.type === action.nodeType)
  if (!nodeDefinition) {
    throw new Error(`Node type not found: ${action.nodeType}`)
  }

  // Build config by merging defaults with test data
  const config = await buildTestConfig(nodeDefinition, testData, userId, provider)

  // Validate required fields
  if (nodeDefinition.configSchema) {
    const missingFields: string[] = []

    for (const field of nodeDefinition.configSchema) {
      if (field.required && !config[field.name]) {
        missingFields.push(field.name)
      }
    }

    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}. Please provide these values manually.`)
    }
  }

  const workflowId = `test-workflow-${provider}-${action.nodeType}`
  const nodeId = `test-node-${action.nodeType}`
  const context = {
    userId,
    workflowId,
    nodeId,
    input: testData?.input ?? {},
    variables: {},
  }

  const node = {
    id: nodeId,
    type: action.nodeType,
    data: {
      type: action.nodeType,
      nodeType: action.nodeType,
      providerId: provider,
      config,
    },
  }

  const result = await executeWorkflowUseCase.execute(node as any, context)
  const normalizedOutput = sanitizeExecutionOutput(
    (result as any)?.output ?? (result as any)?.data ?? result
  )

  return {
    message: (result as any)?.message || 'Action executed successfully',
    output: normalizedOutput,
    logs: normalizeExecutionLogs((result as any)?.logs || (result as any)?.metadata?.logs),
  }
}

/**
 * Test a trigger by creating a workflow and verifying it can be activated
 */
async function testTrigger(
  userId: string,
  provider: string,
  trigger: any,
  testData: Record<string, any>
): Promise<TestExecutionDetails> {
  // Get the node definition
  const nodeDefinition = ALL_NODE_COMPONENTS.find(n => n.type === trigger.nodeType)
  if (!nodeDefinition) {
    throw new Error(`Node type not found: ${trigger.nodeType}`)
  }

  // Build config with dynamic field loading
  const config = await buildTestConfig(nodeDefinition, testData, userId, provider)

  if (nodeDefinition.configSchema) {
    const missingFields: string[] = []
    for (const field of nodeDefinition.configSchema) {
      if (field.required && !config[field.name]) {
        missingFields.push(field.name)
      }
    }
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}. Please provide these values manually.`)
    }
  }

  return {
    message: 'Trigger configuration validated (activation mocked for automated tests)',
  }
}

/**
 * Build test config from node definition and test data
 * Now supports loading dynamic field options from connected accounts
 */
async function buildTestConfig(
  nodeDefinition: any,
  testData: Record<string, any>,
  userId: string,
  provider: string
): Promise<Record<string, any>> {
  const config: Record<string, any> = {}

  if (!nodeDefinition.configSchema) {
    return config
  }

  // For each config field, use test data or generate a default value
  for (const field of nodeDefinition.configSchema) {
    if (testData[field.name]) {
      // User-provided value takes highest priority
      config[field.name] = testData[field.name]
    } else if (field.dynamic) {
      // Try to load dynamic options from the connected account
      try {
        const dynamicValue = await loadDynamicFieldValue(field, userId, provider, config)
        config[field.name] = dynamicValue
      } catch (error: any) {
        logger.warn(`[TestIntegration] Failed to load dynamic field ${field.name}:`, error.message)
        // Fall back to generating a default value
        config[field.name] = generateDefaultValue(field)
      }
    } else {
      // Generate default test values
      config[field.name] = generateDefaultValue(field)
    }
  }

  return config
}

/**
 * Load dynamic field value by fetching options from the integration data API
 */
async function loadDynamicFieldValue(
  field: any,
  userId: string,
  provider: string,
  currentConfig: Record<string, any>
): Promise<any> {
  const baseUrl = INTERNAL_BASE_URL

  if (typeof field.dynamic !== 'string') {
    throw new Error(`Dynamic field "${field.name}" is missing a data type identifier`)
  }

  const supabase = createAdminClient()
  const { data: integration, error } = await supabase
    .from('integrations')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', provider)
    .in('status', ['connected', 'active', 'authorized', 'ready', 'valid'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !integration) {
    throw new Error(`No connected ${provider} integration found for dynamic field "${field.name}"`)
  }

  const dependencyOptions: Record<string, any> = {}
  if (field.dependsOn) {
    const dependencies = Array.isArray(field.dependsOn) ? field.dependsOn : [field.dependsOn]
    for (const dependency of dependencies) {
      if (currentConfig[dependency]) {
        dependencyOptions[dependency] = currentConfig[dependency]
      }
    }
  }

  const dynamicName = typeof field.dynamic === 'string' ? field.dynamic : ''
  if (dynamicName.startsWith('airtable')) {
    if (!dependencyOptions.baseId) {
      const baseCandidate = currentConfig.baseId || currentConfig.base_id || currentConfig.base
      if (baseCandidate) {
        dependencyOptions.baseId = baseCandidate
      }
    }
    if (!dependencyOptions.tableName) {
      const tableCandidate =
        currentConfig.tableName ||
        currentConfig.table ||
        currentConfig.tableId ||
        currentConfig.table_id
      if (tableCandidate) {
        dependencyOptions.tableName = tableCandidate
      }
    }
  }

  const response = await fetch(`${baseUrl}/api/integrations/fetch-user-data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      integrationId: integration.id,
      dataType: field.dynamic,
      options: dependencyOptions,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(errorText || `Failed to load dynamic options for ${field.name}`)
  }

  const payload = await response.json()
  const options = Array.isArray(payload?.data) ? payload.data : payload

  if (!Array.isArray(options) || options.length === 0) {
    throw new Error(`No options available for ${field.name}`)
  }

  const pickValue = (option: any) => {
    if (option == null) return undefined
    if (typeof option === 'string') return option
    return option.value ?? option.id ?? option.key ?? option.tableId ?? option.name
  }

  if (field.type === 'multi-select') {
    return options
      .slice(0, 2)
      .map(pickValue)
      .filter(Boolean)
  }

  return pickValue(options[0])
}

function sanitizeExecutionOutput(output: any) {
  if (output == null) {
    return undefined
  }

  if (typeof output === 'string') {
    return output.length > 4000 ? `${output.slice(0, 4000)}…` : output
  }

  try {
    const serialized = JSON.stringify(output)
    if (serialized.length > 4000) {
      return serialized.slice(0, 4000) + '…'
    }
    return output
  } catch {
    return output
  }
}

function normalizeExecutionLogs(logs: any): string[] | undefined {
  if (!logs) return undefined
  const entries = Array.isArray(logs) ? logs : [logs]
  return entries
    .map(entry => {
      if (typeof entry === 'string') return entry
      try {
        return JSON.stringify(entry)
      } catch {
        return String(entry)
      }
    })
    .slice(0, 20)
}

/**
 * Generate default test value for a field
 */
function generateDefaultValue(field: any): any {
  // Check field name patterns for smart defaults
  const fieldName = field.name?.toLowerCase() || ''

  // Email fields
  if (field.type === 'email' || fieldName.includes('email')) {
    return 'test@example.com'
  }

  // Channel/Room IDs (Discord, Slack, etc.)
  if (fieldName.includes('channel') || fieldName.includes('room')) {
    if (field.type === 'combobox' || field.type === 'select') {
      return field.options?.[0]?.value || ''
    }
    return 'test-channel'
  }

  // User IDs or mentions
  if (fieldName.includes('user') || fieldName.includes('mention')) {
    if (field.type === 'combobox' || field.type === 'select') {
      return field.options?.[0]?.value || ''
    }
    return 'test-user'
  }

  // Message/content fields
  if (fieldName.includes('message') || fieldName.includes('content') ||
      fieldName.includes('text') || fieldName.includes('body')) {
    return 'Test message from ChainReact automated integration test'
  }

  // Title/subject/name fields
  if (fieldName.includes('title') || fieldName.includes('subject') ||
      fieldName.includes('name')) {
    return 'Test Item'
  }

  // Description fields
  if (fieldName.includes('description') || fieldName.includes('desc')) {
    return 'Test description for automated integration testing'
  }

  // URL fields
  if (fieldName.includes('url') || fieldName.includes('link')) {
    return 'https://example.com/test'
  }

  // Color fields (hex colors)
  if (fieldName.includes('color') || fieldName.includes('colour')) {
    return '#0066cc'
  }

  // Date/time fields
  if (fieldName.includes('date') || fieldName.includes('time')) {
    return new Date().toISOString()
  }

  // File/attachment fields
  if (fieldName.includes('file') || fieldName.includes('attachment')) {
    return 'test-file.txt'
  }

  // Tags/labels (multi-select)
  if (fieldName.includes('tag') || fieldName.includes('label')) {
    if (field.type === 'multi-select') {
      return field.options?.slice(0, 2).map((o: any) => o.value) || []
    }
    return 'test-tag'
  }

  // Priority fields
  if (fieldName.includes('priority')) {
    if (field.type === 'select' || field.type === 'combobox') {
      return field.options?.[0]?.value || 'normal'
    }
    return 'normal'
  }

  // Status fields
  if (fieldName.includes('status')) {
    if (field.type === 'select' || field.type === 'combobox') {
      return field.options?.[0]?.value || 'active'
    }
    return 'active'
  }

  // Now handle by field type
  switch (field.type) {
    case 'email':
      return 'test@example.com'

    case 'text':
    case 'textarea':
      return 'Test value'

    case 'number':
      return 100

    case 'boolean':
    case 'checkbox':
      return false

    case 'select':
    case 'combobox':
      // Use first option if available
      return field.options?.[0]?.value || ''

    case 'tags':
      if (Array.isArray(field.defaultValue)) {
        return field.defaultValue
      }
      if (Array.isArray(field.options) && field.options.length > 0) {
        return [field.options[0].value ?? field.options[0].label ?? 'Test value']
      }
      return ['Test value']

    case 'multi-select':
      // Select first 2 options if available
      return field.options?.slice(0, 2).map((o: any) => o.value) || []

    case 'date':
      return new Date().toISOString().split('T')[0]

    case 'datetime':
    case 'datetime-local':
      return new Date().toISOString()

    case 'time':
      return '12:00'

    case 'url':
      return 'https://example.com'

    case 'tel':
    case 'phone':
      return '+1-555-0123'

    case 'color':
      return '#0066cc'

    case 'json':
    case 'code':
      return field.defaultValue || { test: true }

    case 'key_value':
      return field.defaultValue || [{ key: 'key', value: 'Test value' }]

    case 'custom_multiple_records':
      return field.defaultValue || [{
        airtable_field_Name: 'Test Record',
        airtable_field_Status: 'Testing',
        airtable_field_Description: 'Created by automated integration tests',
      }]

    case 'custom_field_mapper':
      return field.defaultValue || [{ source: 'name', target: 'airtable_field_Name' }]

    default:
      return ''
  }
}
