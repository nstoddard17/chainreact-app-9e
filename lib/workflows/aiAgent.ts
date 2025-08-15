/**
 * AI Agent Node Implementation
 * 
 * Provides an AI agent that can use other nodes as tools and maintain context
 */

import { getIntegrationCredentials } from "@/lib/integrations/getDecryptedAccessToken"
import { resolveValue } from "@/lib/workflows/actions/core/resolveValue"

/**
 * AI Agent metadata
 */
export const AI_AGENT_METADATA = {
  key: "ai_agent",
  name: "AI Agent",
  description: "An AI agent that can use other integrations as tools to accomplish goals",
  icon: "zap"
};

/**
 * Standard interface for AI agent parameters
 */
export interface AIAgentParams {
  userId: string
  config: Record<string, any>
  input: Record<string, any>
  workflowContext?: {
    nodes: any[]
    previousResults: Record<string, any>
  }
}

/**
 * Standard interface for AI agent results
 */
export interface AIAgentResult {
  success: boolean
  output?: Record<string, any>
  message?: string
  error?: string
  steps?: AIAgentStep[]
}

/**
 * Represents a step taken by the AI agent
 */
export interface AIAgentStep {
  step: number
  action: string
  tool?: string
  input?: any
  output?: any
  reasoning: string
  success: boolean
  error?: string
}

/**
 * Memory context for the AI agent
 */
export interface MemoryContext {
  shortTerm: any[]
  workflowWide: any[]
  external: any[]
  toolsAvailable: string[]
}

/**
 * Resolves context from previously run nodes
 */
export async function resolveContext(
  goal: string, 
  connectedNodes: any[], 
  previousResults: Record<string, any>
): Promise<any> {
  const context: any = {
    goal,
    availableData: {},
    nodeOutputs: {},
    workflowState: {}
  }

  // Gather data from previous node executions
  for (const [nodeId, result] of Object.entries(previousResults)) {
    if (result && result.output) {
      context.nodeOutputs[nodeId] = result.output
      context.availableData[nodeId] = result.output
    }
  }

  // Analyze connected nodes to understand available tools
  const availableTools = connectedNodes
    .filter(node => !node.isTrigger)
    .map(node => ({
      name: node.data?.type || node.type,
      description: node.data?.description || node.description,
      configSchema: node.data?.configSchema || node.configSchema
    }))

  context.availableTools = availableTools

  return context
}

/**
 * Fetches memory from connected integrations based on memory configuration
 */
export async function fetchMemory(
  memoryConfig: {
    memory: string
    memoryIntegration?: string
    customMemoryIntegrations?: string[]
  },
  userId: string
): Promise<MemoryContext> {
  const memory: MemoryContext = {
    shortTerm: [],
    workflowWide: [],
    external: [],
    toolsAvailable: []
  }

  // Determine which integrations to fetch memory from
  let integrationsToFetch: string[] = []
  
  switch (memoryConfig.memory) {
    case 'none':
      // No memory needed
      return memory
      
    case 'single-storage':
      if (memoryConfig.memoryIntegration) {
        integrationsToFetch = [memoryConfig.memoryIntegration]
      }
      break
      
    case 'all-storage':
      // Fetch from all storage integrations
      integrationsToFetch = [
        'google-drive', 'onedrive', 'dropbox', 'box', 
        'notion', 'airtable', 'google-sheets'
      ]
      break
      
    case 'custom':
      if (memoryConfig.customMemoryIntegrations) {
        integrationsToFetch = memoryConfig.customMemoryIntegrations
      }
      break
  }

  try {
    // Fetch data from specified integrations
    for (const integration of integrationsToFetch) {
      try {
        const credentials = await getIntegrationCredentials(userId, integration)
        if (!credentials) continue

        switch (integration) {
          case 'gmail':
            // Fetch recent emails
            const emailResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10', {
              headers: { 'Authorization': `Bearer ${credentials.accessToken}` }
            })
            if (emailResponse.ok) {
              const emails = await emailResponse.json()
              memory.external.push({
                source: 'gmail',
                type: 'recent_emails',
                data: emails.messages?.slice(0, 5) || []
              })
            }
            break

          case 'google-drive':
            // Fetch recent files
            const driveResponse = await fetch('https://www.googleapis.com/drive/v3/files?orderBy=modifiedTime desc&pageSize=10', {
              headers: { 'Authorization': `Bearer ${credentials.accessToken}` }
            })
            if (driveResponse.ok) {
              const files = await driveResponse.json()
              memory.external.push({
                source: 'google-drive',
                type: 'recent_files',
                data: files.files?.slice(0, 5) || []
              })
            }
            break

          case 'notion':
            // Fetch recent pages
            const notionResponse = await fetch('https://api.notion.com/v1/search', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${credentials.accessToken}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                filter: { property: 'object', value: 'page' },
                page_size: 5
              })
            })
            if (notionResponse.ok) {
              const pages = await notionResponse.json()
              memory.external.push({
                source: 'notion',
                type: 'recent_pages',
                data: pages.results || []
              })
            }
            break

          case 'slack':
            // Fetch recent messages
            const slackResponse = await fetch('https://slack.com/api/conversations.list', {
              headers: { 'Authorization': `Bearer ${credentials.accessToken}` }
            })
            if (slackResponse.ok) {
              const channels = await slackResponse.json()
              memory.external.push({
                source: 'slack',
                type: 'channels',
                data: channels.channels?.slice(0, 5) || []
              })
            }
            break

          case 'onedrive':
            // Fetch recent files from OneDrive
            const onedriveResponse = await fetch('https://graph.microsoft.com/v1.0/me/drive/recent', {
              headers: { 'Authorization': `Bearer ${credentials.accessToken}` }
            })
            if (onedriveResponse.ok) {
              const files = await onedriveResponse.json()
              memory.external.push({
                source: 'onedrive',
                type: 'recent_files',
                data: files.value?.slice(0, 5) || []
              })
            }
            break

          case 'dropbox':
            // Fetch recent files from Dropbox
            const dropboxResponse = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${credentials.accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ path: '', limit: 5 })
            })
            if (dropboxResponse.ok) {
              const files = await dropboxResponse.json()
              memory.external.push({
                source: 'dropbox',
                type: 'recent_files',
                data: files.entries?.slice(0, 5) || []
              })
            }
            break

          case 'airtable':
            // Fetch recent records from Airtable
            const airtableResponse = await fetch('https://api.airtable.com/v0/meta/bases', {
              headers: { 'Authorization': `Bearer ${credentials.accessToken}` }
            })
            if (airtableResponse.ok) {
              const bases = await airtableResponse.json()
              memory.external.push({
                source: 'airtable',
                type: 'bases',
                data: bases.bases?.slice(0, 5) || []
              })
            }
            break

          case 'google-sheets':
            // Fetch recent spreadsheets
            const sheetsResponse = await fetch('https://www.googleapis.com/drive/v3/files?q=mimeType=\'application/vnd.google-apps.spreadsheet\'&orderBy=modifiedTime desc&pageSize=5', {
              headers: { 'Authorization': `Bearer ${credentials.accessToken}` }
            })
            if (sheetsResponse.ok) {
              const spreadsheets = await sheetsResponse.json()
              memory.external.push({
                source: 'google-sheets',
                type: 'recent_spreadsheets',
                data: spreadsheets.files?.slice(0, 5) || []
              })
            }
            break
        }
      } catch (error) {
        console.warn(`Failed to fetch memory for ${integration}:`, error)
      }
    }
  } catch (error) {
    console.error('Error fetching memory:', error)
  }

  return memory
}

/**
 * Executes the AI agent with context and tool calling
 */
export async function executeAIAgent(params: AIAgentParams): Promise<AIAgentResult> {
  try {
    const { userId, config, input, workflowContext } = params
    
    // Check AI usage limits before execution
    const { checkUsageLimit, trackUsage } = await import("@/lib/usageTracking")
    const usageCheck = await checkUsageLimit(userId, "ai_agent")
    if (!usageCheck.allowed) {
      return {
        success: false,
        error: `AI usage limit exceeded. You've used ${usageCheck.current}/${usageCheck.limit} AI agent executions this month. Please upgrade your plan for more AI usage.`
      }
    }
    
    // 1. First process the variable filtering, then resolve templated values
    // Extract and process selected variables before resolving config
    const selectedVariables = config.selectedVariables || {}
    const useStaticValues = config.useStaticValues || {}
    const variableValues = config.variableValues || {}
    let filteredInput = input || {}
    
    // If selectedVariables is configured, filter the input data
    if (Object.keys(selectedVariables).length > 0) {
      filteredInput = {}
      Object.entries(selectedVariables).forEach(([variableName, isSelected]) => {
        if (isSelected) {
          // Check if this variable uses static values
          if (useStaticValues[variableName]) {
            // Use the static value from config
            if (variableValues[variableName] !== undefined) {
              filteredInput[variableName] = variableValues[variableName]
            }
          } else {
            // Use automatic value from input (real trigger/node data)
            if (input && input[variableName] !== undefined) {
              filteredInput[variableName] = input[variableName]
            }
          }
        }
      })
    }
    
    // Now resolve templated values with the filtered input available
    const resolvedConfig = resolveValue(config, { input: filteredInput, ...filteredInput }, config.triggerOutputs)
    
    // 2. Extract parameters
    const {
      inputNodeId,
      memory = 'all-storage',
      memoryIntegration,
      customMemoryIntegrations = [],
      systemPrompt
    } = resolvedConfig

    if (!inputNodeId) {
      return {
        success: false,
        error: "Missing required parameter: inputNodeId"
      }
    }
    
    // 3. Gather context from filtered input (previous node)
    const context: any = {
      goal: `Process and analyze the data from node ${inputNodeId}`,
      input: filteredInput,
      availableData: filteredInput,
      nodeOutputs: filteredInput,
      workflowState: workflowContext?.previousResults || {},
      availableTools: [] // AI Agent can use any available integrations dynamically
    }

    // 4. Fetch memory based on memory configuration
    const memoryContext = await fetchMemory(
      { memory, memoryIntegration, customMemoryIntegrations }, 
      userId
    )

    // 5. Build the AI prompt
    const prompt = buildAIPrompt(context.goal, context, memoryContext, systemPrompt)

    // 6. Execute single step AI processing
    const steps: AIAgentStep[] = []
    let currentContext = { ...context, memory: memoryContext }

    try {
      // Get AI decision for single step
      const aiDecision = await getAIDecision(prompt, currentContext, steps)
      
      // Record the step
      steps.push({
        step: 1,
        action: aiDecision.action,
        tool: aiDecision.tool,
        input: aiDecision.input,
        output: aiDecision.output,
        reasoning: aiDecision.reasoning,
        success: true
      })

    } catch (error: any) {
      steps.push({
        step: 1,
        action: 'error',
        reasoning: 'Failed to process input',
        success: false,
        error: error.message
      })
    }

    // 7. Return results - simplified output format matching the new outputSchema
    const finalOutput = steps[steps.length - 1]?.output || ""
    
    const result = {
      success: true,
      output: {
        output: finalOutput // Single output field as defined in outputSchema
      },
      message: `AI Agent completed ${steps.length} steps to accomplish the goal`,
      steps
    }
    
    // Track AI usage after successful execution
    try {
      await trackUsage(userId, "ai_agent", "agent_execution", 1, {
        steps_completed: steps.length,
        goal: context.goal,
        input_size: Object.keys(input || {}).length
      })
    } catch (trackingError) {
      console.error("Failed to track AI agent usage:", trackingError)
      // Don't fail the execution if tracking fails
    }
    
    return result

  } catch (error: any) {
    console.error("AI Agent execution failed:", error)
    return {
      success: false,
      error: error.message || "AI Agent execution failed"
    }
  }
}

/**
 * Builds the AI prompt with context and memory
 */
function buildAIPrompt(
  goal: string, 
  context: any, 
  memory: MemoryContext, 
  systemPrompt?: string
): string {
  const basePrompt = systemPrompt || `You are an AI agent that can use various tools to accomplish goals. 
You have access to workflow context and can call tools to gather information or perform actions.
Always think step by step and explain your reasoning.`

  const contextSection = `
## Current Context
Goal: ${goal}

## Available Input Data
${JSON.stringify(context.input, null, 2)}

## Memory Context
${memory.external.length > 0 ? 
  `External memory available from: ${memory.external.map(m => m.source).join(', ')}` : 
  'No external memory available'
}

## Instructions
Please process the input data according to the goal and system prompt. Return your analysis or response based on the available information.
`

  return basePrompt + contextSection
}

/**
 * Mock AI decision function - in a real implementation, this would call an LLM service
 */
async function getAIDecision(
  prompt: string, 
  context: any, 
  steps: AIAgentStep[]
): Promise<{
  action: string
  tool?: string
  input?: any
  output: any
  reasoning: string
}> {
  // This is a simplified mock implementation
  // In a real implementation, this would call OpenAI, Claude, or another LLM service
  
  try {
    // For now, return a simple response based on the input data
    const inputData = context.input || {}
    const inputString = JSON.stringify(inputData, null, 2)
    
    // Create a simple response based on the available input
    let output = ""
    if (Object.keys(inputData).length > 0) {
      output = `Processed input data: ${inputString}. Analysis complete.`
    } else {
      output = "No input data available to process."
    }
    
    return {
      action: "process_input",
      output: output,
      reasoning: "Analyzed the provided input data and generated a response based on the available information."
    }
  } catch (error: any) {
    return {
      action: "error",
      output: `Error processing input: ${error.message}`,
      reasoning: "Failed to process the input due to an error."
    }
  }
}