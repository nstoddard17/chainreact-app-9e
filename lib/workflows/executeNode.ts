import { TokenRefreshService } from "../integrations/tokenRefreshService"
import type { Integration } from "@/types/integration"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { decrypt } from "@/lib/security/encryption"
import { getSecret } from "@/lib/secrets"
import { createClient } from "@supabase/supabase-js"
import { FileStorageService } from "@/lib/storage/fileStorage"
import { google } from 'googleapis'

// Import from the new registry system
import { actionHandlerRegistry, getWaitForTimeHandler } from './actions/registry'
import { executeGenericAction } from './actions/generic'
import { ActionResult } from './actions'
import { createExecutionLogEntry, storeExecutionLog, formatExecutionLogEntry } from './execution/executionLogger'

// Import AI-related functionality
import {
  summarizeContent,
  extractInformation,
  analyzeSentiment,
  translateText,
  generateContent,
  classifyContent,
} from './actions/aiDataProcessing'
import { executeAIAgent } from './aiAgent'
import { processAIFields, ProcessingContext } from './ai/fieldProcessor'

/**
 * Generate mock output for sandbox mode based on action type
 */
function generateMockOutput(type: string, config: any): any {
  // Generate realistic mock data based on action type
  switch(type) {
    case 'gmail_send':
    case 'gmail_action_send_email':
      return {
        id: `mock_email_${Date.now()}`,
        threadId: `mock_thread_${Date.now()}`,
        labelIds: ['SENT'],
        message: 'Email sent successfully (sandbox mode)'
      }
    
    case 'slack_send_message':
      return {
        ok: true,
        channel: config.channel || 'mock_channel',
        ts: String(Date.now() / 1000),
        message: { text: config.text || 'Mock message' }
      }
    
    case 'discord_send_message':
      return {
        id: `mock_discord_${Date.now()}`,
        content: config.content || 'Mock Discord message',
        channel_id: config.channelId || 'mock_channel',
        author: { id: 'mock_bot', username: 'Workflow Bot' }
      }
    
    case 'airtable_create_record':
      return {
        id: `rec_mock_${Date.now()}`,
        fields: config.fields || {},
        createdTime: new Date().toISOString()
      }
    
    default:
      return {
        success: true,
        mockData: true,
        timestamp: new Date().toISOString(),
        action: type
      }
  }
}

/**
 * Generate preview of what would be sent in sandbox mode
 */
function getMockPreview(type: string, config: any): any {
  // Return a preview of what would have been sent to external services
  switch(type) {
    case 'gmail_send':
    case 'gmail_action_send_email':
      return {
        to: config.to || 'recipient@example.com',
        subject: config.subject || 'Test Email',
        body: config.body || 'This email would have been sent.',
        cc: config.cc,
        bcc: config.bcc
      }
    
    case 'slack_send_message':
      return {
        channel: config.channel || '#general',
        text: config.text || 'Test message',
        blocks: config.blocks
      }
    
    case 'discord_send_message':
      return {
        channelId: config.channelId,
        content: config.content || 'Test message',
        embeds: config.embeds
      }
    
    default:
      return config
  }
}

/**
 * Wrapper function for AI agent execution that adapts to the executeAction signature
 */
async function executeAIAgentWrapper(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve any variable references in the config using the enhanced resolveValue function
    const resolvedConfig = resolveValue(config, input)
    
    const result = await executeAIAgent({
      userId,
      config: resolvedConfig,
      input,
      workflowContext: {
        nodes: [],
        previousResults: input.nodeOutputs || {}
      }
    })
    
    return {
      success: result.success,
      output: {
        output: result.output || "" // Structure matches outputSchema: { output: "AI response text" }
      },
      message: result.message || "AI Agent execution completed"
    }
  } catch (error: any) {
    console.error("AI Agent execution error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "AI Agent execution failed"
    }
  }
}

/**
 * Interface for action execution parameters
 */
export interface ExecuteActionParams {
  node: any
  input: Record<string, any>
  userId: string
  workflowId: string
  testMode?: boolean
  executionMode?: 'sandbox' | 'live' | 'production'
}

export async function getDecryptedAccessToken(userId: string, provider: string): Promise<string> {
  try {
    const supabase = await createSupabaseServerClient()
    
    // Get the user's integration
    const { data: integration, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", provider)
      .single()

    if (error) {
      console.error(`Database error fetching integration for ${provider}:`, error)
      throw new Error(`Database error: ${error.message}`)
    }

    if (!integration) {
      throw new Error(`No integration found for ${provider}`)
    }

    // Cast the integration to the proper type
    const typedIntegration = integration as unknown as Integration

    // Check if token needs refresh
    const shouldRefresh = TokenRefreshService.shouldRefreshToken(typedIntegration, {
      accessTokenExpiryThreshold: 5 // Refresh if expiring within 5 minutes
    })

    let accessToken = integration.access_token

    if (shouldRefresh.shouldRefresh && integration.refresh_token) {
      console.log(`Refreshing token for ${provider}: ${shouldRefresh.reason}`)
      
      const refreshResult = await TokenRefreshService.refreshTokenForProvider(
        integration.provider,
        integration.refresh_token,
        typedIntegration
      )

      if (refreshResult.success && refreshResult.accessToken) {
        accessToken = refreshResult.accessToken
        console.log(`Token refresh successful for ${provider}`)
      } else {
        console.error(`Token refresh failed for ${provider}:`, refreshResult.error)
        throw new Error(`Failed to refresh ${provider} token: ${refreshResult.error}`)
      }
    }

    if (!accessToken) {
      throw new Error(`No valid access token for ${provider}`)
    }

    const secret = await getSecret("encryption_key")
    if (!secret) {
      console.error("Encryption key not found in environment")
      throw new Error("Encryption secret not configured. Please set ENCRYPTION_KEY environment variable.")
    }

    console.log(`Attempting to decrypt access token for ${provider}`)
    console.log(`Token format check:`, {
      hasColon: accessToken.includes(':'),
      tokenLength: accessToken.length,
      tokenPreview: accessToken.substring(0, 20) + '...'
    })
    
    try {
    const decryptedToken = decrypt(accessToken, secret)
    console.log(`Successfully decrypted access token for ${provider}`)
    return decryptedToken
    } catch (decryptError: any) {
      console.error(`Decryption failed for ${provider}:`, {
        error: decryptError.message,
        tokenFormat: accessToken.includes(':') ? 'encrypted' : 'plain',
        tokenLength: accessToken.length
      })
      
      // If the token doesn't have the expected format, it might be stored as plain text
      if (!accessToken.includes(':')) {
        console.log(`Token for ${provider} appears to be stored as plain text, returning as-is`)
        return accessToken
      }
      
      throw new Error(`Failed to decrypt ${provider} access token: ${decryptError.message}`)
    }
  } catch (error: any) {
    console.error(`Error in getDecryptedAccessToken for ${provider}:`, {
      message: error.message,
      stack: error.stack,
      userId,
      provider
    })
    throw error
  }
}

/**
 * Execute a single workflow node
 * This is a simplified wrapper for use in chain execution
 */
export async function executeNode(
  node: any,
  context: any,
  userId: string
): Promise<any> {
  // Build the ExecuteActionParams from the simplified inputs
  const params: ExecuteActionParams = {
    node,
    input: context.data || context,
    userId,
    workflowId: context.workflowId,
    testMode: context.testMode || false,
    executionMode: context.testMode ? 'sandbox' : 'live'
  }

  try {
    const result = await executeAction(params)
    return result
  } catch (error) {
    console.error(`Failed to execute node ${node.id}:`, error)
    throw error
  }
}

/**
 * Main function to execute a workflow action node
 * Routes to the appropriate handler based on node type
 */
export async function executeAction({ node, input, userId, workflowId, testMode, executionMode }: ExecuteActionParams): Promise<ActionResult> {
  console.log(`📌 executeAction received userId: ${userId}, workflowId: ${workflowId}`)
  
  const { type, config } = node.data
  const startTime = Date.now()
  
  // Determine if we're in sandbox mode
  const isSandboxMode = executionMode === 'sandbox' || (testMode === true && executionMode !== 'live')
  
  // Create initial log entry for started status
  const startLogEntry = createExecutionLogEntry(
    node,
    'started',
    {
      trigger: node.data.isTrigger ? input?.trigger : undefined,
      input: { config, previousOutputs: input?.previousResults }
    }
  )
  
  // Store and log the start
  if (workflowId) {
    storeExecutionLog(workflowId, startLogEntry)
    console.log('[Execution Started]', formatExecutionLogEntry(startLogEntry))
  }
  
  // Process AI fields if needed
  const processedConfig = await processAIFieldsIfNeeded(type, config, {
    userId,
    workflowId: workflowId || 'unknown',
    executionId: input?.executionId || 'unknown',
    nodeId: node.id || 'unknown',
    trigger: input?.trigger,
    previousResults: input?.previousResults
  })

  // Check if environment is properly configured
  const hasSupabaseConfig = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const hasEncryptionKey = process.env.ENCRYPTION_KEY

  if (!hasSupabaseConfig) {
    console.warn("Supabase configuration missing, running in test mode")
    return { 
      success: true, 
      output: { test: true, mockResult: true }, 
      message: `Test mode: ${type} executed successfully (missing Supabase config)` 
    }
  }

  // Special handling for wait_for_time action that needs workflow context
  if (type === "wait_for_time") {
    const handler = getWaitForTimeHandler(workflowId, node.id)
    try {
      const result = await handler(processedConfig, userId, input)
      const executionTime = Date.now() - startTime
      
      const logEntry = createExecutionLogEntry(node, 'completed', {
        input: { config: processedConfig, previousOutputs: input?.previousResults },
        output: result.output || result,
        executionTime
      })
      
      if (workflowId) {
        storeExecutionLog(workflowId, logEntry)
        console.log('[Wait Completed]', formatExecutionLogEntry(logEntry))
      }
      
      return result
    } catch (error: any) {
      const executionTime = Date.now() - startTime
      const errorEntry = createExecutionLogEntry(node, 'error', {
        input: { config: processedConfig, previousOutputs: input?.previousResults },
        error: { message: error.message, stack: error.stack },
        executionTime
      })
      
      if (workflowId) {
        storeExecutionLog(workflowId, errorEntry)
        console.log('[Wait Error]', formatExecutionLogEntry(errorEntry))
      }
      throw error
    }
  }

  // Special handling for AI agent
  if (type === "ai_agent") {
    try {
      const result = await executeAIAgentWrapper(processedConfig, userId, input)
      const executionTime = Date.now() - startTime
      
      const logEntry = createExecutionLogEntry(node, 'completed', {
        input: { config: processedConfig, previousOutputs: input?.previousResults },
        output: result.output || result,
        executionTime
      })
      
      if (workflowId) {
        storeExecutionLog(workflowId, logEntry)
        console.log('[AI Agent Completed]', formatExecutionLogEntry(logEntry))
      }
      
      return result
    } catch (error: any) {
      const executionTime = Date.now() - startTime
      const errorEntry = createExecutionLogEntry(node, 'error', {
        input: { config: processedConfig, previousOutputs: input?.previousResults },
        error: { message: error.message, stack: error.stack },
        executionTime
      })
      
      if (workflowId) {
        storeExecutionLog(workflowId, errorEntry)
        console.log('[AI Agent Error]', formatExecutionLogEntry(errorEntry))
      }
      throw error
    }
  }

  // SANDBOX MODE INTERCEPTION
  // If we're in sandbox mode, return mock data instead of executing real actions
  if (isSandboxMode) {
    console.log(`[SANDBOX MODE] Intercepting ${type} action - no external calls will be made`)
    
    // Generate mock response based on action type
    const mockOutput = generateMockOutput(type, processedConfig)
    
    const logEntry = createExecutionLogEntry(node, 'completed', {
      input: { config: processedConfig, previousOutputs: input?.previousResults },
      output: mockOutput,
      executionTime: Date.now() - startTime,
      sandboxMode: true
    })
    
    if (workflowId) {
      storeExecutionLog(workflowId, logEntry)
      console.log('[SANDBOX Completed]', formatExecutionLogEntry(logEntry))
    }
    
    return {
      success: true,
      output: mockOutput,
      message: `[SANDBOX] ${type} executed successfully (no external calls made)`,
      sandbox: true,
      intercepted: {
        type,
        config: processedConfig,
        wouldHaveSent: getMockPreview(type, processedConfig)
      }
    }
  }

  // Get the appropriate handler from the registry
  const handler = actionHandlerRegistry[type]

  // If there's no handler for this node type, try the generic handler
  if (!handler) {
    console.log(`Using generic handler for node type: ${type}`)
    try {
      const result = await executeGenericAction(
        { ...processedConfig, actionType: type },
        userId,
        input
      )
      const executionTime = Date.now() - startTime
      
      const logEntry = createExecutionLogEntry(node, 'completed', {
        input: { config: processedConfig, previousOutputs: input?.previousResults },
        output: result.output || result,
        executionTime
      })
      
      if (workflowId) {
        storeExecutionLog(workflowId, logEntry)
        console.log('[Generic Action Completed]', formatExecutionLogEntry(logEntry))
      }
      
      return result
    } catch (error: any) {
      const executionTime = Date.now() - startTime
      const errorEntry = createExecutionLogEntry(node, 'error', {
        input: { config: processedConfig, previousOutputs: input?.previousResults },
        error: { message: error.message, stack: error.stack },
        executionTime
      })
      
      if (workflowId) {
        storeExecutionLog(workflowId, errorEntry)
        console.log('[Generic Action Error]', formatExecutionLogEntry(errorEntry))
      }
      throw error
    }
  }

  // For encryption-dependent handlers, check if encryption key is available
  if (!hasEncryptionKey && 
      (type.startsWith('gmail_') || 
       type.startsWith('google_sheets_') || 
       type.startsWith('google_drive_') ||
       type.startsWith('airtable_'))) {
    console.warn(`Encryption key missing, running ${type} in test mode`)
    return { 
      success: true, 
      output: { 
        test: true,
        mockResult: true,
        mockType: type
      }, 
      message: `Test mode: ${type} executed successfully (missing encryption key)` 
    }
  }

  // Execute the handler with the processed parameters
  try {
    const result = await handler({ config: processedConfig, userId, input })
    const executionTime = Date.now() - startTime
    
    // Create success log entry
    const successLogEntry = createExecutionLogEntry(
      node,
      'completed',
      {
        trigger: node.data.isTrigger ? input?.trigger : undefined,
        input: { config: processedConfig, previousOutputs: input?.previousResults },
        output: result.output || result,
        executionTime
      }
    )
    
    // Store and log the success
    if (workflowId) {
      storeExecutionLog(workflowId, successLogEntry)
      console.log('[Execution Completed]', formatExecutionLogEntry(successLogEntry))
    }
    
    return result
  } catch (error: any) {
    const executionTime = Date.now() - startTime
    
    // Create error log entry
    const errorLogEntry = createExecutionLogEntry(
      node,
      'error',
      {
        trigger: node.data.isTrigger ? input?.trigger : undefined,
        input: { config: processedConfig, previousOutputs: input?.previousResults },
        error: {
          message: error.message || 'Unknown error',
          details: error.details,
          stack: error.stack
        },
        executionTime
      }
    )
    
    // Store and log the error
    if (workflowId) {
      storeExecutionLog(workflowId, errorLogEntry)
      console.log('[Execution Error]', formatExecutionLogEntry(errorLogEntry))
    }
    
    throw error
  }
}

/**
 * Process AI fields in configuration if needed
 */
async function processAIFieldsIfNeeded(
  nodeType: string,
  config: any,
  context: {
    userId: string
    workflowId: string
    executionId: string
    nodeId: string
    trigger?: any
    previousResults?: any
  }
): Promise<any> {
  // Check if any fields need AI processing
  const needsProcessing = Object.values(config).some(value => 
    typeof value === 'string' && (
      value.includes('{{AI_FIELD:') ||
      value.includes('[') ||
      value.includes('{{AI:')
    )
  )
  
  if (!needsProcessing && nodeType !== 'ai_router') {
    return config // No processing needed
  }
  
  // Build processing context
  const processingContext: ProcessingContext = {
    userId: context.userId,
    workflowId: context.workflowId,
    executionId: context.executionId,
    nodeId: context.nodeId,
    nodeType,
    triggerData: context.trigger,
    previousNodes: context.previousResults ? new Map(Object.entries(context.previousResults)) : undefined,
    config,
    availableActions: nodeType === 'ai_router' ? getAvailableActions(config) : undefined,
    apiKey: config.customApiKey,
    model: config.model
  }
  
  try {
    const result = await processAIFields(processingContext)
    
    // For AI Router, handle routing decision
    if (nodeType === 'ai_router' && result.routing) {
      return {
        ...config,
        ...result.fields,
        _aiRouting: result.routing // Special field for routing decision
      }
    }
    
    // Return config with processed fields
    return {
      ...config,
      ...result.fields
    }
  } catch (error) {
    console.error('AI field processing failed:', error)
    // Fall back to original config
    return config
  }
}

/**
 * Get available actions from AI Router config
 */
function getAvailableActions(config: any): string[] {
  if (!config.outputPaths) return []
  
  return config.outputPaths
    .filter((path: any) => path.actionId)
    .map((path: any) => path.actionId)
}

/**
 * Helper function to resolve variable references in config
 */
function resolveValue(value: any, input: Record<string, any>): any {
  if (typeof value === 'string' && value.includes('{{') && value.includes('}}')) {
    // Extract variable references and replace them
    return value.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const keys = path.split('.')
      let result = input
      for (const key of keys) {
        result = result?.[key]
      }
      return result ?? match
    })
  }
  
  if (Array.isArray(value)) {
    return value.map(item => resolveValue(item, input))
  }
  
  if (value && typeof value === 'object') {
    const resolved: Record<string, any> = {}
    for (const [key, val] of Object.entries(value)) {
      resolved[key] = resolveValue(val, input)
    }
    return resolved
  }
  
  return value
}