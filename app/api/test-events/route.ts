import { NextResponse } from "next/server"

/**
 * Test endpoint for event-driven workflow execution
 */
export async function GET() {
  try {
    console.log("🧪 Testing event-driven workflow execution...")

    // Import event system
    const { eventDrivenExecutor } = await import("@/src/domains/workflows/use-cases/event-driven-execution")
    const { eventBus } = await import("@/src/shared/events/event-bus")

    // Test simple workflow with multiple nodes
    const workflowId = `test_workflow_${Date.now()}`
    const userId = 'test-user'
    
    const nodes = [
      {
        id: 'node-1',
        type: 'gmail_action_send_email',
        data: {
          nodeType: 'gmail_action_send_email',
          providerId: 'gmail',
          config: {
            to: 'test@example.com',
            subject: 'Test from event-driven workflow',
            body: 'This email was sent through event-driven execution!'
          }
        }
      },
      {
        id: 'node-2', 
        type: 'discord_action_send_message',
        data: {
          nodeType: 'discord_action_send_message',
          providerId: 'discord',
          config: {
            guildId: '123456',
            channelId: '789012',
            message: 'Workflow completed successfully!'
          }
        }
      }
    ]

    // Execute the workflow
    const result = await eventDrivenExecutor.executeWorkflow(
      workflowId,
      userId,
      nodes,
      { trigger: 'api_test' }
    )

    // Get execution statistics
    const stats = eventDrivenExecutor.getExecutionStats()

    // Get recent events
    const recentEvents = eventBus.getEventHistory(undefined, 10)

    // Get subscription info
    const subscriptions = eventBus.getSubscriptions()

    return NextResponse.json({
      success: true,
      eventDriven: {
        workflowResult: result,
        statistics: stats,
        recentEvents: recentEvents.map(event => ({
          id: event.id,
          type: event.type,
          aggregateId: event.aggregateId,
          occurredOn: event.occurredOn,
          data: event.data
        })),
        subscriptions,
        eventBusStatus: {
          totalSubscriptions: eventBus.getSubscriptionCount(),
          historySize: eventBus.getEventHistory().length
        }
      }
    })

  } catch (error: any) {
    console.error("❌ Event-driven test failed:", error)
    
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}

/**
 * Test async node execution
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { nodeType, providerId, config } = body

    console.log(`🧪 Testing async node execution: ${nodeType}`)

    const { eventDrivenExecutor } = await import("@/src/domains/workflows/use-cases/event-driven-execution")
    const { eventBus } = await import("@/src/shared/events/event-bus")

    const workflowId = `async_test_${Date.now()}`
    const node = {
      id: 'async-node-1',
      type: nodeType,
      data: {
        nodeType,
        providerId,
        config
      }
    }

    const context = {
      userId: 'test-user',
      workflowId,
      nodeId: node.id,
      input: { test: true },
      variables: {}
    }

    // Execute node asynchronously
    await eventDrivenExecutor.executeNodeAsync(workflowId, node, context)

    // Return immediately (execution continues in background)
    return NextResponse.json({
      success: true,
      async: {
        workflowId,
        nodeId: node.id,
        message: 'Node execution started asynchronously',
        timestamp: new Date().toISOString()
      }
    })

  } catch (error: any) {
    console.error("❌ Async execution test failed:", error)
    
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}