import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { executeAction } from '@/lib/workflows/executeNode'
import { logger } from '@/lib/utils/logger'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const supabase = await createSupabaseRouteHandlerClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      logger.error('[Test Action] Unauthorized access attempt')
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { nodeType, config, testData = {}, integrationId } = body

    logger.debug('[Test Action] Starting test', {
      nodeType,
      integrationId,
      configKeys: Object.keys(config || {})
    })

    // Validate nodeType
    const nodeDefinition = ALL_NODE_COMPONENTS.find(n => n.type === nodeType)
    if (!nodeDefinition) {
      logger.error('[Test Action] Invalid node type', { nodeType })
      return NextResponse.json(
        { success: false, error: `Invalid node type: ${nodeType}` },
        { status: 400 }
      )
    }

    // Verify integration exists and user has access
    if (integrationId) {
      logger.debug('[Test Action] Fetching integration', {
        integrationId,
        userId: user.id
      })

      const { data: integration, error: integrationError } = await supabase
        .from('integrations')
        .select('id, provider, status, user_id')
        .eq('id', integrationId)
        .eq('user_id', user.id)
        .single()

      if (integrationError || !integration) {
        logger.error('[Test Action] Integration not found or unauthorized', {
          integrationId,
          userId: user.id,
          error: integrationError?.message,
          errorDetails: integrationError
        })
        return NextResponse.json(
          { success: false, error: 'Integration not found or unauthorized' },
          { status: 404 }
        )
      }

      logger.debug('[Test Action] Integration found', {
        integrationId: integration.id,
        provider: integration.provider,
        status: integration.status
      })

      if (integration.status !== 'connected') {
        logger.error('[Test Action] Integration not connected', {
          integrationId,
          status: integration.status
        })
        return NextResponse.json(
          { success: false, error: 'Integration is not connected' },
          { status: 400 }
        )
      }
    }

    // Create a mock node for execution
    const mockNode = {
      id: 'test-node',
      type: nodeType,
      data: {
        ...nodeDefinition,
        config: {
          ...config,
          integrationId
        }
      },
      position: { x: 0, y: 0 }
    }

    // Prepare execution context
    const executionContext = {
      nodes: {},
      outputs: testData,
      variables: {}
    }

    logger.debug('[Test Action] Executing action', {
      nodeType,
      executionContext: {
        outputKeys: Object.keys(testData)
      }
    })

    // Execute the action
    const executionStartTime = Date.now()
    let requestDetails: any = null
    let responseDetails: any = null

    try {
      const result = await executeAction({
        node: mockNode,
        input: {
          ...testData,
          integrationId // Pass integrationId in input for registry wrapper
        },
        userId: user.id,
        workflowId: 'test-workflow',
        testMode: true,
        executionMode: 'live'
      })

      const executionTime = Date.now() - executionStartTime

      logger.debug('[Test Action] Execution completed', {
        success: result.success,
        executionTime,
        outputKeys: result.output ? Object.keys(result.output) : []
      })

      // Capture request/response details for display
      // Note: The actual HTTP request details are handled within action handlers
      // We'll return what we can reconstruct
      requestDetails = {
        method: 'POST',
        endpoint: `/api/integrations/${nodeDefinition.providerId}/*`,
        config: config,
        integrationId: integrationId
      }

      responseDetails = {
        statusCode: result.success ? 200 : 500,
        data: result.output,
        executionTime,
        timestamp: new Date().toISOString()
      }

      const totalTime = Date.now() - startTime

      return NextResponse.json({
        success: true,
        testResult: {
          success: result.success,
          output: result.output,
          message: result.message || (result.success ? 'Action executed successfully' : 'Action failed'),
          error: result.error,
          executionTime: totalTime,
          timestamp: new Date().toISOString()
        },
        requestDetails,
        responseDetails,
        nodeInfo: {
          type: nodeDefinition.type,
          title: nodeDefinition.title,
          description: nodeDefinition.description,
          provider: nodeDefinition.providerId,
          outputSchema: nodeDefinition.outputSchema || []
        }
      })

    } catch (executionError: any) {
      const executionTime = Date.now() - executionStartTime

      logger.error('[Test Action] Execution error', {
        error: executionError.message,
        stack: executionError.stack,
        executionTime
      })

      return NextResponse.json({
        success: false,
        testResult: {
          success: false,
          error: executionError.message,
          executionTime,
          timestamp: new Date().toISOString()
        },
        requestDetails: {
          method: 'POST',
          endpoint: `/api/integrations/${nodeDefinition.providerId}/*`,
          config: config,
          integrationId: integrationId
        },
        responseDetails: {
          statusCode: 500,
          error: executionError.message,
          data: executionError.details ? { errorDetails: executionError.details } : undefined,
          executionTime,
          timestamp: new Date().toISOString()
        },
        nodeInfo: {
          type: nodeDefinition.type,
          title: nodeDefinition.title,
          description: nodeDefinition.description,
          provider: nodeDefinition.providerId,
          outputSchema: nodeDefinition.outputSchema || []
        }
      }, { status: 200 }) // Still return 200 to show the error in UI

    }

  } catch (error: any) {
    const totalTime = Date.now() - startTime

    logger.error('[Test Action] Request error', {
      error: error.message,
      stack: error.stack,
      totalTime
    })

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
        executionTime: totalTime
      },
      { status: 500 }
    )
  }
}
