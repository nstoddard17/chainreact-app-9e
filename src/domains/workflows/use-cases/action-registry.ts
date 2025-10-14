import { ActionResult, ActionConfig } from '../../integrations/ports/connector-contract'
import { providerRegistry } from '../../integrations/use-cases/provider-registry'
import { WorkflowError, ErrorType } from '../../integrations/entities/integration-error'

import { logger } from '@/lib/utils/logger'

export type ActionHandler = (config: ActionConfig, context: ActionContext) => Promise<ActionResult>

export interface ActionContext {
  userId: string
  workflowId: string
  nodeId: string
  input: Record<string, any>
  variables: Record<string, any>
}

export interface ActionDefinition {
  providerId: string
  actionType: string
  handler: ActionHandler
  metadata: {
    name: string
    description: string
    version: string
    category: string
    deprecated?: boolean
  }
}

/**
 * Registry for workflow actions that delegates to integration providers
 */
export class ActionRegistry {
  private actions = new Map<string, ActionDefinition>()

  /**
   * Register an action handler
   */
  register(definition: ActionDefinition): void {
    const actionId = this.getActionId(definition.providerId, definition.actionType)
    this.actions.set(actionId, definition)
  }

  /**
   * Execute an action by delegating to the appropriate provider
   */
  async execute(
    providerId: string, 
    actionType: string, 
    config: ActionConfig, 
    context: ActionContext
  ): Promise<ActionResult> {
    const actionId = this.getActionId(providerId, actionType)
    const actionDef = this.actions.get(actionId)

    if (!actionDef) {
      throw new WorkflowError(
        'ACTION_NOT_FOUND',
        `Action ${actionId} not found in registry`,
        context.workflowId,
        ErrorType.INTERNAL,
        context.nodeId,
        { providerId, actionType }
      )
    }

    // Check if action is deprecated
    if (actionDef.metadata.deprecated) {
      logger.warn(`Action ${actionId} is deprecated. Consider updating workflow.`)
    }

    // Verify provider is available
    const provider = providerRegistry.getProvider(providerId)
    if (!provider) {
      throw new WorkflowError(
        'PROVIDER_NOT_AVAILABLE',
        `Provider ${providerId} not available`,
        context.workflowId,
        ErrorType.INTERNAL,
        context.nodeId,
        { providerId }
      )
    }

    try {
      // Execute the action through the registered handler
      const result = await actionDef.handler(config, context)
      
      return {
        ...result,
        metadata: {
          ...result.metadata,
          providerId,
          actionType,
          executedAt: new Date(),
          nodeId: context.nodeId
        }
      }
    } catch (error) {
      throw new WorkflowError(
        'ACTION_EXECUTION_FAILED',
        `Failed to execute action ${actionId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        context.workflowId,
        ErrorType.INTERNAL,
        context.nodeId,
        { providerId, actionType, error: error instanceof Error ? error.message : error }
      )
    }
  }

  /**
   * Get action definition
   */
  getAction(providerId: string, actionType: string): ActionDefinition | undefined {
    const actionId = this.getActionId(providerId, actionType)
    return this.actions.get(actionId)
  }

  /**
   * List all registered actions
   */
  listActions(providerId?: string): ActionDefinition[] {
    const actions = Array.from(this.actions.values())
    
    if (providerId) {
      return actions.filter(action => action.providerId === providerId)
    }
    
    return actions
  }

  /**
   * List actions by category
   */
  listActionsByCategory(category: string): ActionDefinition[] {
    return Array.from(this.actions.values())
      .filter(action => action.metadata.category === category)
  }

  /**
   * Check if action exists
   */
  hasAction(providerId: string, actionType: string): boolean {
    const actionId = this.getActionId(providerId, actionType)
    return this.actions.has(actionId)
  }

  /**
   * Unregister an action
   */
  unregister(providerId: string, actionType: string): boolean {
    const actionId = this.getActionId(providerId, actionType)
    return this.actions.delete(actionId)
  }

  /**
   * Register multiple actions for a provider
   */
  registerProvider(providerId: string, actions: Omit<ActionDefinition, 'providerId'>[]): void {
    actions.forEach(action => {
      this.register({
        ...action,
        providerId
      })
    })
  }

  /**
   * Get actions that can handle specific capability types
   */
  getActionsForCapability(capabilityType: string): ActionDefinition[] {
    const providers = providerRegistry.getProvidersByType(capabilityType as any)
    const providerIds = providers.map(p => p.providerId)
    
    return Array.from(this.actions.values())
      .filter(action => providerIds.includes(action.providerId))
  }

  private getActionId(providerId: string, actionType: string): string {
    return `${providerId}:${actionType}`
  }
}

// Singleton instance
export const actionRegistry = new ActionRegistry()