/**
 * Autonomous AI Agent Action Handler
 *
 * This AI agent is fully autonomous - it automatically:
 * 1. Detects connected output paths and workflow chains
 * 2. Analyzes input data and user prompt
 * 3. Decides if it needs to generate content for downstream nodes
 * 4. Determines which path to route to (if multiple paths exist)
 * 5. Executes intelligently without requiring mode selection
 */

import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { logger } from '@/lib/utils/logger'
import type { ActionResult } from './core/executeWait'
import type { ExecutionContext } from '../core/executeWorkflow'
import { resolveValue } from './core/resolveValue'

// Initialize AI clients (lazy loaded when needed)
let openaiClient: OpenAI | null = null
let anthropicClient: Anthropic | null = null

function getOpenAIClient(apiKey?: string): OpenAI {
  if (apiKey) {
    return new OpenAI({ apiKey })
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openaiClient
}

function getAnthropicClient(apiKey?: string): Anthropic {
  if (apiKey) {
    return new Anthropic({ apiKey })
  }
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return anthropicClient
}

/**
 * Main Autonomous AI Agent Handler
 *
 * This agent automatically decides what to do based on:
 * - Connected output paths (single vs multiple)
 * - Downstream node requirements
 * - Input data and user prompt
 * - Output format hints
 */
export async function executeAIAgentAction(
  config: any,
  input: Record<string, any>,
  context: ExecutionContext
): Promise<ActionResult> {
  const startTime = Date.now()

  logger.info('[AI Agent] Starting autonomous execution', {
    model: config.model,
    nodeId: context.nodeId,
    hasMultipleOutputs: context.hasMultipleOutputs
  })

  try {
    // Step 1: Analyze workflow context
    const workflowContext = analyzeWorkflowContext(context, config)

    logger.debug('[AI Agent] Workflow context analyzed', {
      needsContentGeneration: workflowContext.needsContentGeneration,
      needsRouting: workflowContext.needsRouting,
      outputPathCount: workflowContext.outputPaths?.length || 0
    })

    // Step 2: Resolve user prompt with variables
    const userPrompt = await resolveValue(config.prompt, input, context.userId, context)

    // Step 3: Build additional context from previous steps
    let additionalContext = ''
    if (config.includeContextFrom && config.includeContextFrom.length > 0) {
      additionalContext = buildAdditionalContext(config.includeContextFrom, context)
    }

    // Step 4: Build intelligent system prompt based on context
    const systemPrompt = buildAutonomousSystemPrompt(workflowContext, config)

    // Step 5: Build enhanced user prompt with all context
    const enhancedPrompt = buildEnhancedUserPrompt(
      userPrompt,
      additionalContext,
      workflowContext,
      input,
      config
    )

    // Step 6: Execute AI with autonomous decision-making
    const response = await generateWithAI(
      config,
      systemPrompt,
      enhancedPrompt,
      workflowContext
    )

    // Step 7: Parse and structure the response
    const result = parseAutonomousResponse(response, workflowContext, config)

    // Step 8: Add execution metadata
    const executionTime = Date.now() - startTime
    result.data = {
      ...result.data,
      executionTime,
      modelUsed: config.model,
      autonomous: true,
      context: {
        needsContentGeneration: workflowContext.needsContentGeneration,
        needsRouting: workflowContext.needsRouting
      }
    }

    logger.info('[AI Agent] Autonomous execution completed', {
      executionTime,
      success: result.success,
      hasOutput: !!result.data.output,
      selectedPath: result.data.selectedPath
    })

    return result

  } catch (error: any) {
    logger.error('[AI Agent] Autonomous execution failed', {
      error: error.message,
      nodeId: context.nodeId
    })

    return {
      success: false,
      data: {
        error: error.message,
        executionTime: Date.now() - startTime
      }
    }
  }
}

/**
 * ========================================
 * AUTONOMOUS WORKFLOW ANALYSIS
 * ========================================
 */

interface WorkflowContext {
  needsContentGeneration: boolean
  needsRouting: boolean
  outputPaths?: Array<{ id: string; name: string; description?: string }>
  downstreamNodeTypes?: string[]
  hasMultipleOutputs: boolean
}

/**
 * Analyze the workflow to determine what the AI needs to do
 */
function analyzeWorkflowContext(context: ExecutionContext, config: any): WorkflowContext {
  const workflowContext: WorkflowContext = {
    needsContentGeneration: false,
    needsRouting: false,
    hasMultipleOutputs: false
  }

  // Check if there are multiple output paths
  // This would come from the workflow graph analysis
  // For now, we'll use a simple heuristic based on config
  const hasOutputPaths = config.outputPaths && config.outputPaths.length > 1

  if (hasOutputPaths) {
    workflowContext.needsRouting = true
    workflowContext.hasMultipleOutputs = true
    workflowContext.outputPaths = config.outputPaths
  }

  // Check if output format hint suggests content generation is needed
  const hasOutputFormat = config.outputFormat && config.outputFormat.trim().length > 0

  // Always assume content generation is needed unless we're ONLY routing
  // The AI can decide not to generate if it's purely a routing decision
  workflowContext.needsContentGeneration = true

  return workflowContext
}

/**
 * Build an intelligent system prompt based on workflow context
 */
function buildAutonomousSystemPrompt(workflowContext: WorkflowContext, config: any): string {
  let systemPrompt = `You are an intelligent workflow automation agent. You analyze inputs and autonomously decide what actions to take.

CORE CAPABILITIES:
1. Content Generation - Create messages, emails, summaries, responses, etc.
2. Data Extraction - Extract structured information from unstructured data
3. Decision Making - Analyze content and make routing decisions
4. Multi-tasking - Generate content AND make routing decisions in one step

YOUR TASK:`

  // Add context-specific instructions
  if (workflowContext.needsContentGeneration && workflowContext.needsRouting) {
    systemPrompt += `
You need to BOTH generate content AND decide which path to route to.

ROUTING OPTIONS:
${workflowContext.outputPaths?.map(path =>
  `- ${path.name} (id: ${path.id})${path.description ? ': ' + path.description : ''}`
).join('\n') || 'No paths defined'}

Your response should include:
1. Generated content (if needed for downstream nodes)
2. Routing decision with reasoning
3. Structured data extraction (if output format specified)`

  } else if (workflowContext.needsRouting) {
    systemPrompt += `
You need to analyze the input and decide which workflow path to take.

ROUTING OPTIONS:
${workflowContext.outputPaths?.map(path =>
  `- ${path.name} (id: ${path.id})${path.description ? ': ' + path.description : ''}`
).join('\n') || 'No paths defined'}

Your response should include:
1. Routing decision (selectedPath)
2. Confidence score (0-1)
3. Reasoning for your decision`

  } else {
    systemPrompt += `
You need to generate appropriate content based on the user's request.

Your response should include:
1. Generated content
2. Structured data extraction (if output format specified)`
  }

  // Add user's custom instructions if provided
  if (config.systemInstructions) {
    systemPrompt += `\n\nADDITIONAL INSTRUCTIONS:\n${config.systemInstructions}`
  }

  // Add output format guidance
  if (config.outputFormat) {
    systemPrompt += `\n\nOUTPUT FORMAT:
Extract or generate the following structured data:
${config.outputFormat}

Provide these as structured fields in your response.`
  }

  systemPrompt += `\n\nREMEMBER:
- Be autonomous - decide what needs to be done based on the context
- Always provide reasoning for decisions
- Generate content only if it adds value
- Structure your output clearly
- Use the input data intelligently`

  return systemPrompt
}

/**
 * Build enhanced user prompt with all context
 */
function buildEnhancedUserPrompt(
  userPrompt: string,
  additionalContext: string,
  workflowContext: WorkflowContext,
  input: Record<string, any>,
  config: any
): string {
  let prompt = `USER REQUEST:\n${userPrompt}\n`

  // Add input data
  if (Object.keys(input).length > 0) {
    prompt += `\nINPUT DATA:\n${JSON.stringify(input, null, 2)}\n`
  }

  // Add additional context from previous steps
  if (additionalContext) {
    prompt += `\nCONTEXT FROM PREVIOUS STEPS:\n${additionalContext}\n`
  }

  // Add routing context if needed
  if (workflowContext.needsRouting && workflowContext.outputPaths) {
    prompt += `\nAVAILABLE PATHS:\n${workflowContext.outputPaths.map((path, idx) =>
      `${idx + 1}. ${path.name}${path.description ? ' - ' + path.description : ''}`
    ).join('\n')}\n`
  }

  // Add instructions for response format
  prompt += `\nRESPONSE FORMAT:`

  if (workflowContext.needsContentGeneration && workflowContext.needsRouting) {
    prompt += `
Provide your response as JSON with:
{
  "output": "your generated content here",
  "data": { structured fields based on output format },
  "selectedPath": "path_id",
  "confidence": 0.8,
  "reasoning": "why you chose this path"
}`
  } else if (workflowContext.needsRouting) {
    prompt += `
Provide your response as JSON with:
{
  "selectedPath": "path_id",
  "confidence": 0.8,
  "reasoning": "why you chose this path",
  "classification": "category",
  "sentiment": "positive/neutral/negative"
}`
  } else {
    prompt += `
Provide your response with the content and any structured data requested.`
  }

  return prompt
}

/**
 * ========================================
 * AI GENERATION
 * ========================================
 */

/**
 * Generate content with AI (OpenAI or Anthropic)
 * Handles both generation and routing decisions autonomously
 */
async function generateWithAI(
  config: any,
  systemPrompt: string,
  userPrompt: string,
  workflowContext: WorkflowContext
): Promise<{ content: string; tokensUsed: number; costIncurred: number }> {
  const model = config.model || 'gpt-4o-mini'
  const temperature = config.temperature ?? 0.7
  const maxTokens = config.maxTokens || 1500

  // Determine API source
  const apiKey = config.apiSource === 'custom' ? config.customApiKey : undefined

  // Force JSON for routing or hybrid modes
  const needsJson = workflowContext.needsRouting

  // Use OpenAI for GPT models
  if (model.startsWith('gpt-')) {
    const client = getOpenAIClient(apiKey)

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = []
    messages.push({ role: 'system', content: systemPrompt })
    messages.push({ role: 'user', content: userPrompt })

    const params: any = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens
    }

    if (needsJson) {
      params.response_format = { type: 'json_object' }
    }

    const response = await client.chat.completions.create(params)

    const content = response.choices[0]?.message?.content || ''
    const tokensUsed = response.usage?.total_tokens || 0
    const costIncurred = calculateCost(model, tokensUsed)

    return { content, tokensUsed, costIncurred }
  }

  // Use Anthropic for Claude models
  if (model.startsWith('claude-')) {
    const client = getAnthropicClient(apiKey)

    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })

    const content = response.content[0].type === 'text' ? response.content[0].text : ''
    const tokensUsed = response.usage.input_tokens + response.usage.output_tokens
    const costIncurred = calculateCost(model, tokensUsed)

    return { content, tokensUsed, costIncurred }
  }

  throw new Error(`Unsupported model: ${model}`)
}

/**
 * Parse autonomous AI response based on workflow context
 */
function parseAutonomousResponse(
  response: { content: string; tokensUsed: number; costIncurred: number },
  workflowContext: WorkflowContext,
  config: any
): ActionResult {
  const { content, tokensUsed, costIncurred } = response

  // Try to parse as JSON first (for routing or hybrid modes)
  let parsedContent: any = null
  try {
    parsedContent = JSON.parse(content)
  } catch {
    // Not JSON, treat as plain text
  }

  const result: ActionResult = {
    success: true,
    data: {
      tokensUsed,
      costIncurred
    }
  }

  // If we have structured JSON response
  if (parsedContent && typeof parsedContent === 'object') {
    // Extract content generation outputs
    if (parsedContent.output) {
      result.data.output = parsedContent.output
    }

    if (parsedContent.data) {
      result.data.structured_output = parsedContent.data
    } else if (parsedContent.structured_output) {
      result.data.structured_output = parsedContent.structured_output
    }

    // Extract routing outputs
    if (parsedContent.selectedPath) {
      result.data.selectedPath = parsedContent.selectedPath
      result.data.selectedPaths = [parsedContent.selectedPath]
      result.nextNodeId = parsedContent.selectedPath
    }

    if (parsedContent.confidence !== undefined) {
      result.data.confidence = parsedContent.confidence
    }

    if (parsedContent.reasoning) {
      result.data.reasoning = parsedContent.reasoning
    }

    if (parsedContent.classification) {
      result.data.classification = parsedContent.classification
    }

    if (parsedContent.sentiment) {
      result.data.sentiment = parsedContent.sentiment
    }

    if (parsedContent.urgency) {
      result.data.urgency = parsedContent.urgency
    }
  } else {
    // Plain text response - treat as generated content
    result.data.output = content

    // Try to extract structured fields if output format is specified
    if (config.outputFormat) {
      const outputFields = parseOutputFields(config.outputFormat)
      if (outputFields.length > 0) {
        result.data.structured_output = extractStructuredFields(content, outputFields)
      }
    }
  }

  // Validate routing if needed
  if (workflowContext.needsRouting && !result.data.selectedPath) {
    // AI didn't provide a routing decision - use fallback
    const fallbackPath = workflowContext.outputPaths?.[0]
    if (fallbackPath) {
      result.data.selectedPath = fallbackPath.id
      result.data.selectedPaths = [fallbackPath.id]
      result.nextNodeId = fallbackPath.id
      result.data.confidence = 0.5
      result.data.reasoning = 'Fallback: AI did not provide explicit routing decision'
    }
  }

  return result
}

/**
 * ========================================
 * HELPER FUNCTIONS
 * ========================================
 */

function parseOutputFields(fieldsText: string | undefined): Array<{ name: string; description: string }> {
  if (!fieldsText) return []

  return fieldsText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && line.includes('|'))
    .map(line => {
      const [name, description] = line.split('|').map(s => s.trim())
      return { name, description }
    })
}

function extractStructuredFields(
  content: string,
  fields: Array<{ name: string; description: string }>
): Record<string, any> {
  const result: Record<string, any> = {}

  // Try to parse as JSON first
  try {
    const parsed = JSON.parse(content)
    fields.forEach(field => {
      if (parsed[field.name] !== undefined) {
        result[field.name] = parsed[field.name]
      }
    })
    return result
  } catch {
    // Not JSON, try text extraction
  }

  // Extract from markdown-style format
  fields.forEach(field => {
    const regex = new RegExp(`${field.name}:\\s*(.+?)(?=\\n\\w+:|$)`, 'is')
    const match = content.match(regex)
    if (match) {
      result[field.name] = match[1].trim()
    }
  })

  return result
}

/**
 * Build context from previous workflow nodes
 */
function buildAdditionalContext(nodeIds: string[], context: ExecutionContext): string {
  if (!nodeIds || nodeIds.length === 0) return ''

  const contextParts: string[] = []

  for (const nodeId of nodeIds) {
    const nodeResult = context.results?.[nodeId]
    if (nodeResult) {
      contextParts.push(`[${nodeId}]: ${JSON.stringify(nodeResult, null, 2)}`)
    }
  }

  return contextParts.join('\n\n')
}

function calculateCost(model: string, tokens: number): number {
  // Simplified cost calculation (update with actual pricing)
  const costPer1kTokens: Record<string, number> = {
    'gpt-4o': 0.005,
    'gpt-4o-mini': 0.0002,
    'gpt-4-turbo': 0.01,
    'gpt-3.5-turbo': 0.0015,
    'claude-3-opus': 0.015,
    'claude-3-sonnet': 0.003,
    'claude-3-haiku': 0.00025
  }

  const rate = costPer1kTokens[model] || 0.002
  return (tokens / 1000) * rate
}
