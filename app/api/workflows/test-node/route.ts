import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { executeAction } from "@/lib/workflows/executeNode"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/nodes"

import { logger } from '@/lib/utils/logger'

export async function POST(request: Request) {
  try {
    const { nodeType, config, testData } = await request.json()

    if (!nodeType) {
      return errorResponse("Node type is required" , 400)
    }

    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Authentication required" , 401)
    }

    // Find the node component definition
    const nodeComponent = ALL_NODE_COMPONENTS.find(c => c.type === nodeType)
    if (!nodeComponent) {
      return errorResponse("Unknown node type" , 400)
    }

    // Only allow testing action nodes, not triggers
    if (nodeComponent.isTrigger) {
      return errorResponse("Cannot test trigger nodes directly. Trigger nodes activate when their event occurs." , 400)
    }

    // Create a test node object
    const testNode = {
      id: "test-node",
      data: {
        type: nodeType,
        config: config || {}
      }
    }

    // Create test context with sample data
    const testContext = {
      data: testData || {
        // Default sample data for testing
        name: "John Doe",
        email: "john@example.com", 
        status: "active",
        amount: 100,
        date: "2024-01-15",
        items: ["item1", "item2", "item3"],
        user: {
          id: "123",
          name: "John Doe",
          email: "john@example.com"
        }
      },
      userId: user.id,
      workflowId: "test-workflow",
      testMode: true
    }

    let testResult: any

    try {
      // Execute all nodes using the real executeAction function
      logger.debug('[test-node] Executing real action:', {
        nodeType,
        hasConfig: !!config,
        configKeys: Object.keys(config || {})
      })

      testResult = await executeAction({
        node: testNode,
        input: testContext.data,
        userId: user.id,
        workflowId: "test-workflow",
        executionMode: 'live' // Execute real API calls
      })

      // Add success indicator to message if not already present
      if (testResult.success && testResult.message) {
        if (!testResult.message.includes('✅')) {
          testResult.message = `✅ ${testResult.message}`
        }
      } else if (testResult.success) {
        testResult.message = `✅ ${nodeComponent.title} executed successfully`
      }

      logger.debug('[test-node] Execution completed:', {
        success: testResult.success,
        hasOutput: !!testResult.output,
        outputKeys: testResult.output ? Object.keys(testResult.output) : []
      })
    } catch (error: any) {
      logger.error('[test-node] Execution failed:', {
        error: error.message,
        stack: error.stack,
        nodeType
      })

      // Return the actual error to the user
      testResult = {
        success: false,
        output: {
          error: true,
          errorMessage: error.message,
          errorDetails: error.stack,
          nodeType: nodeType,
          timestamp: new Date().toISOString()
        },
        message: `❌ Error: ${error.message}`,
        error: error.message
      }
    }

    return jsonResponse({
      success: testResult.success !== false, // Return actual success/failure
      testResult,
      nodeInfo: {
        type: nodeType,
        title: nodeComponent.title,
        description: nodeComponent.description,
        outputSchema: nodeComponent.outputSchema
      }
    })

  } catch (error: any) {
    logger.error("Node test error:", error)
    return errorResponse(error.message || "Failed to test node" , 500)
  }
} 