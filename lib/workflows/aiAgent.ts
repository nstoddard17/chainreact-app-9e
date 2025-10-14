/**
 * AI Agent Node Implementation
 * 
 * Provides an AI agent that can use other nodes as tools and maintain context
 */

import { getIntegrationCredentials } from "@/lib/integrations/getDecryptedAccessToken"
import { resolveValue } from "@/lib/workflows/actions/core/resolveValue"

import { logger } from '@/lib/utils/logger'

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
  
  logger.debug("🧠 Memory config:", JSON.stringify(memoryConfig, null, 2))
  
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
  
  // Filter out 'ai' from integrations list since it doesn't need external credentials
  integrationsToFetch = integrationsToFetch.filter(integration => integration !== 'ai')
  
  logger.debug("🔍 Integrations to fetch from:", integrationsToFetch)

  try {
    // Fetch data from specified integrations
    for (const integration of integrationsToFetch) {
      try {
        const credentials = await getIntegrationCredentials(userId, integration)
        if (!credentials) {
          logger.debug(`⚠️ Skipping ${integration} - not connected`)
          continue
        }

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
        logger.debug(`⚠️ Skipping ${integration} - not available:`, error.message)
      }
    }
  } catch (error) {
    logger.error('Error fetching memory:', error)
  }

  return memory
}

/**
 * Executes the AI agent with context and tool calling
 */
export async function executeAIAgent(params: AIAgentParams): Promise<AIAgentResult> {
  try {
    const { userId, config, input, workflowContext } = params

    logger.debug("🤖 AI Agent execution started:")
    logger.debug("📋 Config keys:", Object.keys(config || {}))
    logger.debug("📥 Input data keys:", Object.keys(input || {}))
    logger.debug("👤 User ID:", userId)
    logger.debug("🔧 Workflow context:", workflowContext ? "present" : "missing")

    // Check if chains are configured and use chain execution engine
    if (config.chainsLayout?.chains && config.chainsLayout.chains.length > 0) {
      logger.debug("🔗 Chains detected, using chain execution engine")
      const { executeAIAgentWithChains } = await import('./ai/aiAgentWithChains')
      return await executeAIAgentWithChains(params)
    }

    logger.debug("📝 No chains configured, using standard AI agent execution")
    
    // Check AI usage limits before execution
    const { checkUsageLimit, trackUsage } = await import("@/lib/usageTracking")
    const usageCheck = await checkUsageLimit(userId, "ai_agent")
    if (!usageCheck.allowed) {
      logger.debug("❌ AI usage limit exceeded for user:", userId)
      return {
        success: false,
        error: `AI usage limit exceeded. You've used ${usageCheck.current}/${usageCheck.limit} AI agent executions this month. Please upgrade your plan for more AI usage.`
      }
    }
    logger.debug("✅ Usage limit check passed")
    
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
    
    logger.debug("🔍 Filtered input keys:", Object.keys(filteredInput))
    logger.debug("🔍 Selected variables count:", Object.keys(selectedVariables).length)
    logger.debug("🔍 Use static values count:", Object.keys(useStaticValues).length)
    logger.debug("🔍 Variable values count:", Object.keys(variableValues).length)

    // Now resolve templated values with the filtered input available
    const resolvedConfig = resolveValue(config, {
      input: filteredInput,
      ...filteredInput,
      dataFlowManager: input.dataFlowManager,
      nodeOutputs: input.nodeOutputs
    }, config.triggerOutputs)
    logger.debug("🔧 Resolved config keys:", Object.keys(resolvedConfig || {}))
    
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
      goal: input?.message?.content 
        ? `Generate a professional email response to this Discord message: "${input.message.content}"` 
        : `Generate a professional email response based on the data from node ${inputNodeId}`,
      input: Object.keys(filteredInput).length > 0 ? filteredInput : input, // Use original input if filtered is empty
      availableData: Object.keys(filteredInput).length > 0 ? filteredInput : input,
      nodeOutputs: filteredInput,
      workflowState: workflowContext?.previousResults || {},
      availableTools: [], // AI Agent can use any available integrations dynamically
      // Specifically extract Discord message for better context
      discordMessage: input?.message?.content || input?.originalPayload?.content || null,
      triggerData: input?.originalPayload || null
    }

    // 4. Fetch memory based on memory configuration
    const memoryContext = await fetchMemory(
      { memory, memoryIntegration, customMemoryIntegrations }, 
      userId
    )

    // 5. Build the AI prompt
    const prompt = buildAIPrompt(context.goal, context, memoryContext, systemPrompt, workflowContext)

    // 6. Execute single step AI processing
    const steps: AIAgentStep[] = []
    const currentContext = { ...context, memory: memoryContext }

    try {
      // Get AI decision for single step, passing the resolved config
      const aiDecision = await getAIDecision(prompt, currentContext, steps, resolvedConfig)
      
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

    // 7. Return results - dynamic output format based on workflow context
    const finalOutput = steps[steps.length - 1]?.output || ""
    
    // Try to parse as JSON for dynamic outputs, fallback to legacy format
    let dynamicOutputs = {}
    try {
      // Check if the AI response is JSON
      if (finalOutput.trim().startsWith('{') && finalOutput.trim().endsWith('}')) {
        const parsed = JSON.parse(finalOutput)
        
        // If it's wrapped in a "response" object, extract the content
        if (parsed.response && typeof parsed.response === 'object') {
          logger.debug("🔄 Unwrapping nested response object")
          
          // For Discord messages, extract the content
          if (parsed.response.content) {
            dynamicOutputs.discord_message = parsed.response.content
            // Also set email fields if this might be for email
            dynamicOutputs.email_body = parsed.response.content
            dynamicOutputs.email_subject = "Re: Your Message"
          }
        } else {
          // Direct JSON structure as expected
          dynamicOutputs = parsed
          
          // Convert discord_message to email format if needed
          if (parsed.discord_message && !parsed.email_body) {
            logger.debug("🔄 Converting discord_message to email format")
            dynamicOutputs.email_body = parsed.discord_message
            dynamicOutputs.email_subject = "Re: Your Message"
          }
        }
        
        logger.debug("🎯 Parsed dynamic AI outputs:", dynamicOutputs)
      }
      
      // Final fallback: if we have any message-like content but no email_body, create one
      if (!dynamicOutputs.email_body) {
        if (dynamicOutputs.discord_message) {
          dynamicOutputs.email_body = dynamicOutputs.discord_message
          dynamicOutputs.email_subject = "Re: Your Message"
          logger.debug("🔄 Final fallback: Using discord_message as email_body")
        } else if (dynamicOutputs.slack_message) {
          dynamicOutputs.email_body = dynamicOutputs.slack_message  
          dynamicOutputs.email_subject = "Re: Your Message"
          logger.debug("🔄 Final fallback: Using slack_message as email_body")
        }
      }
      
    } catch (error) {
      logger.debug("📝 JSON parsing failed, using raw output")
      // If JSON parsing fails, try to extract content as plain text
      if (finalOutput.includes('"content":') || finalOutput.includes('"discord_message":') || finalOutput.includes('"email_body":')) {
        try {
          // Try to extract discord_message content
          let contentMatch = finalOutput.match(/"discord_message":\s*"([^"]+)"/);
          if (contentMatch) {
            const message = contentMatch[1];
            dynamicOutputs.discord_message = message;
            dynamicOutputs.email_body = message;
            dynamicOutputs.email_subject = "Re: Your Message";
            logger.debug("🔄 Extracted discord_message content:", message);
          } else {
            // Try other content patterns
            contentMatch = finalOutput.match(/"content":\s*"([^"]+)"/);
            if (contentMatch) {
              const message = contentMatch[1];
              dynamicOutputs.discord_message = message;
              dynamicOutputs.email_body = message;
              dynamicOutputs.email_subject = "Re: Your Message";
              logger.debug("🔄 Extracted content from malformed JSON:", message);
            }
          }
        } catch (e) {
          logger.debug("📝 Content extraction also failed");
        }
      }
    }
    
    const result = {
      success: true,
      output: finalOutput, // Complete AI response for "AI Agent Output" variable
      ...dynamicOutputs, // Dynamic outputs from JSON (email_subject, email_body, etc.)
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
      logger.error("Failed to track AI agent usage:", trackingError)
      // Don't fail the execution if tracking fails
    }
    
    return result

  } catch (error: any) {
    logger.error("AI Agent execution failed:", error)
    return {
      success: false,
      error: error.message || "AI Agent execution failed"
    }
  }
}

/**
 * Parse AI response to extract subject and body for email actions
 */
function parseAIResponseForEmail(aiResponse: string, goal: string): { subject: string; body: string } {
  if (!aiResponse) {
    return {
      subject: "Response from AI Assistant",
      body: "No response generated."
    }
  }

  // Try to find a subject line in the AI response
  let subject = ""
  let body = aiResponse

  // Pattern 1: Look for "Subject: ..." at the beginning
  const subjectMatch = aiResponse.match(/^Subject:\s*(.+?)(?:\n|$)/i)
  if (subjectMatch) {
    subject = subjectMatch[1].trim()
    // Remove the subject line from the body
    body = aiResponse.replace(/^Subject:\s*.+?(?:\n|$)/i, '').trim()
  }
  
  // Pattern 2: Look for lines that start with common subject indicators
  else {
    const firstLine = aiResponse.split('\n')[0].trim()
    const subjectIndicators = /^(Re:|Fw:|Fwd:|RE:|FW:|About:|Regarding:)/i
    
    if (subjectIndicators.test(firstLine) && firstLine.length < 100) {
      subject = firstLine
      body = aiResponse.split('\n').slice(1).join('\n').trim()
    }
  }

  // If no subject found, generate one based on content or goal
  if (!subject) {
    if (goal.includes('Discord message')) {
      subject = "Re: Discord Discussion"
    } else if (goal.includes('email')) {
      subject = "Re: Your Email"
    } else {
      // Generate subject from first few words of the response
      const words = body.replace(/\n/g, ' ').split(' ').slice(0, 8)
      subject = words.join(' ')
      if (body.split(' ').length > 8) {
        subject += '...'
      }
      subject = subject || "Response from AI Assistant"
    }
  }

  // Clean up the body - remove signatures, placeholders, and extra whitespace
  body = body
    .replace(/^\n+/, '') // Remove leading newlines
    .replace(/\n+$/, '') // Remove trailing newlines
    .replace(/\n{3,}/g, '\n\n') // Replace 3+ newlines with 2
    
    // Remove common signature patterns
    .replace(/\n\n?(Best regards|Sincerely|Kind regards|Regards|Best|Thank you)[\s\S]*$/i, '')
    .replace(/\n\n?\[Your .*?\][\s\S]*$/i, '') // Remove [Your Name], [Your Position], etc.
    .replace(/\n\n?--[\s\S]*$/i, '') // Remove signature separators
    
    // Remove standalone placeholder lines
    .replace(/\n\[Your .*?\]/gi, '')
    .replace(/\n\[.*? Information\]/gi, '')
    .replace(/\n\[.*? Organization\]/gi, '')
    
    .trim()

  // If body is empty after processing, use the original response but clean it
  if (!body) {
    body = aiResponse
      .replace(/^Subject:\s*.+?(?:\n|$)/i, '') // Remove subject if present
      .replace(/\n\n?(Best regards|Sincerely|Kind regards|Regards|Best|Thank you)[\s\S]*$/i, '')
      .replace(/\[Your .*?\]/gi, '')
      .trim()
  }

  return { subject, body }
}

/**
 * Generate a simple subject line from email body content (legacy function)
 */
function generateSubjectFromBody(body: string): string {
  const words = body.split(' ').slice(0, 8)
  let subject = words.join(' ')
  if (body.split(' ').length > 8) {
    subject += '...'
  }
  return subject || "Re: Your Message"
}

/**
 * Builds the AI prompt with context and memory
 */
function buildAIPrompt(
  goal: string, 
  context: any, 
  memory: MemoryContext, 
  systemPrompt?: string,
  workflowContext?: any
): string {
  const basePrompt = systemPrompt || `You are an AI Agent in a workflow automation platform. Generate context-specific outputs based on the target action type.

CRITICAL: You MUST return ONLY valid JSON with NO additional text, explanations, or formatting.

RESPONSE FORMAT - Choose based on context:

For EMAIL actions, return:
{
  "email_subject": "Re: Your Message",
  "email_body": "Hi there,\n\nThank you for reaching out. I understand your concern and I'm here to help.\n\nBest regards"
}

For SLACK actions, return:
{
  "slack_message": "Thanks for the update! Let me know if you need any help with this."
}

For DISCORD actions, return:
{
  "discord_message": "Hey! I can help with that. What specific issue are you facing?"
}

For NOTION actions, return:
{
  "notion_title": "Meeting Notes - August 16, 2025",
  "notion_content": "## Discussion Points\n\n- Topic 1\n- Topic 2"
}

STRICT REQUIREMENTS:
- Return ONLY valid JSON object, nothing else
- No "Subject:" prefixes or email headers
- No signatures like "Best regards" or "[Your Name]"
- No explanatory text outside the JSON
- Content should be direct and actionable
- Professional but conversational tone`

  // Determine what type of action this is based on the goal/context and workflow context
  let actionType = 'general'
  
  // Check goal content
  if (goal.includes('email') || goal.includes('gmail') || goal.includes('outlook')) {
    actionType = 'email'
  } else if (goal.includes('Discord') || goal.includes('discord')) {
    actionType = 'discord'  
  } else if (goal.includes('Slack') || goal.includes('slack')) {
    actionType = 'slack'
  } else if (goal.includes('Notion') || goal.includes('notion')) {
    actionType = 'notion'
  }
  
  // Also check workflow context if available
  if (workflowContext && workflowContext.nodes) {
    const hasEmailNodes = workflowContext.nodes.some((node: any) => 
      node.data?.type?.includes('gmail') || 
      node.data?.type?.includes('outlook') || 
      node.data?.type?.includes('email')
    )
    const hasDiscordNodes = workflowContext.nodes.some((node: any) => 
      node.data?.type?.includes('discord')
    )
    const hasSlackNodes = workflowContext.nodes.some((node: any) => 
      node.data?.type?.includes('slack')
    )
    
    if (hasEmailNodes && actionType === 'general') actionType = 'email'
    if (hasDiscordNodes && actionType === 'general') actionType = 'discord'
    if (hasSlackNodes && actionType === 'general') actionType = 'slack'
  }

  const contextSection = `
## Current Context
Goal: ${goal}
Action Type: ${actionType}

## Available Input Data
${JSON.stringify(context.input, null, 2)}

## Memory Context
${memory.external.length > 0 ? 
  `External memory available from: ${memory.external.map(m => m.source).join(', ')}` : 
  'No external memory available'
}

## Instructions
Based on the action type "${actionType}", generate the appropriate JSON response format. 
If this is for an EMAIL action, return email_subject and email_body fields.
If this is for DISCORD, return discord_message.
Process the input data and return ONLY the JSON object with no additional text.
`

  return basePrompt + contextSection
}

/**
 * Real AI decision function using OpenAI API
 */
async function getAIDecision(
  prompt: string, 
  context: any, 
  steps: AIAgentStep[],
  config?: any
): Promise<{
  action: string
  tool?: string
  input?: any
  output: any
  reasoning: string
}> {
  try {
    logger.debug("🤖 Making OpenAI API call...")
    logger.debug("📝 Prompt:", prompt)
    logger.debug("🎯 Context:", JSON.stringify(context, null, 2))
    
    // Import OpenAI (dynamic import to avoid issues)
    const { OpenAI } = await import('openai')
    
    // Determine which API key to use
    let apiKey = process.env.OPENAI_API_KEY
    if (config?.apiSource === 'custom' && config?.customApiKey) {
      apiKey = config.customApiKey
      logger.debug("🔑 Using custom API key")
    } else {
      logger.debug("🔑 Using ChainReact API key")
    }
    
    if (!apiKey) {
      throw new Error("No OpenAI API key available. Please configure your API key.")
    }
    
    const openai = new OpenAI({
      apiKey: apiKey,
    })
    
    const inputData = context.input || {}
    const inputKeys = Object.keys(inputData)
    
    // Build context information for the AI
    let contextInfo = ""
    if (inputKeys.length > 0) {
      const dataItems = inputKeys.map(key => {
        const value = inputData[key]
        if (typeof value === 'string' && value.length > 200) {
          return `${key}: "${value.substring(0, 200)}..."`
        } 
          return `${key}: ${JSON.stringify(value)}`
        
      })
      contextInfo = `Available data:\n${dataItems.join('\n')}\n\n`
    }

    // Determine which model to use
    const model = config?.model || 'gpt-4o-mini'
    
    // Map model IDs to OpenAI model names
    const modelMapping: Record<string, string> = {
      'gpt-4o': 'gpt-4o',
      'gpt-4o-mini': 'gpt-4o-mini',
      'gpt-4-turbo': 'gpt-4-turbo-preview',
      'gpt-3.5-turbo': 'gpt-3.5-turbo',
      'claude-3-sonnet': 'gpt-4o-mini', // Fallback for non-OpenAI models
      'claude-3-opus': 'gpt-4o' // Fallback for non-OpenAI models
    }
    
    const actualModel = modelMapping[model] || 'gpt-4o-mini'
    logger.debug(`🤖 Using model: ${actualModel} (from config: ${model})`)
    
    const completion = await openai.chat.completions.create({
      model: actualModel,
      messages: [
        {
          role: 'system',
          content: prompt
        },
        {
          role: 'user',
          content: `${contextInfo}Generate a JSON response in the exact format specified in the system prompt. For email actions, use "email_subject" and "email_body" fields. For Discord, use "discord_message". Return ONLY the JSON object, no explanations or extra text.`
        }
      ],
      max_tokens: config?.maxTokens || 1000,
      temperature: config?.temperature || 0.7
    })

    const aiResponse = completion.choices[0]?.message?.content?.trim()
    logger.debug("✅ OpenAI API response:", aiResponse)

    return {
      action: "analyze_and_respond",
      output: aiResponse || "No response generated",
      reasoning: `Generated response using OpenAI GPT-4o-mini based on ${inputKeys.length} input fields.`
    }
  } catch (error: any) {
    logger.error("❌ OpenAI API Error:", error)
    
    // Fallback to a simple response if OpenAI fails
    const inputData = context.input || {}
    const inputKeys = Object.keys(inputData)
    
    let fallbackOutput = ""
    if (inputKeys.length === 0) {
      fallbackOutput = "No input data provided to analyze."
    } else {
      const dataItems = inputKeys.map(key => {
        const value = inputData[key]
        if (typeof value === 'string' && value.length > 100) {
          return `${key}: "${value.substring(0, 100)}..."`
        } 
          return `${key}: ${JSON.stringify(value)}`
        
      })
      
      fallbackOutput = `AI Analysis completed (fallback mode). I've processed the following data:\n\n${dataItems.join('\n')}\n\nNote: This is a fallback response due to OpenAI API unavailability. Error: ${error.message}`
    }
    
    return {
      action: "analyze_and_respond", 
      output: fallbackOutput,
      reasoning: `Fallback response due to OpenAI error: ${error.message}`
    }
  }
}