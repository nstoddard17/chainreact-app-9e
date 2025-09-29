/**
 * AI Field Processor
 *
 * Handles processing of AI placeholder fields ({{AI_FIELD:fieldName}})
 * in workflow configurations, generating values dynamically using AI
 */

import { OpenAI } from 'openai'

export interface AIFieldContext {
  fieldName: string
  fieldType?: string
  nodeType?: string
  workflowContext?: any
  triggerData?: any
  previousOutputs?: any
}

export interface AIFieldResult {
  fieldName: string
  value: any
  generated: boolean
  error?: string
}

/**
 * Check if a value contains AI field placeholders
 */
export function hasAIPlaceholders(value: any): boolean {
  if (typeof value !== 'string') return false
  return /\{\{AI_FIELD:[^}]+\}\}/.test(value)
}

/**
 * Extract AI field placeholders from a value
 */
export function extractAIPlaceholders(value: string): string[] {
  const matches = value.match(/\{\{AI_FIELD:([^}]+)\}\}/g)
  if (!matches) return []

  return matches.map(match => {
    const fieldName = match.match(/\{\{AI_FIELD:([^}]+)\}\}/)?.[1]
    return fieldName || ''
  }).filter(Boolean)
}

/**
 * Process a single AI field placeholder
 */
export async function processAIField(
  context: AIFieldContext,
  apiKey?: string
): Promise<AIFieldResult> {
  const { fieldName, fieldType, nodeType, workflowContext, triggerData, previousOutputs } = context

  try {
    // Use provided API key or fall back to environment
    const openaiKey = apiKey || process.env.OPENAI_API_KEY
    if (!openaiKey) {
      throw new Error('No OpenAI API key available for AI field generation')
    }

    const openai = new OpenAI({ apiKey: openaiKey })

    // Build context-aware prompt for field generation
    const prompt = buildFieldPrompt(fieldName, fieldType, nodeType, {
      workflow: workflowContext,
      trigger: triggerData,
      previous: previousOutputs
    })

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an AI assistant that generates appropriate values for workflow fields.

          IMPORTANT RULES:
          - Return ONLY the field value, no explanations or formatting
          - For text fields: return plain text
          - For numbers: return only the number
          - For booleans: return only "true" or "false"
          - For arrays: return JSON array format
          - For objects: return JSON object format
          - Be concise and relevant to the field purpose`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 500,
      temperature: 0.7
    })

    const generatedValue = completion.choices[0]?.message?.content?.trim()

    // Parse the value based on expected type
    let parsedValue = generatedValue
    if (fieldType === 'number') {
      parsedValue = parseFloat(generatedValue || '0')
    } else if (fieldType === 'boolean') {
      parsedValue = generatedValue?.toLowerCase() === 'true'
    } else if (fieldType === 'array' || fieldType === 'object') {
      try {
        parsedValue = JSON.parse(generatedValue || '{}')
      } catch {
        // If parsing fails, return as string
        parsedValue = generatedValue
      }
    }

    return {
      fieldName,
      value: parsedValue,
      generated: true
    }

  } catch (error: any) {
    console.error(`Failed to generate AI field "${fieldName}":`, error)
    return {
      fieldName,
      value: getDefaultValue(fieldType),
      generated: false,
      error: error.message
    }
  }
}

/**
 * Process all AI field placeholders in a configuration object
 */
export async function processAIFields(
  config: Record<string, any>,
  context: {
    nodeType?: string
    workflowContext?: any
    triggerData?: any
    previousOutputs?: any
    apiKey?: string
  }
): Promise<Record<string, any>> {
  const processed = { ...config }

  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string' && hasAIPlaceholders(value)) {
      // Extract all placeholders from this field
      const placeholders = extractAIPlaceholders(value)

      if (placeholders.length === 1 && value === `{{AI_FIELD:${placeholders[0]}}}`) {
        // Field is entirely an AI placeholder - replace with generated value
        const result = await processAIField({
          fieldName: placeholders[0],
          fieldType: inferFieldType(key),
          nodeType: context.nodeType,
          workflowContext: context.workflowContext,
          triggerData: context.triggerData,
          previousOutputs: context.previousOutputs
        }, context.apiKey)

        processed[key] = result.value
      } else {
        // Field contains AI placeholders mixed with text - replace inline
        let processedValue = value
        for (const placeholder of placeholders) {
          const result = await processAIField({
            fieldName: placeholder,
            fieldType: 'string', // Inline replacements are always strings
            nodeType: context.nodeType,
            workflowContext: context.workflowContext,
            triggerData: context.triggerData,
            previousOutputs: context.previousOutputs
          }, context.apiKey)

          processedValue = processedValue.replace(
            `{{AI_FIELD:${placeholder}}}`,
            String(result.value)
          )
        }
        processed[key] = processedValue
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Recursively process nested objects
      processed[key] = await processAIFields(value, context)
    }
  }

  return processed
}

/**
 * Build a context-aware prompt for field generation
 */
function buildFieldPrompt(
  fieldName: string,
  fieldType?: string,
  nodeType?: string,
  context?: any
): string {
  const parts = []

  // Add field information
  parts.push(`Generate a value for the field "${fieldName}"`)
  if (fieldType) parts.push(`Field type: ${fieldType}`)
  if (nodeType) parts.push(`Used in: ${nodeType} action`)

  // Add context if available
  if (context?.trigger) {
    parts.push('\nTrigger data available:')
    parts.push(JSON.stringify(context.trigger, null, 2).slice(0, 500))
  }

  if (context?.previous && Object.keys(context.previous).length > 0) {
    parts.push('\nPrevious workflow outputs:')
    parts.push(JSON.stringify(context.previous, null, 2).slice(0, 500))
  }

  // Add field-specific hints
  const hints = getFieldHints(fieldName)
  if (hints) parts.push(`\nHints: ${hints}`)

  return parts.join('\n')
}

/**
 * Get field-specific hints for better generation
 */
function getFieldHints(fieldName: string): string | null {
  const lowerName = fieldName.toLowerCase()

  if (lowerName.includes('email')) {
    return 'Generate a professional email address'
  }
  if (lowerName.includes('subject')) {
    return 'Generate a clear, concise email subject line'
  }
  if (lowerName.includes('body') || lowerName.includes('content')) {
    return 'Generate appropriate body content based on context'
  }
  if (lowerName.includes('title')) {
    return 'Generate a descriptive title'
  }
  if (lowerName.includes('description')) {
    return 'Generate a clear description'
  }
  if (lowerName.includes('name')) {
    return 'Generate an appropriate name'
  }
  if (lowerName.includes('message')) {
    return 'Generate a relevant message'
  }
  if (lowerName.includes('url') || lowerName.includes('link')) {
    return 'Generate a valid URL format'
  }
  if (lowerName.includes('date')) {
    return 'Generate a date in ISO format'
  }
  if (lowerName.includes('time')) {
    return 'Generate a time value'
  }

  return null
}

/**
 * Infer field type from field name
 */
function inferFieldType(fieldName: string): string {
  const lowerName = fieldName.toLowerCase()

  if (lowerName.includes('number') || lowerName.includes('count') ||
      lowerName.includes('amount') || lowerName.includes('quantity')) {
    return 'number'
  }
  if (lowerName.includes('enabled') || lowerName.includes('disabled') ||
      lowerName.includes('active') || lowerName.includes('is')) {
    return 'boolean'
  }
  if (lowerName.includes('list') || lowerName.includes('items') ||
      lowerName.includes('array')) {
    return 'array'
  }
  if (lowerName.includes('config') || lowerName.includes('settings') ||
      lowerName.includes('options')) {
    return 'object'
  }

  return 'string'
}

/**
 * Get default value for a field type
 */
function getDefaultValue(fieldType?: string): any {
  switch (fieldType) {
    case 'number':
      return 0
    case 'boolean':
      return false
    case 'array':
      return []
    case 'object':
      return {}
    default:
      return ''
  }
}

/**
 * Check if AI field generation is available
 */
export function isAIFieldGenerationAvailable(apiKey?: string): boolean {
  return !!(apiKey || process.env.OPENAI_API_KEY)
}