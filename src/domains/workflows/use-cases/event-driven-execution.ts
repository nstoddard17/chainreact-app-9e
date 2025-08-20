import { EventHandler, eventBus } from '../../../shared/events/event-bus'
import { performanceMonitor } from '../../../shared/monitoring/performance-monitor'
import { 
  WorkflowEvent,
  WorkflowStartedEvent,
  WorkflowCompletedEvent,
  WorkflowFailedEvent,
  NodeExecutionStartedEvent,
  NodeExecutionCompletedEvent,
  NodeExecutionFailedEvent,
  IntegrationActionExecutedEvent
} from '../entities/workflow-event'
import { executeWorkflowUseCase } from './execute-workflow'
import { ActionContext } from './action-registry'

/**
 * Event-driven workflow execution orchestrator
 */
export class EventDrivenWorkflowExecutor {
  private subscriptionIds: string[] = []

  constructor() {
    this.setupEventHandlers()
  }

  private setupEventHandlers(): void {
    // Subscribe to workflow events
    this.subscriptionIds.push(
      eventBus.subscribe('workflow.started', new WorkflowStartedHandler()),
      eventBus.subscribe('node.execution.completed', new NodeCompletedHandler()),
      eventBus.subscribe('node.execution.failed', new NodeFailedHandler()),
      eventBus.subscribe('integration.action.executed', new IntegrationActionHandler())
    )
  }

  /**
   * Start a workflow execution with event publishing
   */
  async executeWorkflow(
    workflowId: string,
    userId: string,
    nodes: any[],
    input: any = {}
  ): Promise<any> {
    const startTime = Date.now()

    try {
      // Publish workflow started event
      await eventBus.publish(new WorkflowStartedEvent(workflowId, userId, input))

      // Execute workflow nodes
      let currentInput = input
      const results: any[] = []

      for (const node of nodes) {
        const nodeStartTime = Date.now()

        try {
          // Publish node execution started event
          await eventBus.publish(new NodeExecutionStartedEvent(
            workflowId,
            node.id,
            node.type,
            currentInput
          ))

          // Create execution context
          const context: ActionContext = {
            userId,
            workflowId,
            nodeId: node.id,
            input: currentInput,
            variables: {}
          }

          // Execute the node
          const result = await executeWorkflowUseCase.execute(node, context)
          const duration = Date.now() - nodeStartTime

          // Record performance metrics
          performanceMonitor.recordMetric(
            'execution_time',
            duration,
            'ms',
            { 
              nodeType: node.type, 
              providerId: node.data?.providerId,
              workflowId 
            }
          )

          performanceMonitor.recordMetric(
            'action_executed',
            1,
            'count',
            { 
              providerId: node.data?.providerId,
              actionType: node.data?.nodeType 
            }
          )

          // Publish node completed event
          await eventBus.publish(new NodeExecutionCompletedEvent(
            workflowId,
            node.id,
            result,
            duration
          ))

          // Publish integration action event if this was an integration action
          if (node.data?.providerId && node.data?.nodeType) {
            await eventBus.publish(new IntegrationActionExecutedEvent(
              workflowId,
              node.data.providerId,
              node.data.nodeType,
              result,
              node.id
            ))
          }

          results.push(result)
          currentInput = result // Pass result to next node

        } catch (error: any) {
          // Record error metrics
          performanceMonitor.recordError(
            error.constructor.name,
            error.message,
            node.data?.providerId,
            node.data?.nodeType,
            error.stack
          )

          // Publish node failed event
          await eventBus.publish(new NodeExecutionFailedEvent(
            workflowId,
            node.id,
            error.message
          ))

          throw error
        }
      }

      const totalDuration = Date.now() - startTime

      // Record workflow completion metrics
      performanceMonitor.recordMetric(
        'workflow_completed',
        1,
        'count',
        { workflowId, nodesExecuted: nodes.length.toString() }
      )

      performanceMonitor.recordMetric(
        'workflow_duration',
        totalDuration,
        'ms',
        { workflowId, nodesExecuted: nodes.length.toString() }
      )

      // Publish workflow completed event
      await eventBus.publish(new WorkflowCompletedEvent(
        workflowId,
        results,
        totalDuration
      ))

      return {
        success: true,
        results,
        duration: totalDuration,
        nodesExecuted: nodes.length
      }

    } catch (error: any) {
      // Publish workflow failed event
      await eventBus.publish(new WorkflowFailedEvent(
        workflowId,
        error.message
      ))

      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * Execute a single node asynchronously
   */
  async executeNodeAsync(
    workflowId: string,
    node: any,
    context: ActionContext
  ): Promise<void> {
    // This runs in the background and publishes events
    setTimeout(async () => {
      try {
        const startTime = Date.now()
        
        await eventBus.publish(new NodeExecutionStartedEvent(
          workflowId,
          node.id,
          node.type,
          context.input
        ))

        const result = await executeWorkflowUseCase.execute(node, context)
        const duration = Date.now() - startTime

        await eventBus.publish(new NodeExecutionCompletedEvent(
          workflowId,
          node.id,
          result,
          duration
        ))

        if (node.data?.providerId && node.data?.nodeType) {
          await eventBus.publish(new IntegrationActionExecutedEvent(
            workflowId,
            node.data.providerId,
            node.data.nodeType,
            result,
            node.id
          ))
        }

      } catch (error: any) {
        await eventBus.publish(new NodeExecutionFailedEvent(
          workflowId,
          node.id,
          error.message
        ))
      }
    }, 0)
  }

  /**
   * Get execution statistics
   */
  getExecutionStats(): {
    totalEvents: number
    recentWorkflows: number
    avgExecutionTime: number
    errorRate: number
  } {
    const events = eventBus.getEventHistory()
    const recentEvents = events.filter(e => 
      Date.now() - e.occurredOn.getTime() < 3600000 // Last hour
    )

    const workflowEvents = recentEvents.filter(e => 
      e.type.startsWith('workflow.')
    )

    const startedWorkflows = workflowEvents.filter(e => 
      e.type === 'workflow.started'
    ).length

    const completedWorkflows = workflowEvents.filter(e => 
      e.type === 'workflow.completed'
    )

    const failedWorkflows = workflowEvents.filter(e => 
      e.type === 'workflow.failed'
    ).length

    const avgExecutionTime = completedWorkflows.length > 0
      ? completedWorkflows.reduce((acc, e) => acc + (e.data.duration || 0), 0) / completedWorkflows.length
      : 0

    const errorRate = startedWorkflows > 0
      ? failedWorkflows / startedWorkflows
      : 0

    return {
      totalEvents: events.length,
      recentWorkflows: startedWorkflows,
      avgExecutionTime,
      errorRate
    }
  }

  /**
   * Cleanup subscriptions
   */
  destroy(): void {
    this.subscriptionIds.forEach(id => eventBus.unsubscribe(id))
    this.subscriptionIds = []
  }
}

// Event handlers
class WorkflowStartedHandler implements EventHandler<WorkflowStartedEvent> {
  async handle(event: WorkflowStartedEvent): Promise<void> {
    console.log(`🚀 Workflow ${event.aggregateId} started for user ${event.data.userId}`)
    
    // Here you could:
    // - Log to analytics
    // - Update workflow status in database
    // - Send notifications
    // - Trigger monitoring alerts
  }
}

class NodeCompletedHandler implements EventHandler<NodeExecutionCompletedEvent> {
  async handle(event: NodeExecutionCompletedEvent): Promise<void> {
    console.log(`✅ Node ${event.data.nodeId} completed in ${event.data.duration}ms`)
    
    // Here you could:
    // - Update progress tracking
    // - Cache intermediate results
    // - Trigger dependent workflows
  }
}

class NodeFailedHandler implements EventHandler<NodeExecutionFailedEvent> {
  async handle(event: NodeExecutionFailedEvent): Promise<void> {
    console.error(`❌ Node ${event.data.nodeId} failed: ${event.data.error}`)
    
    // Here you could:
    // - Trigger retry logic
    // - Send error notifications
    // - Log for debugging
    // - Escalate critical failures
  }
}

class IntegrationActionHandler implements EventHandler<IntegrationActionExecutedEvent> {
  async handle(event: IntegrationActionExecutedEvent): Promise<void> {
    console.log(`🔌 Integration action ${event.data.providerId}.${event.data.actionType} executed`)
    
    // Here you could:
    // - Track integration usage
    // - Monitor API quotas
    // - Cache integration responses
    // - Update integration health status
  }
}

// Singleton instance
export const eventDrivenExecutor = new EventDrivenWorkflowExecutor()