/**
 * API Route: /api/testing/batch-test
 *
 * Runs multiple action node tests sequentially using the authenticated user's
 * real integrations. Each test auto-fills config from test fixtures and
 * executes via the real action handler.
 */

import { NextRequest } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { executeAction } from '@/lib/workflows/executeNode'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import { buildTestConfig } from '@/lib/workflows/testing/testData'
import { logger } from '@/lib/utils/logger'

export interface BatchTestResult {
  nodeType: string
  nodeTitle: string
  providerId: string
  success: boolean
  duration: number
  message: string
  error?: string
  errorStack?: string
  output?: any
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse('Authentication required', 401)
    }

    const body = await request.json()
    const { nodeTypes } = body as { nodeTypes: string[] }

    if (!nodeTypes || !Array.isArray(nodeTypes) || nodeTypes.length === 0) {
      return errorResponse('nodeTypes array is required', 400)
    }

    // Cap at 50 tests per batch to prevent abuse
    const testTypes = nodeTypes.slice(0, 50)

    // Get user's connected integrations to inject integration IDs
    const { data: integrations } = await supabase
      .from('integrations')
      .select('id, provider, status')
      .eq('user_id', user.id)
      .eq('status', 'connected')

    const integrationMap = new Map<string, string>()
    if (integrations) {
      for (const int of integrations) {
        integrationMap.set(int.provider, int.id)
      }
    }

    const results: BatchTestResult[] = []

    for (const nodeType of testTypes) {
      const nodeComponent = ALL_NODE_COMPONENTS.find(c => c.type === nodeType)
      if (!nodeComponent) {
        results.push({
          nodeType,
          nodeTitle: nodeType,
          providerId: 'unknown',
          success: false,
          duration: 0,
          message: `Unknown node type: ${nodeType}`,
          error: `Node type "${nodeType}" not found in registry`,
        })
        continue
      }

      if (nodeComponent.isTrigger) {
        results.push({
          nodeType,
          nodeTitle: nodeComponent.title,
          providerId: nodeComponent.providerId || 'unknown',
          success: false,
          duration: 0,
          message: 'Trigger nodes cannot be tested directly',
          error: 'Triggers activate on external events — use the trigger tester instead',
        })
        continue
      }

      // Build test config with auto-generated data
      const testConfig = buildTestConfig({
        type: nodeComponent.type,
        providerId: nodeComponent.providerId || '',
        configSchema: nodeComponent.configSchema,
      })

      // Inject the user's real integration ID for this provider
      const providerId = nodeComponent.providerId || ''
      const integrationId = integrationMap.get(providerId)
      if (integrationId) {
        // Set common integration reference fields
        testConfig.workspace = testConfig.workspace || integrationId
        testConfig.integrationId = testConfig.integrationId || integrationId
        testConfig.account = testConfig.account || integrationId
        testConfig.connection = testConfig.connection || integrationId
      }

      const startTime = Date.now()

      try {
        const testNode = {
          id: 'batch-test-node',
          data: { type: nodeType, config: testConfig }
        }

        const testResult = await Promise.race([
          executeAction({
            node: testNode,
            input: {},
            userId: user.id,
            workflowId: 'batch-test',
            executionMode: 'live'
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Test timed out after 30s')), 30000)
          )
        ])

        const duration = Date.now() - startTime

        results.push({
          nodeType,
          nodeTitle: nodeComponent.title,
          providerId: nodeComponent.providerId || 'unknown',
          success: testResult.success !== false,
          duration,
          message: testResult.message || (testResult.success ? 'Passed' : 'Failed'),
          output: testResult.output,
          error: testResult.success === false ? (testResult.error || testResult.message) : undefined,
        })

      } catch (error: any) {
        const duration = Date.now() - startTime

        results.push({
          nodeType,
          nodeTitle: nodeComponent.title,
          providerId: nodeComponent.providerId || 'unknown',
          success: false,
          duration,
          message: `Error: ${error.message}`,
          error: error.message,
          errorStack: error.stack,
        })
      }
    }

    const passed = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    return jsonResponse({
      success: true,
      summary: {
        total: results.length,
        passed,
        failed,
        passRate: results.length > 0 ? Math.round((passed / results.length) * 100) : 0,
      },
      results,
    })

  } catch (error: any) {
    logger.error('[batch-test] Error:', error)
    return errorResponse(error.message || 'Failed to run batch tests', 500)
  }
}
