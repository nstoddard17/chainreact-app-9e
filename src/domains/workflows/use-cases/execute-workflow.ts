import { actionRegistry, ActionContext } from './action-registry'
import { providerRegistry } from '../../integrations/use-cases/provider-registry'
import { WorkflowError, ErrorType } from '../../integrations/entities/integration-error'

export interface WorkflowNode {
  id: string
  type: string
  data: {
    nodeType?: string
    providerId?: string
    config?: Record<string, any>
    isTrigger?: boolean
  }
}

export interface WorkflowExecution {
  id: string
  workflowId: string
  userId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused'
  input: Record<string, any>
  output: Record<string, any>
  variables: Record<string, any>
  currentNodeId?: string
  startedAt: Date
  completedAt?: Date
  error?: string
}

/**
 * Clean workflow execution use case that delegates to registered actions
 */
export class ExecuteWorkflowUseCase {
  async execute(
    node: WorkflowNode,
    context: ActionContext
  ): Promise<any> {
    const { nodeType, providerId, config } = node.data

    if (!nodeType || !providerId) {
      throw new WorkflowError(
        'INVALID_NODE_CONFIGURATION',
        'Node must have nodeType and providerId',
        context.workflowId,
        ErrorType.VALIDATION,
        context.nodeId,
        { nodeType, providerId }
      )
    }

    // Check if provider is registered
    const provider = providerRegistry.getProvider(providerId)
    if (!provider) {
      throw new WorkflowError(
        'PROVIDER_NOT_REGISTERED',
        `Provider ${providerId} is not registered`,
        context.workflowId,
        ErrorType.INTERNAL,
        context.nodeId,
        { providerId }
      )
    }

    // Handle different node types
    switch (nodeType) {
      case 'gmail_action_send_email':
        return this.executeEmailAction(providerId, 'send_email', config || {}, context)
      
      case 'slack_action_send_message':
        return this.executeChatAction(providerId, 'send_message', config || {}, context)
      
      case 'discord_action_send_message':
        return this.executeChatAction(providerId, 'send_message', config || {}, context)
      
      case 'gmail_action_add_label':
        return this.executeEmailAction(providerId, 'add_label', config || {}, context)
      
      case 'airtable_action_create_record':
        return this.executeAction(providerId, 'create_record', config || {}, context)
      
      case 'hubspot_action_create_contact':
        return this.executeCRMAction(providerId, 'create_contact', config || {}, context)
      
      case 'trello_action_create_card':
        return this.executeProjectAction(providerId, 'create_card', config || {}, context)
      
      // Core workflow actions
      case 'core_action_wait':
        return this.executeWait(config || {}, context)
      
      case 'core_action_condition':
        return this.executeCondition(config || {}, context)
      
      case 'core_action_variable':
        return this.executeVariable(config || {}, context)
      
      // AI actions
      case 'ai_action_agent':
        return this.executeAIAction(config || {}, context)
      
      default:
        // Fallback to action registry
        return actionRegistry.execute(providerId, nodeType, {
          type: nodeType,
          parameters: config,
          integrationId: context.userId // This should be actual integration ID
        }, context)
    }
  }

  private async executeEmailAction(
    providerId: string, 
    actionType: string, 
    config: Record<string, any>, 
    context: ActionContext
  ): Promise<any> {
    const emailProvider = providerRegistry.getEmailProvider(providerId)
    if (!emailProvider) {
      throw new WorkflowError(
        'EMAIL_PROVIDER_NOT_AVAILABLE',
        `Provider ${providerId} does not support email capabilities`,
        context.workflowId,
        ErrorType.INTERNAL,
        context.nodeId,
        { providerId }
      )
    }

    switch (actionType) {
      case 'send_email':
        return emailProvider.sendMessage({
          to: this.resolveArray(config.to, context),
          cc: this.resolveArray(config.cc, context),
          bcc: this.resolveArray(config.bcc, context),
          subject: this.resolveValue(config.subject, context),
          body: this.resolveValue(config.body, context),
          attachments: config.attachments
        })
      
      case 'add_label':
        return emailProvider.manageLabels({
          type: 'add',
          messageIds: this.resolveArray(config.messageIds, context),
          labelIds: this.resolveArray(config.labelIds, context)
        })
      
      default:
        throw new WorkflowError(
          'UNSUPPORTED_EMAIL_ACTION',
          `Email action ${actionType} not supported`,
          context.workflowId,
          ErrorType.VALIDATION,
          context.nodeId,
          { actionType }
        )
    }
  }

  private async executeChatAction(
    providerId: string, 
    actionType: string, 
    config: Record<string, any>, 
    context: ActionContext
  ): Promise<any> {
    const chatProvider = providerRegistry.getChatProvider(providerId)
    if (!chatProvider) {
      throw new WorkflowError(
        'CHAT_PROVIDER_NOT_AVAILABLE',
        `Provider ${providerId} does not support chat capabilities`,
        context.workflowId,
        ErrorType.INTERNAL,
        context.nodeId,
        { providerId }
      )
    }

    switch (actionType) {
      case 'send_message':
        return chatProvider.sendMessage({
          channelId: this.resolveValue(config.channelId, context),
          content: this.resolveValue(config.content, context),
          mentions: this.resolveArray(config.mentions, context),
          attachments: config.attachments
        })
      
      default:
        throw new WorkflowError(
          'UNSUPPORTED_CHAT_ACTION',
          `Chat action ${actionType} not supported`,
          context.workflowId,
          ErrorType.VALIDATION,
          context.nodeId,
          { actionType }
        )
    }
  }

  private async executeCRMAction(
    providerId: string, 
    actionType: string, 
    config: Record<string, any>, 
    context: ActionContext
  ): Promise<any> {
    const crmProvider = providerRegistry.getCRMProvider(providerId)
    if (!crmProvider) {
      throw new WorkflowError(
        'CRM_PROVIDER_NOT_AVAILABLE',
        `Provider ${providerId} does not support CRM capabilities`,
        context.workflowId,
        ErrorType.INTERNAL,
        context.nodeId,
        { providerId }
      )
    }

    switch (actionType) {
      case 'create_contact':
        return crmProvider.createContact({
          name: this.resolveValue(config.name, context),
          email: this.resolveValue(config.email, context),
          phone: this.resolveValue(config.phone, context),
          company: this.resolveValue(config.company, context)
        })
      
      default:
        throw new WorkflowError(
          'UNSUPPORTED_CRM_ACTION',
          `CRM action ${actionType} not supported`,
          context.workflowId,
          ErrorType.VALIDATION,
          context.nodeId,
          { actionType }
        )
    }
  }

  private async executeProjectAction(
    providerId: string, 
    actionType: string, 
    config: Record<string, any>, 
    context: ActionContext
  ): Promise<any> {
    const projectProvider = providerRegistry.getProjectProvider(providerId)
    if (!projectProvider) {
      throw new WorkflowError(
        'PROJECT_PROVIDER_NOT_AVAILABLE',
        `Provider ${providerId} does not support project capabilities`,
        context.workflowId,
        ErrorType.INTERNAL,
        context.nodeId,
        { providerId }
      )
    }

    switch (actionType) {
      case 'create_card':
        return projectProvider.createTask({
          title: this.resolveValue(config.title, context),
          description: this.resolveValue(config.description, context),
          projectId: this.resolveValue(config.projectId, context)
        })
      
      default:
        throw new WorkflowError(
          'UNSUPPORTED_PROJECT_ACTION',
          `Project action ${actionType} not supported`,
          context.workflowId,
          ErrorType.VALIDATION,
          context.nodeId,
          { actionType }
        )
    }
  }

  private async executeAction(
    providerId: string, 
    actionType: string, 
    config: Record<string, any>, 
    context: ActionContext
  ): Promise<any> {
    return actionRegistry.execute(providerId, actionType, {
      type: actionType,
      parameters: config,
      integrationId: context.userId // This should be actual integration ID
    }, context)
  }

  private async executeWait(config: Record<string, any>, context: ActionContext): Promise<any> {
    const duration = this.resolveValue(config.duration, context) || 1000
    await new Promise(resolve => setTimeout(resolve, duration))
    return { success: true, message: `Waited ${duration}ms` }
  }

  private async executeCondition(config: Record<string, any>, context: ActionContext): Promise<any> {
    // Implementation for conditional logic
    const condition = this.resolveValue(config.condition, context)
    const result = this.evaluateCondition(condition, context)
    return { success: true, result, branch: result ? 'true' : 'false' }
  }

  private async executeVariable(config: Record<string, any>, context: ActionContext): Promise<any> {
    const variableName = config.name
    const variableValue = this.resolveValue(config.value, context)
    
    // Update context variables
    context.variables[variableName] = variableValue
    
    return { success: true, variable: variableName, value: variableValue }
  }

  private async executeAIAction(config: Record<string, any>, context: ActionContext): Promise<any> {
    // Implementation for AI agent actions
    const prompt = this.resolveValue(config.prompt, context)
    const model = config.model || 'gpt-3.5-turbo'
    
    // This would integrate with your AI service
    return { success: true, response: 'AI response placeholder', model }
  }

  private resolveValue(value: any, context: ActionContext): any {
    if (typeof value === 'string' && value.includes('{{')) {
      // Simple variable resolution - expand this as needed
      return value.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
        return context.variables[varName.trim()] || context.input[varName.trim()] || match
      })
    }
    return value
  }

  private resolveArray(value: any, context: ActionContext): any[] {
    if (Array.isArray(value)) {
      return value.map(item => this.resolveValue(item, context))
    }
    if (typeof value === 'string') {
      const resolved = this.resolveValue(value, context)
      return Array.isArray(resolved) ? resolved : [resolved]
    }
    return []
  }

  private evaluateCondition(condition: any, context: ActionContext): boolean {
    // Simple condition evaluation - expand this as needed
    if (typeof condition === 'boolean') {
      return condition
    }
    if (typeof condition === 'string') {
      // Support simple comparisons like "{{variable}} > 10"
      const resolved = this.resolveValue(condition, context)
      return Boolean(resolved)
    }
    return false
  }
}

export const executeWorkflowUseCase = new ExecuteWorkflowUseCase()