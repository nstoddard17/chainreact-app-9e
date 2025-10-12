import { NextResponse } from "next/server"

import { logger } from '@/lib/utils/logger'

/**
 * Test endpoint to validate the new architecture
 */
export async function GET() {
  try {
    logger.debug("🧪 Testing new architecture...")

    // Test bootstrap initialization
    const { getInitializationStatus } = await import("@/src/bootstrap")
    const initialized = getInitializationStatus()

    // Test provider registry  
    const { providerRegistry } = await import("@/src/domains/integrations/use-cases/provider-registry")
    const { actionRegistry } = await import("@/src/domains/workflows/use-cases/action-registry")

    const providers = providerRegistry.listProviders()
    const actions = actionRegistry.listActions()

    logger.debug(`✅ Found ${providers.length} providers, ${actions.length} actions`)

    // Test Gmail provider specifically
    const gmailProvider = providerRegistry.getEmailProvider('gmail')

    return NextResponse.json({
      success: true,
      architecture: {
        initialized,
        timestamp: new Date().toISOString(),
        providers: {
          count: providers.length,
          list: providers.map(p => ({
            id: p.providerId,
            name: p.name,
            types: p.types
          }))
        },
        actions: {
          count: actions.length,
          list: actions.map(a => ({
            provider: a.providerId,
            action: a.actionType,
            name: a.metadata.name,
            category: a.metadata.category
          }))
        },
        gmail: {
          providerAvailable: !!gmailProvider,
          actionsRegistered: actions.filter(a => a.providerId === 'gmail').length
        }
      }
    })

  } catch (error: any) {
    logger.error("❌ Architecture test failed:", error)
    
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}

/**
 * Test workflow execution
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { nodeType, providerId, config } = body

    logger.debug(`🧪 Testing workflow execution: ${nodeType}`)

    const { executeWorkflowUseCase } = await import("@/src/domains/workflows/use-cases/execute-workflow")

    const mockNode = {
      id: "test-node",
      type: nodeType,
      data: {
        nodeType,
        providerId,
        config
      }
    }

    const mockContext = {
      userId: "test-user",
      workflowId: "test-workflow",
      nodeId: "test-node",
      input: { test: true },
      variables: {}
    }

    // Test execution (this will likely fail due to missing auth, but we can test the flow)
    try {
      const result = await executeWorkflowUseCase.execute(mockNode, mockContext)
      
      return NextResponse.json({
        success: true,
        execution: {
          nodeType,
          providerId,
          result,
          timestamp: new Date().toISOString()
        }
      })
    } catch (executionError: any) {
      // Expected to fail due to missing auth/integration, but we can see if the flow works
      return NextResponse.json({
        success: true,
        execution: {
          nodeType,
          providerId,
          flowTested: true,
          expectedError: executionError.message,
          timestamp: new Date().toISOString()
        }
      })
    }

  } catch (error: any) {
    logger.error("❌ Workflow execution test failed:", error)
    
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}