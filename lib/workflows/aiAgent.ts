/**
 * AI Agent Node Implementation
 * 
 * Provides an AI agent that can use other nodes as tools and maintain context
 */

import { getIntegrationCredentials } from "@/lib/integrations/getDecryptedAccessToken"
import { resolveValue } from "@/lib/integrations/resolveValue"

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
 * Fetches memory from connected integrations
 */
export async function fetchMemory(
  toolsAllowed: string[], 
  userId: string
): Promise<MemoryContext> {
  const memory: MemoryContext = {
    shortTerm: [],
    workflowWide: [],
    external: [],
    toolsAvailable: toolsAllowed
  }

  try {
    // Fetch data from allowed integrations
    for (const tool of toolsAllowed) {
      try {
        const credentials = await getIntegrationCredentials(userId, tool)
        if (!credentials) continue

        switch (tool) {
          case 'gmail':
            // Fetch recent emails
            const emailResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10', {
              headers: { 'Authorization': `Bearer ${credentials.accessToken}` }
            })
            if (emailResponse.ok) {
              const emails = await emailResponse.json()
              memory.shortTerm.push({
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
              memory.shortTerm.push({
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
              memory.shortTerm.push({
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
              memory.shortTerm.push({
                source: 'slack',
                type: 'channels',
                data: channels.channels?.slice(0, 5) || []
              })
            }
            break
        }
      } catch (error) {
        console.warn(`Failed to fetch memory for ${tool}:`, error)
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
    
    // 1. Resolve templated values
    const resolvedConfig = resolveValue(config, { input })
    
    // 2. Extract parameters
    const {
      goal,
      toolsAllowed = [],
      memoryScope = 'workflow-wide',
      systemPrompt,
      maxSteps = 5
    } = resolvedConfig

    if (!goal) {
      return {
        success: false,
        error: "Missing required parameter: goal"
      }
    }

    // 3. Gather context
    const context = workflowContext ? 
      await resolveContext(goal, workflowContext.nodes, workflowContext.previousResults) :
      { goal, availableData: {}, nodeOutputs: {}, availableTools: [] }

    // 4. Fetch memory based on scope
    const memory = await fetchMemory(toolsAllowed, userId)

    // 5. Build the AI prompt
    const prompt = buildAIPrompt(goal, context, memory, systemPrompt)

    // 6. Execute AI reasoning and tool calling
    const steps: AIAgentStep[] = []
    let currentContext = { ...context, memory }

    for (let step = 1; step <= maxSteps; step++) {
      try {
        // Get AI decision
        const aiDecision = await getAIDecision(prompt, currentContext, steps)
        
        if (aiDecision.action === 'complete') {
          steps.push({
            step,
            action: 'complete',
            reasoning: aiDecision.reasoning,
            success: true
          })
          break
        }

        // Execute tool if specified
        if (aiDecision.tool) {
          const toolResult = await executeTool(aiDecision.tool, aiDecision.input, userId)
          
          steps.push({
            step,
            action: aiDecision.action,
            tool: aiDecision.tool,
            input: aiDecision.input,
            output: toolResult,
            reasoning: aiDecision.reasoning,
            success: toolResult.success
          })

          // Update context with tool result
          currentContext = {
            ...currentContext,
            lastToolResult: toolResult,
            toolHistory: [...(currentContext.toolHistory || []), toolResult]
          }
        } else {
          steps.push({
            step,
            action: aiDecision.action,
            reasoning: aiDecision.reasoning,
            success: true
          })
        }

      } catch (error: any) {
        steps.push({
          step,
          action: 'error',
          reasoning: 'Failed to execute step',
          success: false,
          error: error.message
        })
        break
      }
    }

    // 7. Return results
    return {
      success: true,
      output: {
        goal,
        stepsCompleted: steps.length,
        finalResult: steps[steps.length - 1]?.output,
        steps,
        context: currentContext
      },
      message: `AI Agent completed ${steps.length} steps to accomplish the goal`,
      steps
    }

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

  const contextSummary = `
GOAL: ${goal}

AVAILABLE TOOLS: ${context.availableTools?.map((t: any) => t.name).join(', ') || 'None'}

WORKFLOW CONTEXT: ${JSON.stringify(context.availableData, null, 2)}

MEMORY CONTEXT: ${JSON.stringify(memory.shortTerm, null, 2)}

INSTRUCTIONS:
1. Analyze the goal and available context
2. Decide what tools to use or if the goal is complete
3. For each step, specify: action, tool (if needed), input (if needed), and reasoning
4. Use the 'complete' action when the goal is achieved
5. Be concise but thorough in your reasoning`

  return `${basePrompt}\n\n${contextSummary}`
}

/**
 * Gets AI decision for next step
 */
async function getAIDecision(
  prompt: string, 
  context: any, 
  previousSteps: AIAgentStep[]
): Promise<{
  action: string
  tool?: string
  input?: any
  reasoning: string
}> {
  // This would integrate with your AI service (OpenAI, Anthropic, etc.)
  // For now, return a mock decision
  return {
    action: 'complete',
    reasoning: 'Goal appears to be achievable with available context and tools'
  }
}

/**
 * Executes a tool (integration action)
 */
async function executeTool(
  toolName: string, 
  input: any, 
  userId: string
): Promise<any> {
  // This would dynamically call the appropriate integration action
  // For now, return a mock result
  return {
    success: true,
    output: { message: `Mock execution of ${toolName}` },
    message: `Tool ${toolName} executed successfully`
  }
} 