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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes for long test runs

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
              // Send running status
              sendUpdate({
                type: 'action',
                name: action.actionName,
                status: 'running',
              })

              try {
                const startTime = Date.now()

                // Run the action test
                await testAction(user.id, config.provider, action, testData)

                const duration = Date.now() - startTime

                // Send success
                sendUpdate({
                  type: 'action',
                  name: action.actionName,
                  status: 'passed',
                  duration,
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
                })
              }
            }
          }

          // Test triggers
          if (runTriggers) {
            for (const trigger of triggersToTest) {
              // Send running status
              sendUpdate({
                type: 'trigger',
                name: trigger.triggerName,
                status: 'running',
              })

              try {
                const startTime = Date.now()

                // Run the trigger test
                await testTrigger(user.id, config.provider, trigger, testData)

                const duration = Date.now() - startTime

                // Send success
                sendUpdate({
                  type: 'trigger',
                  name: trigger.triggerName,
                  status: 'passed',
                  duration,
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
): Promise<void> {
  const supabase = createAdminClient()

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

  // Create test workflow
  const { data: workflow, error: createError } = await supabase
    .from('workflows')
    .insert({
      user_id: userId,
      name: `[AUTO-TEST] ${provider} - ${action.actionName}`,
      description: 'Automated integration test workflow',
      nodes: [
        {
          id: 'trigger-1',
          type: 'custom',
          position: { x: 100, y: 100 },
          data: {
            type: 'manual_trigger',
            title: 'Manual Trigger',
            config: {},
          },
        },
        {
          id: 'action-1',
          type: 'custom',
          position: { x: 400, y: 100 },
          data: {
            type: action.nodeType,
            title: action.actionName,
            providerId: provider,
            config,
          },
        },
      ],
      connections: [
        {
          id: 'edge-1',
          source: 'trigger-1',
          target: 'action-1',
          sourceHandle: 'success',
          targetHandle: 'input',
        },
      ],
      is_active: false,
    })
    .select()
    .single()

  if (createError || !workflow) {
    throw new Error(`Failed to create test workflow: ${createError?.message}`)
  }

  try {
    // Execute the workflow
    const execution = await executeWorkflow(workflow.id, userId)

    // Check execution status
    if (execution.status === 'failed' || execution.status === 'error') {
      throw new Error(execution.error || 'Workflow execution failed')
    }

    // Verify the action executed
    const actionExecution = execution.node_executions?.find(
      (ne: any) => ne.node_id === 'action-1'
    )

    if (!actionExecution) {
      throw new Error('Action did not execute')
    }

    if (actionExecution.status === 'failed' || actionExecution.status === 'error') {
      throw new Error(actionExecution.error || 'Action execution failed')
    }

    // Success!
  } finally {
    // Cleanup: Delete test workflow
    await supabase
      .from('workflows')
      .delete()
      .eq('id', workflow.id)
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
): Promise<void> {
  const supabase = createAdminClient()

  // Get the node definition
  const nodeDefinition = ALL_NODE_COMPONENTS.find(n => n.type === trigger.nodeType)
  if (!nodeDefinition) {
    throw new Error(`Node type not found: ${trigger.nodeType}`)
  }

  // Build config with dynamic field loading
  const config = await buildTestConfig(nodeDefinition, testData, userId, provider)

  // Create test workflow
  const { data: workflow, error: createError } = await supabase
    .from('workflows')
    .insert({
      user_id: userId,
      name: `[AUTO-TEST] ${provider} - ${trigger.triggerName}`,
      description: 'Automated integration test workflow',
      nodes: [
        {
          id: 'trigger-1',
          type: 'custom',
          position: { x: 100, y: 100 },
          data: {
            type: trigger.nodeType,
            title: trigger.triggerName,
            providerId: provider,
            config,
          },
        },
        {
          id: 'action-1',
          type: 'custom',
          position: { x: 400, y: 100 },
          data: {
            type: 'log_message',
            title: 'Log Message',
            providerId: 'misc',
            config: {
              message: 'Trigger test completed',
            },
          },
        },
      ],
      connections: [
        {
          id: 'edge-1',
          source: 'trigger-1',
          target: 'action-1',
          sourceHandle: 'success',
          targetHandle: 'input',
        },
      ],
      is_active: false,
    })
    .select()
    .single()

  if (createError || !workflow) {
    throw new Error(`Failed to create test workflow: ${createError?.message}`)
  }

  try {
    // Activate the workflow (this creates webhook subscriptions)
    const { error: activateError } = await supabase
      .from('workflows')
      .update({ is_active: true })
      .eq('id', workflow.id)

    if (activateError) {
      throw new Error(`Failed to activate workflow: ${activateError.message}`)
    }

    // Wait for webhook setup
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Verify webhook was created
    // For now, just verify the workflow was created and activated successfully
    // In a real implementation, you would also verify webhook resources in trigger_resources table

    // Success if we got here without errors
  } finally {
    // Cleanup: Deactivate and delete test workflow
    await supabase
      .from('workflows')
      .update({ is_active: false })
      .eq('id', workflow.id)

    await supabase
      .from('workflows')
      .delete()
      .eq('id', workflow.id)
  }
}

/**
 * Execute a workflow
 */
async function executeWorkflow(workflowId: string, userId: string): Promise<any> {
  const baseUrl = INTERNAL_BASE_URL

  const response = await fetch(`${baseUrl}/api/workflows/${workflowId}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      trigger_data: {},
      user_id: userId,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to execute workflow: ${error}`)
  }

  const { execution_id } = await response.json()

  // Wait for execution to complete
  return waitForExecution(execution_id)
}

/**
 * Wait for workflow execution to complete
 */
async function waitForExecution(executionId: string, maxWaitTime = 30000): Promise<any> {
  const supabase = createAdminClient()
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitTime) {
    const { data: execution } = await supabase
      .from('executions')
      .select('*')
      .eq('id', executionId)
      .single()

    if (execution && ['completed', 'failed', 'error'].includes(execution.status)) {
      return execution
    }

    // Wait 500ms before checking again
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  throw new Error('Execution timed out')
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
        const dynamicValue = await loadDynamicFieldValue(field, userId, provider)
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
  provider: string
): Promise<any> {
  const baseUrl = INTERNAL_BASE_URL

  // Call the integration data API to load options
  const response = await fetch(`${baseUrl}/api/integrations/${provider}/data?type=${field.dynamic}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId, // Pass user ID for authentication
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to load dynamic options for ${field.name}`)
  }

  const options = await response.json()

  if (!options || options.length === 0) {
    throw new Error(`No options available for ${field.name}`)
  }

  // Return the first available option
  if (field.type === 'multi-select') {
    // For multi-select, return first 2 options
    return options.slice(0, 2).map((opt: any) => opt.value)
  } else {
    // For single select, return first option
    return options[0].value
  }
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

    default:
      return ''
  }
}
