/**
 * AI Field Processor
 * 
 * Runtime resolution of AI fields and variables during workflow execution
 */

import { ACTION_METADATA } from './actionMetadata'
import { buildMasterPrompt, buildFieldPrompt, buildActionDiscoveryPrompt } from './masterPromptBuilder'
import { TRIGGER_VARIABLES } from '../variables/triggerVariables'
import { createClient } from '@supabase/supabase-js'

import { logger } from '@/lib/utils/logger'

// Helper to create supabase client inside handlers
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

export interface ProcessingContext {
  userId: string
  workflowId: string
  executionId: string
  nodeId: string
  nodeType: string
  triggerData?: any
  previousNodes?: Map<string, any>
  config: Record<string, any>
  availableActions?: string[]
  apiKey?: string
  model?: string
}

export interface ProcessedResult {
  fields: Record<string, any>
  routing?: {
    selectedPaths: string[]
    confidence: Record<string, number>
    reasoning: string
  }
  cost: number
  tokensUsed: number
}

/**
 * Main entry point for AI field processing
 */
export async function processAIFields(
  context: ProcessingContext
): Promise<ProcessedResult> {
  const result: ProcessedResult = {
    fields: {},
    cost: 0,
    tokensUsed: 0
  }

  // Build context for AI
  const aiContext = buildAIContext(context)
  
  // Track all field resolutions for logging
  const fieldResolutions: any[] = []
  
  // Process each field that needs AI resolution
  for (const [fieldName, fieldValue] of Object.entries(context.config)) {
    if (typeof fieldValue === 'string') {
      // Check if field needs AI processing
      if (fieldValue.includes('{{AI_FIELD:')) {
        // Get field metadata for tracking
        const fieldMetadata = getFieldMetadata(context.nodeType, fieldName)
        
        // Full AI generation for this field
        const generated = await generateFieldValue(
          fieldName,
          aiContext,
          context
        )
        result.fields[fieldName] = generated.value
        result.cost += generated.cost
        result.tokensUsed += generated.tokens
        
        // Track this resolution
        fieldResolutions.push({
          fieldName,
          fieldType: fieldMetadata?.type || 'text',
          originalValue: fieldValue,
          resolvedValue: generated.value,
          availableOptions: fieldMetadata?.constraints?.options || null,
          cost: generated.cost,
          tokensUsed: generated.tokens
        })
      } else if (fieldValue.includes('[') || fieldValue.includes('{{')) {
        // Template with variables to resolve
        const resolved = await resolveTemplate(
          fieldValue,
          aiContext,
          context
        )
        result.fields[fieldName] = resolved.value
        result.cost += resolved.cost
        result.tokensUsed += resolved.tokens
        
        // Track template resolution if it used AI
        if (resolved.cost > 0) {
          fieldResolutions.push({
            fieldName,
            fieldType: 'template',
            originalValue: fieldValue,
            resolvedValue: resolved.value,
            cost: resolved.cost,
            tokensUsed: resolved.tokens
          })
        }
      } else {
        // Static value, no processing needed
        result.fields[fieldName] = fieldValue
      }
    } else {
      // Non-string field, pass through
      result.fields[fieldName] = fieldValue
    }
  }

  // If this is an AI Router node, handle routing decision
  if (context.nodeType === 'ai_router' && context.availableActions) {
    const routingDecision = await makeRoutingDecision(
      aiContext,
      context
    )
    result.routing = routingDecision.routing
    result.cost += routingDecision.cost
    result.tokensUsed += routingDecision.tokens
  }

  // Log AI usage and field resolutions
  await logAIUsage(context, result)
  
  // Log individual field resolutions
  if (fieldResolutions.length > 0) {
    await logFieldResolutions(context, fieldResolutions, aiContext)
  }

  return result
}

/**
 * Build context object with all available data
 */
function buildAIContext(context: ProcessingContext): Record<string, any> {
  const aiContext: Record<string, any> = {}

  // Add trigger data if available
  if (context.triggerData) {
    aiContext.trigger = context.triggerData
  }

  // Add previous node outputs
  if (context.previousNodes) {
    aiContext.nodes = {}
    for (const [nodeId, nodeData] of context.previousNodes.entries()) {
      aiContext.nodes[nodeId] = nodeData
    }
  }

  // Add workflow metadata
  aiContext.workflow = {
    id: context.workflowId,
    executionId: context.executionId,
    currentNode: context.nodeId
  }

  // Add timestamp
  aiContext.timestamp = new Date().toISOString()

  return aiContext
}

/**
 * Generate a complete field value using AI
 */
async function generateFieldValue(
  fieldName: string,
  aiContext: Record<string, any>,
  context: ProcessingContext
): Promise<{ value: any, cost: number, tokens: number }> {
  // Get field metadata if available
  const fieldMetadata = getFieldMetadata(context.nodeType, fieldName)
  
  // Build prompt for field generation
  const prompt = buildFieldPrompt(
    fieldName,
    fieldMetadata?.type || 'text',
    fieldMetadata?.constraints || {},
    aiContext
  )

  // Call AI model
  const response = await callAIModel(
    prompt,
    context.model || 'gpt-3.5-turbo',
    context.apiKey
  )

  // Parse and validate response
  let value = response.text
  
  // Type conversion based on field type
  if (fieldMetadata?.type === 'number') {
    value = parseFloat(value) || 0
  } else if (fieldMetadata?.type === 'boolean') {
    value = value.toLowerCase() === 'true'
  } else if (fieldMetadata?.type === 'array') {
    try {
      value = JSON.parse(value)
    } catch {
      value = [value]
    }
  }

  return {
    value,
    cost: response.cost,
    tokens: response.tokens
  }
}

/**
 * Resolve a template with variables
 */
async function resolveTemplate(
  template: string,
  aiContext: Record<string, any>,
  context: ProcessingContext
): Promise<{ value: string, cost: number, tokens: number }> {
  let resolvedTemplate = template
  let totalCost = 0
  let totalTokens = 0

  // Resolve simple variables like [name], [email], [subject]
  const simpleVarPattern = /\[([^\]]+)\]/g
  const simpleVarMatches = [...template.matchAll(simpleVarPattern)]
  
  for (const match of simpleVarMatches) {
    const varName = match[1]
    const value = extractVariable(varName, aiContext)
    if (value !== undefined) {
      resolvedTemplate = resolvedTemplate.replace(match[0], String(value))
    }
  }

  // Resolve complex variables like {{trigger.discord.username}}
  const complexVarPattern = /\{\{([^}]+)\}\}/g
  const complexVarMatches = [...resolvedTemplate.matchAll(complexVarPattern)]
  
  for (const match of complexVarMatches) {
    const varPath = match[1]
    
    // Check if it's an AI instruction
    if (varPath.startsWith('AI:')) {
      const instruction = varPath.substring(3)
      const response = await executeAIInstruction(
        instruction,
        aiContext,
        context
      )
      resolvedTemplate = resolvedTemplate.replace(match[0], response.text)
      totalCost += response.cost
      totalTokens += response.tokens
    } else {
      // Regular path variable
      const value = resolveVariablePath(varPath, aiContext)
      if (value !== undefined) {
        resolvedTemplate = resolvedTemplate.replace(match[0], String(value))
      }
    }
  }

  return {
    value: resolvedTemplate,
    cost: totalCost,
    tokens: totalTokens
  }
}

/**
 * Extract simple variable from context
 */
function extractVariable(varName: string, context: Record<string, any>): any {
  // Common variable mappings
  const mappings: Record<string, string> = {
    'name': 'trigger.email.sender_name||trigger.discord.author.username||trigger.slack.username',
    'email': 'trigger.email.from||trigger.form.user_email',
    'subject': 'trigger.email.subject||trigger.form.form_name',
    'message': 'trigger.email.body||trigger.discord.content||trigger.slack.text',
    'username': 'trigger.discord.author.username||trigger.slack.username',
    'channel': 'trigger.discord.channel.name||trigger.slack.channel_name',
    'sender_name': 'trigger.email.sender_name||trigger.form.user_name'
  }

  const paths = mappings[varName.toLowerCase()]
  if (paths) {
    for (const path of paths.split('||')) {
      const value = resolveVariablePath(path, context)
      if (value !== undefined) return value
    }
  }

  // Try direct path
  return resolveVariablePath(varName, context)
}

/**
 * Resolve a variable path like "trigger.email.from"
 */
function resolveVariablePath(path: string, context: Record<string, any>): any {
  const parts = path.split('.')
  let value = context
  
  for (const part of parts) {
    if (value && typeof value === 'object') {
      value = value[part]
    } else {
      return undefined
    }
  }
  
  return value
}

/**
 * Execute an AI instruction like "summarize" or "extract_key_points"
 */
async function executeAIInstruction(
  instruction: string,
  context: Record<string, any>,
  processContext: ProcessingContext
): Promise<{ text: string, cost: number, tokens: number }> {
  // Build instruction prompt
  const instructionPrompts: Record<string, string> = {
    'summarize': 'Summarize the following content in 2-3 sentences',
    'extract_key_points': 'Extract the key points from the following content as bullet points',
    'generate_response': 'Generate an appropriate response to the following message',
    'assess_priority': 'Assess the priority level (high/medium/low) based on the content',
    'categorize': 'Categorize this content into the most appropriate category',
    'format_professionally': 'Reformat the following content in a professional tone',
    'casual_greeting': 'Generate a casual, friendly greeting',
    'next_steps': 'Suggest the next steps based on the context'
  }

  const basePrompt = instructionPrompts[instruction] || `Execute instruction: ${instruction}`
  const fullPrompt = `${basePrompt}:\n\n${JSON.stringify(context, null, 2)}`

  return callAIModel(
    fullPrompt,
    processContext.model || 'gpt-3.5-turbo',
    processContext.apiKey
  )
}

/**
 * Make routing decision for AI Router node
 */
async function makeRoutingDecision(
  context: Record<string, any>,
  processContext: ProcessingContext
): Promise<{ routing: any, cost: number, tokens: number }> {
  // Build routing prompt
  const promptContext = {
    template: processContext.config.template,
    availableActions: processContext.availableActions || [],
    workflowContext: {
      name: processContext.config.workflowName,
      description: processContext.config.workflowDescription
    }
  }

  const masterPrompt = buildMasterPrompt(promptContext)
  
  // Add current context
  const fullPrompt = `${masterPrompt.full}\n\nCURRENT INPUT:\n${JSON.stringify(context, null, 2)}\n\nProvide routing decision in JSON format.`

  const response = await callAIModel(
    fullPrompt,
    processContext.model || 'gpt-4-turbo',
    processContext.apiKey
  )

  // Parse routing decision
  let routing
  try {
    routing = JSON.parse(response.text)
  } catch {
    // Fallback if parsing fails
    routing = {
      selectedPaths: ['default'],
      confidence: { default: 0.5 },
      reasoning: 'Failed to parse AI response'
    }
  }

  return {
    routing,
    cost: response.cost,
    tokens: response.tokens
  }
}

/**
 * Get field metadata from node type
 */
function getFieldMetadata(nodeType: string, fieldName: string): any {
  try {
    // Import ALL_NODE_COMPONENTS synchronously (already imported at build time)
    const { ALL_NODE_COMPONENTS } = require('@/lib/workflows/nodes')
    
    // Find the node component
    const nodeComponent = ALL_NODE_COMPONENTS.find((c: any) => c.type === nodeType)
    if (!nodeComponent || !nodeComponent.configSchema) {
      return { type: 'text', constraints: {} }
    }
    
    // Find the field schema
    const fieldSchema = nodeComponent.configSchema.find((f: any) => f.name === fieldName)
    if (!fieldSchema) {
      return { type: 'text', constraints: {} }
    }
    
    // Build constraints including dropdown options
    const constraints: any = {
      required: fieldSchema.required || false,
      maxLength: fieldSchema.maxLength,
      format: fieldSchema.format
    }
    
    // Include options for dropdowns/selects
    if (fieldSchema.options) {
      // Static options defined in schema
      constraints.options = fieldSchema.options.map((opt: any) => 
        typeof opt === 'string' ? opt : opt.value
      )
    } else if (fieldSchema.dynamic) {
      // For dynamic fields, mark that options need to be loaded
      constraints.isDynamic = true
      constraints.dataType = fieldSchema.dataType
      // The options will be loaded at runtime from the actual dropdown values
    }
    
    return {
      type: fieldSchema.type || 'text',
      label: fieldSchema.label || fieldName,
      constraints
    }
  } catch (error) {
    logger.error(`Error getting field metadata for ${nodeType}.${fieldName}:`, error)
    // Fallback to basic metadata
    const fieldTypes: Record<string, any> = {
      'to': { type: 'email', constraints: { required: true } },
      'subject': { type: 'text', constraints: { maxLength: 200 } },
      'body': { type: 'text', constraints: {} },
      'channel': { type: 'text', constraints: { pattern: '^#.*' } },
      'priority': { type: 'number', constraints: { min: 1, max: 10 } }
    }
    
    return fieldTypes[fieldName] || { type: 'text', constraints: {} }
  }
}

/**
 * Call AI model (OpenAI, Anthropic, etc.)
 */
async function callAIModel(
  prompt: string,
  model: string,
  apiKey?: string
): Promise<{ text: string, cost: number, tokens: number }> {
  // Model pricing per 1K tokens
  const pricing: Record<string, { input: number, output: number }> = {
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
    'claude-3-opus': { input: 0.015, output: 0.075 },
    'claude-3-sonnet': { input: 0.003, output: 0.015 }
  }

  try {
    // Use custom API key if provided, otherwise use ChainReact's
    const effectiveApiKey = apiKey || process.env.OPENAI_API_KEY
    
    // Call OpenAI API (simplified - would use proper client in production)
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${effectiveApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are ChainReact AI, an intelligent workflow automation assistant.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    })

    const data = await response.json()
    
    if (!response.ok) {
      throw new Error(data.error?.message || 'AI model call failed')
    }

    const text = data.choices[0].message.content
    const usage = data.usage
    
    // Calculate cost
    const modelPricing = pricing[model] || pricing['gpt-3.5-turbo']
    const inputCost = (usage.prompt_tokens / 1000) * modelPricing.input
    const outputCost = (usage.completion_tokens / 1000) * modelPricing.output
    const totalCost = inputCost + outputCost

    return {
      text,
      cost: totalCost,
      tokens: usage.total_tokens
    }
  } catch (error) {
    logger.error('AI model call failed:', error)
    
    // Return fallback
    return {
      text: '',
      cost: 0,
      tokens: 0
    }
  }
}

/**
 * Log AI usage for tracking and billing
 */
async function logAIUsage(
  context: ProcessingContext,
  result: ProcessedResult
): Promise<void> {
  try {
    await getSupabase().from('ai_cost_logs').insert({
      user_id: context.userId,
      workflow_id: context.workflowId,
      execution_id: context.executionId,
      node_id: context.nodeId,
      feature: 'ai_field_automation',
      model: context.model || 'gpt-3.5-turbo',
      prompt_tokens: Math.floor(result.tokensUsed * 0.7), // Estimate
      completion_tokens: Math.floor(result.tokensUsed * 0.3), // Estimate
      total_tokens: result.tokensUsed,
      cost: result.cost,
      is_custom_key: !!context.apiKey
    })

    // If routing decision was made, log it
    if (result.routing) {
      await getSupabase().from('ai_routing_decisions').insert({
        workflow_id: context.workflowId,
        execution_id: context.executionId,
        node_id: context.nodeId,
        user_id: context.userId,
        input_data: buildAIContext(context),
        selected_paths: result.routing.selectedPaths,
        confidence_scores: result.routing.confidence,
        reasoning: result.routing.reasoning,
        cost: result.cost
      })
    }
  } catch (error) {
    logger.error('Failed to log AI usage:', error)
  }
}

/**
 * Log individual field resolutions for tracking and display
 */
async function logFieldResolutions(
  context: ProcessingContext,
  resolutions: any[],
  aiContext: Record<string, any>
): Promise<void> {
  try {
    // Get node label if available
    let nodeLabel = context.nodeType
    try {
      const { ALL_NODE_COMPONENTS } = require('@/lib/workflows/nodes')
      const nodeComponent = ALL_NODE_COMPONENTS.find((c: any) => c.type === context.nodeType)
      if (nodeComponent) {
        nodeLabel = nodeComponent.label || nodeComponent.name || context.nodeType
      }
    } catch (e) {
      // Use nodeType as fallback
    }
    
    // Prepare batch insert data
    const insertData = resolutions.map(resolution => ({
      execution_id: context.executionId,
      workflow_id: context.workflowId,
      user_id: context.userId,
      node_id: context.nodeId,
      node_type: context.nodeType,
      node_label: nodeLabel,
      field_name: resolution.fieldName,
      field_type: resolution.fieldType,
      original_value: resolution.originalValue,
      resolved_value: String(resolution.resolvedValue),
      available_options: resolution.availableOptions ? { options: resolution.availableOptions } : null,
      resolution_context: aiContext,
      resolution_reasoning: resolution.reasoning || null,
      tokens_used: resolution.tokensUsed || 0,
      cost: resolution.cost || 0,
      model: context.model || 'gpt-3.5-turbo',
      resolved_at: new Date().toISOString()
    }))
    
    // Insert all field resolutions
    const { error } = await getSupabase()
      .from('ai_field_resolutions')
      .insert(insertData)

    if (error) {
      logger.error('Failed to log field resolutions:', error)
    } else {
      logger.debug(`Logged ${resolutions.length} AI field resolutions for node ${context.nodeId}`)
    }
  } catch (error) {
    logger.error('Error logging field resolutions:', error)
  }
}

/**
 * Discover appropriate actions based on user intent
 */
export async function discoverActions(
  userIntent: string,
  availableActions: string[],
  context: ProcessingContext
): Promise<{ actions: string[], confidence: Record<string, number>, cost: number }> {
  const prompt = buildActionDiscoveryPrompt(userIntent, availableActions)
  
  const response = await callAIModel(
    prompt,
    context.model || 'gpt-4-turbo',
    context.apiKey
  )

  try {
    const result = JSON.parse(response.text)
    return {
      actions: result.actions || [],
      confidence: result.confidence || {},
      cost: response.cost
    }
  } catch {
    return {
      actions: [],
      confidence: {},
      cost: response.cost
    }
  }
}