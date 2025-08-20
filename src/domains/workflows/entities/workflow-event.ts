/**
 * Domain events for workflow execution
 */

export interface DomainEvent {
  readonly id: string
  readonly type: string
  readonly occurredOn: Date
  readonly aggregateId: string
  readonly version: number
  readonly data: Record<string, any>
}

export class WorkflowEvent implements DomainEvent {
  readonly id: string
  readonly type: string
  readonly occurredOn: Date
  readonly aggregateId: string
  readonly version: number
  readonly data: Record<string, any>

  constructor(
    type: string,
    aggregateId: string,
    data: Record<string, any>,
    version: number = 1
  ) {
    this.id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    this.type = type
    this.aggregateId = aggregateId
    this.data = data
    this.version = version
    this.occurredOn = new Date()
  }
}

// Specific workflow events
export class WorkflowStartedEvent extends WorkflowEvent {
  constructor(workflowId: string, userId: string, input: any) {
    super('workflow.started', workflowId, {
      userId,
      input,
      startedAt: new Date().toISOString()
    })
  }
}

export class WorkflowCompletedEvent extends WorkflowEvent {
  constructor(workflowId: string, output: any, duration: number) {
    super('workflow.completed', workflowId, {
      output,
      duration,
      completedAt: new Date().toISOString()
    })
  }
}

export class WorkflowFailedEvent extends WorkflowEvent {
  constructor(workflowId: string, error: string, nodeId?: string) {
    super('workflow.failed', workflowId, {
      error,
      nodeId,
      failedAt: new Date().toISOString()
    })
  }
}

export class NodeExecutionStartedEvent extends WorkflowEvent {
  constructor(workflowId: string, nodeId: string, nodeType: string, input: any) {
    super('node.execution.started', workflowId, {
      nodeId,
      nodeType,
      input,
      startedAt: new Date().toISOString()
    })
  }
}

export class NodeExecutionCompletedEvent extends WorkflowEvent {
  constructor(workflowId: string, nodeId: string, output: any, duration: number) {
    super('node.execution.completed', workflowId, {
      nodeId,
      output,
      duration,
      completedAt: new Date().toISOString()
    })
  }
}

export class NodeExecutionFailedEvent extends WorkflowEvent {
  constructor(workflowId: string, nodeId: string, error: string) {
    super('node.execution.failed', workflowId, {
      nodeId,
      error,
      failedAt: new Date().toISOString()
    })
  }
}

export class IntegrationActionExecutedEvent extends WorkflowEvent {
  constructor(
    workflowId: string, 
    providerId: string, 
    actionType: string, 
    result: any,
    nodeId?: string
  ) {
    super('integration.action.executed', workflowId, {
      providerId,
      actionType,
      result,
      nodeId,
      executedAt: new Date().toISOString()
    })
  }
}