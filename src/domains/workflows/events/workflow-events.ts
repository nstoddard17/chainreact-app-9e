import { BaseDomainEvent } from '../../../shared/events/domain-event'

/**
 * Workflow domain events
 */

export class WorkflowExecutionStarted extends BaseDomainEvent {
  get eventType(): string { return 'WorkflowExecutionStarted' }
  get aggregateType(): string { return 'WorkflowExecution' }

  constructor(
    executionId: string,
    public readonly workflowId: string,
    public readonly userId: string,
    public readonly triggerType: string,
    public readonly input: Record<string, any>,
    options?: { causationId?: string; correlationId?: string; metadata?: Record<string, any> }
  ) {
    super(executionId, options)
  }
}

export class WorkflowExecutionCompleted extends BaseDomainEvent {
  get eventType(): string { return 'WorkflowExecutionCompleted' }
  get aggregateType(): string { return 'WorkflowExecution' }

  constructor(
    executionId: string,
    public readonly workflowId: string,
    public readonly userId: string,
    public readonly result: 'success' | 'failure',
    public readonly output: Record<string, any>,
    public readonly duration: number,
    options?: { causationId?: string; correlationId?: string; metadata?: Record<string, any> }
  ) {
    super(executionId, options)
  }
}

export class WorkflowNodeExecuted extends BaseDomainEvent {
  get eventType(): string { return 'WorkflowNodeExecuted' }
  get aggregateType(): string { return 'WorkflowExecution' }

  constructor(
    executionId: string,
    public readonly workflowId: string,
    public readonly nodeId: string,
    public readonly nodeType: string,
    public readonly result: 'success' | 'failure',
    public readonly duration: number,
    public readonly output?: any,
    public readonly error?: string,
    options?: { causationId?: string; correlationId?: string; metadata?: Record<string, any> }
  ) {
    super(executionId, options)
  }
}

export class WorkflowPaused extends BaseDomainEvent {
  get eventType(): string { return 'WorkflowPaused' }
  get aggregateType(): string { return 'WorkflowExecution' }

  constructor(
    executionId: string,
    public readonly workflowId: string,
    public readonly reason: string,
    public readonly pausedAt: string, // node ID where paused
    options?: { causationId?: string; correlationId?: string; metadata?: Record<string, any> }
  ) {
    super(executionId, options)
  }
}

export class WorkflowResumed extends BaseDomainEvent {
  get eventType(): string { return 'WorkflowResumed' }
  get aggregateType(): string { return 'WorkflowExecution' }

  constructor(
    executionId: string,
    public readonly workflowId: string,
    public readonly resumedFrom: string, // node ID where resumed
    options?: { causationId?: string; correlationId?: string; metadata?: Record<string, any> }
  ) {
    super(executionId, options)
  }
}

export class WorkflowScheduled extends BaseDomainEvent {
  get eventType(): string { return 'WorkflowScheduled' }
  get aggregateType(): string { return 'Workflow' }

  constructor(
    workflowId: string,
    public readonly userId: string,
    public readonly scheduleType: 'cron' | 'interval' | 'once',
    public readonly schedule: string,
    public readonly nextRunAt: Date,
    options?: { causationId?: string; correlationId?: string; metadata?: Record<string, any> }
  ) {
    super(workflowId, options)
  }
}

export class WorkflowTriggerActivated extends BaseDomainEvent {
  get eventType(): string { return 'WorkflowTriggerActivated' }
  get aggregateType(): string { return 'Workflow' }

  constructor(
    workflowId: string,
    public readonly triggerType: string,
    public readonly triggerConfig: Record<string, any>,
    options?: { causationId?: string; correlationId?: string; metadata?: Record<string, any> }
  ) {
    super(workflowId, options)
  }
}