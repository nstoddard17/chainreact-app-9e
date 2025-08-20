import { 
  ProjectProvider,
  Project,
  ProjectResult,
  Task,
  TaskResult,
  TaskDestination,
  ProjectFilters,
  TaskFilters
} from '../../domains/integrations/ports/capability-interfaces'
import {
  ConnectorContract,
  LifecyclePort,
  TriggerPort,
  ActionPort,
  ConfigPort,
  CapabilityDescriptor,
  InstallConfig,
  InstallResult,
  AuthResult,
  RevokeResult,
  HealthResult,
  TriggerConfig,
  SubscriptionResult,
  TriggerEvent,
  ActionConfig,
  ActionResult,
  ValidationResult,
  ActionSchema,
  ConfigSchema
} from '../../domains/integrations/ports/connector-contract'
import { IntegrationError, ErrorType } from '../../domains/integrations/entities/integration-error'

/**
 * Trello adapter implementing ProjectProvider interface
 */
export class TrelloAdapter implements ProjectProvider {
  readonly providerId = 'trello'
  readonly capabilities: CapabilityDescriptor = {
    supportsWebhooks: true,
    supportsPolling: true,
    supportsBatch: false,
    supportsRealTime: true,
    rateLimits: [
      {
        type: 'requests',
        limit: 300,
        window: 10000, // 10 seconds
        scope: 'token'
      }
    ],
    maxPageSize: 1000,
    supportsSearch: true,
    supportsSorting: true,
    supportsFiltering: true,
    features: {
      supportsBoards: true,
      supportsList: true,
      supportsCards: true,
      supportsLabels: true,
      supportsChecklists: true,
      supportsAttachments: true,
      maxAttachmentSize: 10 * 1024 * 1024 // 10MB
    }
  }

  lifecycle: LifecyclePort = new TrelloLifecycleAdapter()
  triggers: TriggerPort = new TrelloTriggerAdapter()
  actions: ActionPort = new TrelloActionAdapter()
  config: ConfigPort = new TrelloConfigAdapter()

  // ProjectProvider implementation
  async createProject(project: Project): Promise<ProjectResult> {
    try {
      const userId = (project as any).userId || 'unknown-user'
      const result = await this.callTrelloAPI('create_board', project, userId)
      
      return {
        success: true,
        data: result,
        projectId: result.id
      }
    } catch (error) {
      throw this.translateError(error, 'CREATE_PROJECT_FAILED')
    }
  }

  async createTask(task: Task): Promise<TaskResult> {
    try {
      const userId = (task as any).userId || 'unknown-user'
      const result = await this.callTrelloAPI('create_card', task, userId)
      
      return {
        success: true,
        data: result,
        taskId: result.id
      }
    } catch (error) {
      throw this.translateError(error, 'CREATE_TASK_FAILED')
    }
  }

  async updateTask(taskId: string, updates: Partial<Task>): Promise<TaskResult> {
    try {
      const userId = (updates as any).userId || 'unknown-user'
      const result = await this.callTrelloAPI('update_card', { taskId, ...updates }, userId)
      
      return {
        success: true,
        data: result,
        taskId: result.id
      }
    } catch (error) {
      throw this.translateError(error, 'UPDATE_TASK_FAILED')
    }
  }

  async moveTask(taskId: string, destination: TaskDestination): Promise<TaskResult> {
    try {
      const userId = 'unknown-user'
      const result = await this.callTrelloAPI('move_card', { taskId, destination }, userId)
      
      return {
        success: true,
        data: result,
        taskId: result.id
      }
    } catch (error) {
      throw this.translateError(error, 'MOVE_TASK_FAILED')
    }
  }

  async getProjects(filters?: ProjectFilters): Promise<Project[]> {
    try {
      const userId = (filters as any)?.userId || 'unknown-user'
      const result = await this.callTrelloAPI('get_boards', filters, userId)
      return result.boards || []
    } catch (error) {
      throw this.translateError(error, 'GET_PROJECTS_FAILED')
    }
  }

  async getTasks(filters?: TaskFilters): Promise<Task[]> {
    try {
      const userId = (filters as any)?.userId || 'unknown-user'
      const result = await this.callTrelloAPI('get_cards', filters, userId)
      return result.cards || []
    } catch (error) {
      throw this.translateError(error, 'GET_TASKS_FAILED')
    }
  }

  private async callTrelloAPI(method: string, params: any, userId?: string): Promise<any> {
    try {
      switch (method) {
        case 'create_list': {
          const { createTrelloList } = await import('../../../lib/workflows/actions/trello')
          const result = await createTrelloList(params, userId || 'user-id', {})
          
          if (!result.success) {
            throw new Error(result.message || 'Trello create list failed')
          }
          
          return {
            id: result.output?.id,
            name: result.output?.name,
            success: true,
            ...result.output
          }
        }
        
        case 'create_board': {
          // Trello create board implementation
          const { getDecryptedAccessToken } = await import('../../../lib/workflows/actions/core/getDecryptedAccessToken')
          
          const accessToken = await getDecryptedAccessToken(userId || 'user-id', 'trello')
          
          const response = await fetch(
            `https://api.trello.com/1/boards?key=${process.env.TRELLO_CLIENT_ID}&token=${accessToken}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                name: params.name,
                desc: params.description
              })
            }
          )
          
          if (!response.ok) {
            throw new Error(`Trello API error: ${response.status}`)
          }
          
          const result = await response.json()
          return {
            id: result.id,
            name: result.name,
            success: true
          }
        }
        
        case 'create_card': {
          // Trello create card implementation
          const { getDecryptedAccessToken } = await import('../../../lib/workflows/actions/core/getDecryptedAccessToken')
          
          const accessToken = await getDecryptedAccessToken(userId || 'user-id', 'trello')
          
          const response = await fetch(
            `https://api.trello.com/1/cards?key=${process.env.TRELLO_CLIENT_ID}&token=${accessToken}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                name: params.title,
                desc: params.description,
                idList: params.projectId
              })
            }
          )
          
          if (!response.ok) {
            throw new Error(`Trello API error: ${response.status}`)
          }
          
          const result = await response.json()
          return {
            id: result.id,
            name: result.name,
            success: true
          }
        }
        
        case 'get_boards': {
          // Trello get boards implementation
          const { getDecryptedAccessToken } = await import('../../../lib/workflows/actions/core/getDecryptedAccessToken')
          
          const accessToken = await getDecryptedAccessToken(userId || 'user-id', 'trello')
          
          const response = await fetch(
            `https://api.trello.com/1/members/me/boards?key=${process.env.TRELLO_CLIENT_ID}&token=${accessToken}`,
            {
              headers: {
                'Content-Type': 'application/json'
              }
            }
          )
          
          if (!response.ok) {
            throw new Error(`Trello API error: ${response.status}`)
          }
          
          const result = await response.json()
          return {
            boards: result.map((board: any) => ({
              id: board.id,
              name: board.name,
              description: board.desc
            })),
            success: true
          }
        }
        
        default:
          throw new Error(`Trello method ${method} not implemented`)
      }
    } catch (error) {
      console.error(`Trello API call failed for method ${method}:`, error)
      throw error
    }
  }

  private translateError(error: any, code: string): IntegrationError {
    let errorType = ErrorType.PROVIDER_ERROR
    let message = error.message || 'Unknown Trello error'

    // Translate Trello-specific errors
    if (error.status) {
      switch (error.status) {
        case 401:
          errorType = ErrorType.AUTHORIZATION
          message = 'Trello token is invalid or expired.'
          break
        case 403:
          errorType = ErrorType.AUTHORIZATION
          message = 'Insufficient permissions for Trello operation.'
          break
        case 429:
          errorType = ErrorType.RATE_LIMIT
          message = 'Trello rate limit exceeded. Please try again later.'
          break
        case 400:
          errorType = ErrorType.VALIDATION
          message = 'Invalid Trello request parameters.'
          break
        default:
          if (error.status >= 500) {
            errorType = ErrorType.PROVIDER_ERROR
            message = 'Trello service is temporarily unavailable.'
          }
      }
    }

    return new IntegrationError(code, message, this.providerId, errorType, undefined, {
      originalError: error,
      status: error.status
    })
  }
}

// Lifecycle adapter
class TrelloLifecycleAdapter implements LifecyclePort {
  async install(userId: string, config: InstallConfig): Promise<InstallResult> {
    return { 
      success: true, 
      authUrl: 'https://trello.com/1/authorize'
    }
  }

  async authorize(userId: string, authCode: string): Promise<AuthResult> {
    return { 
      success: true, 
      accessToken: authCode // Trello uses token directly
    }
  }

  async refresh(userId: string, refreshToken: string): Promise<AuthResult> {
    // Trello tokens don't expire
    return { success: true, accessToken: 'unchanged' }
  }

  async revoke(userId: string, integrationId: string): Promise<RevokeResult> {
    return { success: true }
  }

  async healthCheck(integrationId: string): Promise<HealthResult> {
    return { healthy: true, lastChecked: new Date() }
  }
}

// Trigger adapter
class TrelloTriggerAdapter implements TriggerPort {
  async subscribe(trigger: TriggerConfig): Promise<SubscriptionResult> {
    return { success: true, subscriptionId: 'sub-id' }
  }

  async unsubscribe(subscriptionId: string): Promise<void> {
    // Unsubscribe from Trello webhooks
  }

  async poll(trigger: TriggerConfig): Promise<TriggerEvent[]> {
    return []
  }
}

// Action adapter
class TrelloActionAdapter implements ActionPort {
  async execute(action: ActionConfig): Promise<ActionResult> {
    return { success: true }
  }

  async validate(action: ActionConfig): Promise<ValidationResult> {
    return { valid: true, errors: [] }
  }

  getSchema(actionType: string): ActionSchema {
    const schemas: Record<string, ActionSchema> = {
      'create_list': {
        type: 'create_list',
        parameters: {
          boardId: { type: 'string', description: 'Trello board ID', required: true },
          name: { type: 'string', description: 'List name', required: true },
          template: { type: 'string', description: 'Template to copy from', required: false }
        },
        required: ['boardId', 'name']
      },
      'create_card': {
        type: 'create_card',
        parameters: {
          listId: { type: 'string', description: 'Trello list ID', required: true },
          name: { type: 'string', description: 'Card name', required: true },
          desc: { type: 'string', description: 'Card description', required: false },
          due: { type: 'string', description: 'Due date', required: false }
        },
        required: ['listId', 'name']
      }
    }
    return schemas[actionType] || { type: actionType, parameters: {}, required: [] }
  }
}

// Config adapter
class TrelloConfigAdapter implements ConfigPort {
  getConfigSchema(): ConfigSchema {
    return {
      fields: {
        apiKey: {
          type: 'string',
          description: 'Trello API key',
          required: true,
          sensitive: true
        },
        token: {
          type: 'string',
          description: 'Trello user token',
          required: true,
          sensitive: true
        }
      },
      required: ['apiKey', 'token']
    }
  }

  validateConfig(config: any): ValidationResult {
    const errors = []
    if (!config.apiKey) {
      errors.push({
        field: 'apiKey',
        message: 'API key is required',
        code: 'MISSING_API_KEY'
      })
    }
    if (!config.token) {
      errors.push({
        field: 'token',
        message: 'User token is required',
        code: 'MISSING_TOKEN'
      })
    }
    return { valid: errors.length === 0, errors }
  }

  getRequiredScopes(): string[] {
    return [
      'read',
      'write'
    ]
  }
}