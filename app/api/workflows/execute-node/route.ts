import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { NodeExecutionService } from '@/lib/services/nodeExecutionService'
import { executeAction } from '@/lib/workflows/executeNode'

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unauthorized' , 401)
    }

    const body = await request.json()
    const { workflowId, nodeId, nodeData, inputData, testMode = true, executionMode = 'step' } = body

    // Validate request
    if (!workflowId || !nodeId || !nodeData) {
      return errorResponse('Missing required fields' , 400)
    }

    // Create a mock execution context for single node execution
    const executionContext = {
      userId: user.id,
      workflowId,
      testMode,
      data: inputData || {},
      variables: {},
      results: {},
      dataFlowManager: {
        resolveVariable: (path: string) => {
          // Simple variable resolution for test mode
          const parts = path.split('.')
          let current = inputData
          for (const part of parts) {
            current = current?.[part]
          }
          return current
        }
      },
      interceptedActions: []
    }

    // Create the node object
    const node = {
      id: nodeId,
      type: 'custom',
      position: { x: 0, y: 0 },
      data: nodeData
    }

    // Execute the single node
    const nodeExecutionService = new NodeExecutionService()
    
    // For step mode, we'll execute just this node without following connections
    if (executionMode === 'step' && testMode) {
      // Simulate node execution for test mode
      const simulatedResult = {
        nodeId,
        type: nodeData.type,
        input: inputData,
        output: {
          success: true,
          data: {
            ...inputData,
            processedBy: nodeData.title || nodeData.type,
            timestamp: new Date().toISOString()
          }
        },
        intercepted: testMode ? {
          type: nodeData.type,
          config: nodeData.config,
          wouldHaveSent: {
            action: nodeData.type,
            data: inputData
          }
        } : null
      }

      // Simulate a small delay to show the running state
      await new Promise(resolve => setTimeout(resolve, 500))

      return jsonResponse({
        success: true,
        nodeId,
        output: simulatedResult.output.data,
        intercepted: simulatedResult.intercepted
      })
    }

    // For real execution
    try {
      const result = await executeAction({
        node,
        input: inputData || {},
        userId: user.id,
        workflowId,
        testMode,
        executionMode
      })

      return jsonResponse({
        success: result.success,
        nodeId,
        output: result.output || result.data,
        message: result.message,
        error: result.error
      })
    } catch (execError: any) {
      logger.error('Node execution error:', execError)
      return jsonResponse({
        success: false,
        nodeId,
        error: execError.message || 'Failed to execute node'
      }, { status: 500 })
    }

  } catch (error: any) {
    logger.error('Error executing node:', error)
    return errorResponse(error.message || 'Failed to execute node' , 500)
  }
}