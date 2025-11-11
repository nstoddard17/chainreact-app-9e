/**
 * Action Tester
 *
 * Tests action nodes by creating a test workflow, executing it,
 * and verifying the API request was made correctly.
 */

import type { ActionTest } from './test-config'

export async function testAction(provider: string, action: ActionTest): Promise<void> {
  // Create a test workflow with the action node
  const workflow = await createTestWorkflow(provider, action)

  try {
    // Execute the workflow
    const execution = await executeWorkflow(workflow.id, action.config)

    // Verify the action executed correctly
    await verifyActionExecution(execution, action)

    // Cleanup
    await deleteWorkflow(workflow.id)
  } catch (error) {
    // Cleanup even on error
    await deleteWorkflow(workflow.id).catch(() => {})
    throw error
  }
}

// ================================================================
// HELPER FUNCTIONS
// ================================================================

/**
 * Create a test workflow with the action node
 */
async function createTestWorkflow(provider: string, action: ActionTest) {
  const response = await fetch('http://localhost:3000/api/workflows', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.TEST_USER_TOKEN}`,
    },
    body: JSON.stringify({
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
            config: action.config,
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
      is_active: true,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to create test workflow: ${error}`)
  }

  return response.json()
}

/**
 * Execute the workflow
 */
async function executeWorkflow(workflowId: string, config: Record<string, any>) {
  const response = await fetch(`http://localhost:3000/api/workflows/${workflowId}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.TEST_USER_TOKEN}`,
    },
    body: JSON.stringify({
      trigger_data: {}, // Manual trigger has no data
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
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitTime) {
    const response = await fetch(`http://localhost:3000/api/executions/${executionId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.TEST_USER_TOKEN}`,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch execution status')
    }

    const execution = await response.json()

    if (execution.status === 'completed' || execution.status === 'failed' || execution.status === 'error') {
      return execution
    }

    // Wait 500ms before checking again
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  throw new Error('Execution timed out')
}

/**
 * Verify the action executed correctly
 */
async function verifyActionExecution(execution: any, action: ActionTest): Promise<void> {
  // Check execution completed successfully
  if (execution.status !== 'completed') {
    throw new Error(`Execution failed with status: ${execution.status}. Error: ${execution.error || 'Unknown'}`)
  }

  // Check all required fields were present in the config
  const nodeExecution = execution.node_executions?.find((ne: any) => ne.node_type === action.nodeType)
  if (!nodeExecution) {
    throw new Error(`No execution found for node type: ${action.nodeType}`)
  }

  // Verify required fields
  for (const field of action.requiredFields) {
    if (!(field in action.config)) {
      throw new Error(`Required field missing: ${field}`)
    }
  }

  // If API endpoint is specified, verify the request was made
  if (action.expectedApiEndpoint) {
    // Check the node execution logs for API call
    const logs = nodeExecution.logs || []
    const apiCallLog = logs.find((log: string) => log.includes(action.expectedApiEndpoint!))

    if (!apiCallLog) {
      throw new Error(`Expected API call to ${action.expectedApiEndpoint} not found in logs`)
    }

    // Verify HTTP method if specified
    if (action.expectedMethod) {
      const methodLog = logs.find((log: string) => log.includes(action.expectedMethod!))
      if (!methodLog) {
        throw new Error(`Expected HTTP method ${action.expectedMethod} not found in logs`)
      }
    }
  }

  // Check for errors in node execution
  if (nodeExecution.error) {
    throw new Error(`Node execution failed: ${nodeExecution.error}`)
  }
}

/**
 * Delete the test workflow
 */
async function deleteWorkflow(workflowId: string): Promise<void> {
  await fetch(`http://localhost:3000/api/workflows/${workflowId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${process.env.TEST_USER_TOKEN}`,
    },
  })
}
