/**
 * AI Field Automation System
 * 
 * Allows AI to automatically determine field values during workflow execution
 * and provides dynamic variable replacement within text fields
 */

import OpenAI from 'openai'
import { resolveValue } from './actions/core/resolveValue'

// Special markers for AI-controlled fields and variables
export const AI_FIELD_MARKER = '{{AI_FIELD}}'
export const AI_VARIABLE_PATTERN = /\[([^\]]+)\]/g // Matches [variable_name]
export const AI_DYNAMIC_PATTERN = /\{\{AI:([^}]+)\}\}/g // Matches {{AI:instruction}}

export interface AIFieldConfig {
  fieldName: string
  fieldType: string
  fieldLabel?: string
  context?: string
  constraints?: {
    maxLength?: number
    format?: string
    options?: string[]
    required?: boolean
  }
}

export interface AIVariableContext {
  triggerData?: any
  previousResults?: Record<string, any>
  currentNodeData?: any
  workflowMetadata?: any
  userProfile?: any
}

/**
 * Determines if a field value is AI-controlled
 */
export function isAIControlledField(value: any): boolean {
  if (typeof value !== 'string') return false
  return value === AI_FIELD_MARKER || value.startsWith('{{AI_FIELD:')
}

/**
 * Extracts field configuration from AI marker
 */
export function parseAIFieldMarker(value: string): { fieldName: string, instructions?: string } {
  if (value === AI_FIELD_MARKER) {
    return { fieldName: 'auto' }
  }
  
  const match = value.match(/\{\{AI_FIELD:([^:]+)(?::(.+))?\}\}/)
  if (match) {
    return {
      fieldName: match[1],
      instructions: match[2]
    }
  }
  
  return { fieldName: 'auto' }
}

/**
 * Generates appropriate field value using AI
 */
export async function generateAIFieldValue(
  field: AIFieldConfig,
  context: AIVariableContext,
  apiKey?: string
): Promise<any> {
  const openai = new OpenAI({ 
    apiKey: apiKey || process.env.OPENAI_API_KEY 
  })

  const systemPrompt = buildFieldGenerationPrompt(field, context)
  const userPrompt = buildContextPrompt(context)

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: field.constraints?.maxLength ? Math.min(field.constraints.maxLength, 500) : 500
    })

    const response = completion.choices[0].message.content || ''
    
    // Parse response based on field type
    return parseAIResponse(response, field.fieldType)
  } catch (error) {
    console.error('AI field generation error:', error)
    return getDefaultValue(field.fieldType)
  }
}

/**
 * Resolves dynamic AI variables within text
 */
export async function resolveAIVariables(
  text: string,
  context: AIVariableContext,
  apiKey?: string
): Promise<string> {
  if (!text || typeof text !== 'string') return text
  
  // Check for simple variables [name], [subject], etc.
  const simpleVariables = Array.from(text.matchAll(AI_VARIABLE_PATTERN))
  
  // Check for AI instructions {{AI:summarize_this}}, {{AI:extract_email}}, etc.
  const aiInstructions = Array.from(text.matchAll(AI_DYNAMIC_PATTERN))
  
  if (simpleVariables.length === 0 && aiInstructions.length === 0) {
    return text
  }

  const openai = new OpenAI({ 
    apiKey: apiKey || process.env.OPENAI_API_KEY 
  })

  // Build variable extraction prompt
  const variableNames = simpleVariables.map(m => m[1])
  const instructions = aiInstructions.map(m => ({ marker: m[0], instruction: m[1] }))
  
  const systemPrompt = `You are a smart variable resolver for workflow automation.
Extract and generate appropriate values for the following variables based on the context provided.

Variables to resolve:
${variableNames.map(v => `- [${v}]: Extract or generate appropriate value for "${v}"`).join('\n')}

Dynamic instructions:
${instructions.map(i => `- ${i.marker}: ${i.instruction}`).join('\n')}

Rules:
1. Extract real values from the context when available
2. Generate appropriate placeholder values if not found
3. Keep values concise and contextually appropriate
4. For names, use proper capitalization
5. For technical fields, maintain accuracy
6. Return a JSON object with variable names as keys

Respond with ONLY a valid JSON object.`

  const userPrompt = buildContextPrompt(context)

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    })

    const values = JSON.parse(completion.choices[0].message.content || '{}')
    
    // Replace variables in text
    let resolvedText = text
    
    // Replace simple variables
    for (const [fullMatch, varName] of simpleVariables) {
      const value = values[varName] || varName
      resolvedText = resolvedText.replace(`[${varName}]`, value)
    }
    
    // Replace AI instructions
    for (const instruction of instructions) {
      const value = values[instruction.instruction] || instruction.instruction
      resolvedText = resolvedText.replace(instruction.marker, value)
    }
    
    return resolvedText
  } catch (error) {
    console.error('AI variable resolution error:', error)
    // Return original text if AI fails
    return text
  }
}

/**
 * Builds prompt for field generation
 */
function buildFieldGenerationPrompt(field: AIFieldConfig, context: AIVariableContext): string {
  let prompt = `Generate an appropriate value for the field "${field.fieldLabel || field.fieldName}".
Field type: ${field.fieldType}
`

  if (field.constraints) {
    if (field.constraints.maxLength) {
      prompt += `Maximum length: ${field.constraints.maxLength} characters\n`
    }
    if (field.constraints.format) {
      prompt += `Format: ${field.constraints.format}\n`
    }
    if (field.constraints.options) {
      prompt += `Must be one of: ${field.constraints.options.join(', ')}\n`
    }
  }

  if (field.context) {
    prompt += `Additional context: ${field.context}\n`
  }

  prompt += `
Based on the workflow context, generate the most appropriate value.
For emails, ensure proper formatting.
For names, use proper capitalization.
For selections, choose from the provided options.
For numbers, use reasonable values.
For dates, use ISO format.

Respond with ONLY the value, no explanation.`

  return prompt
}

/**
 * Builds context prompt from available data
 */
function buildContextPrompt(context: AIVariableContext): string {
  const parts = []

  if (context.triggerData) {
    parts.push(`Trigger data: ${JSON.stringify(context.triggerData, null, 2)}`)
  }

  if (context.previousResults) {
    parts.push(`Previous workflow results: ${JSON.stringify(context.previousResults, null, 2)}`)
  }

  if (context.currentNodeData) {
    parts.push(`Current node data: ${JSON.stringify(context.currentNodeData, null, 2)}`)
  }

  if (context.workflowMetadata) {
    parts.push(`Workflow metadata: ${JSON.stringify(context.workflowMetadata, null, 2)}`)
  }

  if (context.userProfile) {
    parts.push(`User profile: ${JSON.stringify(context.userProfile, null, 2)}`)
  }

  return parts.join('\n\n')
}

/**
 * Parses AI response based on expected field type
 */
function parseAIResponse(response: string, fieldType: string): any {
  const trimmed = response.trim()

  switch (fieldType) {
    case 'number':
      return parseFloat(trimmed) || 0
    
    case 'boolean':
    case 'checkbox':
      return trimmed.toLowerCase() === 'true' || trimmed.toLowerCase() === 'yes'
    
    case 'select':
    case 'dropdown':
      return trimmed
    
    case 'multiselect':
    case 'array':
      try {
        return JSON.parse(trimmed)
      } catch {
        return trimmed.split(',').map(s => s.trim())
      }
    
    case 'json':
    case 'object':
      try {
        return JSON.parse(trimmed)
      } catch {
        return {}
      }
    
    case 'date':
      try {
        return new Date(trimmed).toISOString()
      } catch {
        return new Date().toISOString()
      }
    
    default:
      return trimmed
  }
}

/**
 * Gets default value for field type
 */
function getDefaultValue(fieldType: string): any {
  switch (fieldType) {
    case 'number':
      return 0
    case 'boolean':
    case 'checkbox':
      return false
    case 'array':
    case 'multiselect':
      return []
    case 'object':
    case 'json':
      return {}
    case 'date':
      return new Date().toISOString()
    default:
      return ''
  }
}

/**
 * Process all AI fields in a configuration object
 */
export async function processAIFields(
  config: Record<string, any>,
  configSchema: any[],
  context: AIVariableContext,
  apiKey?: string
): Promise<Record<string, any>> {
  const processed = { ...config }

  for (const [key, value] of Object.entries(config)) {
    // Check if field is AI-controlled
    if (isAIControlledField(value)) {
      const schema = configSchema.find(s => s.name === key)
      if (schema) {
        const fieldConfig: AIFieldConfig = {
          fieldName: key,
          fieldType: schema.type,
          fieldLabel: schema.label,
          constraints: {
            maxLength: schema.maxLength,
            format: schema.format,
            options: schema.options?.map((o: any) => o.value || o),
            required: schema.required
          }
        }

        // Generate AI value
        processed[key] = await generateAIFieldValue(fieldConfig, context, apiKey)
      }
    } 
    // Check if field contains AI variables
    else if (typeof value === 'string' && (AI_VARIABLE_PATTERN.test(value) || AI_DYNAMIC_PATTERN.test(value))) {
      processed[key] = await resolveAIVariables(value, context, apiKey)
    }
  }

  return processed
}

/**
 * Validation for AI-generated content
 */
export function validateAIContent(content: string, rules?: {
  maxLength?: number
  minLength?: number
  noSensitiveData?: boolean
  noProfanity?: boolean
}): { valid: boolean; issues?: string[] } {
  const issues: string[] = []

  if (rules?.maxLength && content.length > rules.maxLength) {
    issues.push(`Content exceeds maximum length of ${rules.maxLength}`)
  }

  if (rules?.minLength && content.length < rules.minLength) {
    issues.push(`Content is shorter than minimum length of ${rules.minLength}`)
  }

  if (rules?.noSensitiveData) {
    // Check for common sensitive patterns
    const sensitivePatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      /\b\d{16}\b/, // Credit card
      /password\s*[:=]\s*\S+/i, // Passwords
    ]
    
    for (const pattern of sensitivePatterns) {
      if (pattern.test(content)) {
        issues.push('Content may contain sensitive data')
        break
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues: issues.length > 0 ? issues : undefined
  }
}