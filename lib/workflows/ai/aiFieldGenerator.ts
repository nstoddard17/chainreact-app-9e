/**
 * AI Field Generator
 *
 * Generates values for fields marked with {{AI_FIELD:fieldName}} placeholders
 * using AI based on the workflow context and field requirements.
 */

import { OpenAI } from 'openai'

import { logger } from '@/lib/utils/logger'

// Dynamic import for Anthropic SDK (optional dependency)
let Anthropic: any
try {
  Anthropic = require('@anthropic-ai/sdk').default
} catch {
  // Anthropic SDK not installed, will use fallback
  Anthropic = null
}

// Cache generated values to avoid redundant API calls
const fieldValueCache = new Map<string, any>()

/**
 * Generate a field value using AI
 */
export async function generateAIFieldValue(
  fieldName: string,
  context: any,
  aiConfig: {
    model: string
    temperature?: number
    apiSource: 'chainreact' | 'custom'
    apiKey?: string
  }
): Promise<any> {
  // Check cache first
  const cacheKey = `${fieldName}-${JSON.stringify(context.triggerData || {}).substring(0, 100)}`
  if (fieldValueCache.has(cacheKey)) {
    logger.debug(`📦 Using cached value for field: ${fieldName}`)
    return fieldValueCache.get(cacheKey)
  }

  logger.debug(`🤖 Generating AI value for field: ${fieldName}`)

  try {
    // Determine field type and requirements
    const fieldInfo = analyzeField(fieldName, context)

    // Build prompt for field generation
    const prompt = buildFieldPrompt(fieldName, fieldInfo, context)

    // Get AI-generated value
    const value = await getAIGeneratedValue(prompt, fieldInfo, aiConfig)

    // Validate and format the value
    const formattedValue = formatFieldValue(value, fieldInfo)

    // Cache the result
    fieldValueCache.set(cacheKey, formattedValue)

    return formattedValue
  } catch (error) {
    logger.error(`❌ Failed to generate AI value for field ${fieldName}:`, error)
    return getDefaultValue(fieldName)
  }
}

/**
 * Analyze field to determine its type and requirements
 */
function analyzeField(fieldName: string, context: any) {
  const lowerFieldName = fieldName.toLowerCase()

  // Determine field type based on name patterns
  let fieldType = 'text'
  const requirements: any = {}

  // Message/content fields
  if (lowerFieldName.includes('message') || lowerFieldName.includes('content') || lowerFieldName.includes('body')) {
    fieldType = 'message'
    requirements.maxLength = 2000
    requirements.style = 'professional'
  }
  // Subject/title fields
  else if (lowerFieldName.includes('subject') || lowerFieldName.includes('title')) {
    fieldType = 'subject'
    requirements.maxLength = 100
    requirements.style = 'concise'
  }
  // Email fields
  else if (lowerFieldName.includes('email')) {
    fieldType = 'email_content'
    requirements.maxLength = 5000
    requirements.style = 'professional'
  }
  // Name fields
  else if (lowerFieldName.includes('name')) {
    fieldType = 'name'
    requirements.maxLength = 50
  }
  // Description fields
  else if (lowerFieldName.includes('description') || lowerFieldName.includes('desc')) {
    fieldType = 'description'
    requirements.maxLength = 500
  }
  // Number fields
  else if (lowerFieldName.includes('amount') || lowerFieldName.includes('count') || lowerFieldName.includes('number')) {
    fieldType = 'number'
  }
  // Boolean fields
  else if (lowerFieldName.includes('enabled') || lowerFieldName.includes('active') || lowerFieldName.includes('is_')) {
    fieldType = 'boolean'
  }
  // Date fields
  else if (lowerFieldName.includes('date') || lowerFieldName.includes('time')) {
    fieldType = 'date'
  }
  // URL fields
  else if (lowerFieldName.includes('url') || lowerFieldName.includes('link')) {
    fieldType = 'url'
  }

  return {
    name: fieldName,
    type: fieldType,
    requirements
  }
}

/**
 * Build prompt for field generation
 */
function buildFieldPrompt(fieldName: string, fieldInfo: any, context: any): string {
  let contextSummary = ''

  // Include trigger data if available
  if (context.triggerData) {
    contextSummary += `\nTrigger Data: ${JSON.stringify(context.triggerData, null, 2).substring(0, 1000)}`
  }

  // Include workflow data if available
  if (context.workflowData) {
    contextSummary += `\nWorkflow Data: ${JSON.stringify(context.workflowData, null, 2).substring(0, 1000)}`
  }

  // Include previous node outputs if available
  if (context.nodeOutputs) {
    const outputSummary = Object.entries(context.nodeOutputs)
      .map(([nodeId, output]) => `${nodeId}: ${JSON.stringify(output).substring(0, 200)}`)
      .join('\n')
    contextSummary += `\nPrevious Outputs:\n${outputSummary}`
  }

  // Build type-specific prompts
  switch (fieldInfo.type) {
    case 'message':
      return `Generate a professional message based on the following context:
${contextSummary}

Requirements:
- Maximum length: ${fieldInfo.requirements.maxLength} characters
- Style: ${fieldInfo.requirements.style}
- Field name: ${fieldName}

Generate only the message content, no additional formatting or explanation.`

    case 'subject':
      return `Generate a concise subject line based on the following context:
${contextSummary}

Requirements:
- Maximum length: ${fieldInfo.requirements.maxLength} characters
- Style: Clear and professional
- Field name: ${fieldName}

Generate only the subject line, no quotes or additional text.`

    case 'email_content':
      return `Generate a professional email response based on the following context:
${contextSummary}

Requirements:
- Style: Professional and friendly
- Include appropriate greeting and closing
- Address the main points from the context
- Field name: ${fieldName}

Generate the complete email content.`

    case 'description':
      return `Generate a clear description based on the following context:
${contextSummary}

Requirements:
- Maximum length: ${fieldInfo.requirements.maxLength} characters
- Be concise and informative
- Field name: ${fieldName}

Generate only the description text.`

    case 'name':
      return `Generate an appropriate name/title based on the following context:
${contextSummary}

Requirements:
- Maximum length: ${fieldInfo.requirements.maxLength} characters
- Clear and descriptive
- Field name: ${fieldName}

Generate only the name, no additional text.`

    case 'number':
      return `Based on the context, determine an appropriate numeric value for the field "${fieldName}":
${contextSummary}

Return only the number, no units or additional text.`

    case 'boolean':
      return `Based on the context, should "${fieldName}" be true or false?
${contextSummary}

Return only "true" or "false".`

    case 'date':
      return `Based on the context, determine an appropriate date/time for "${fieldName}":
${contextSummary}

Return the date in ISO 8601 format (YYYY-MM-DDTHH:mm:ss).`

    default:
      return `Generate an appropriate value for the field "${fieldName}" based on this context:
${contextSummary}

Generate only the value, no additional formatting.`
  }
}

/**
 * Get AI-generated value
 */
async function getAIGeneratedValue(
  prompt: string,
  fieldInfo: any,
  aiConfig: any
): Promise<string> {
  const systemPrompt = `You are a helpful assistant that generates field values for workflow automation.
Generate appropriate values based on the context provided. Be concise and professional.
For the field type "${fieldInfo.type}", provide only the requested value without any additional explanation or formatting.`

  try {
    if (aiConfig.model.includes('gpt')) {
      // Use OpenAI
      const client = new OpenAI({
        apiKey: aiConfig.apiKey || process.env.OPENAI_API_KEY
      })

      const response = await client.chat.completions.create({
        model: aiConfig.model || 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: aiConfig.temperature || 0.7,
        max_tokens: 500
      })

      return response.choices[0].message.content || ''

    } else if (aiConfig.model.includes('claude')) {
      // Use Claude if available, otherwise fallback to OpenAI
      if (!Anthropic) {
        logger.warn('Anthropic SDK not installed, falling back to OpenAI for field generation')
        const openai = new OpenAI({
          apiKey: aiConfig.apiKey || process.env.OPENAI_API_KEY
        })

        const response = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature: aiConfig.temperature || 0.7,
          max_tokens: 500
        })

        return response.choices[0].message.content || ''
      } 
        const client = new Anthropic({
          apiKey: aiConfig.apiKey || process.env.ANTHROPIC_API_KEY
        })

        const response = await client.messages.create({
          model: aiConfig.model || 'claude-3-opus-20240229',
          max_tokens: 500,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }],
          temperature: aiConfig.temperature || 0.7
        })

        const content = response.content[0]
        return content.type === 'text' ? content.text : ''
      

    } 
      // Use ChainReact's API
      const response = await fetch('/api/ai/generate-field', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: aiConfig.model,
          systemPrompt,
          userPrompt: prompt,
          temperature: aiConfig.temperature || 0.7,
          fieldType: fieldInfo.type
        })
      })

      if (!response.ok) {
        throw new Error(`ChainReact API failed: ${response.statusText}`)
      }

      const data = await response.json()
      return data.value || ''
    
  } catch (error) {
    logger.error('AI generation failed:', error)
    throw error
  }
}

/**
 * Format and validate field value
 */
function formatFieldValue(value: string, fieldInfo: any): any {
  const trimmedValue = value.trim()

  switch (fieldInfo.type) {
    case 'message':
    case 'subject':
    case 'email_content':
    case 'description':
    case 'name':
      // Enforce max length if specified
      if (fieldInfo.requirements?.maxLength) {
        return trimmedValue.substring(0, fieldInfo.requirements.maxLength)
      }
      return trimmedValue

    case 'number':
      const num = parseFloat(trimmedValue)
      return isNaN(num) ? 0 : num

    case 'boolean':
      return trimmedValue.toLowerCase() === 'true'

    case 'date':
      // Try to parse as date
      const date = new Date(trimmedValue)
      return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()

    case 'url':
      // Basic URL validation
      if (!trimmedValue.startsWith('http')) {
        return `https://${trimmedValue}`
      }
      return trimmedValue

    default:
      return trimmedValue
  }
}

/**
 * Get default value for field type
 */
function getDefaultValue(fieldName: string): any {
  const lowerFieldName = fieldName.toLowerCase()

  if (lowerFieldName.includes('message') || lowerFieldName.includes('content')) {
    return 'Generated message content'
  }
  if (lowerFieldName.includes('subject') || lowerFieldName.includes('title')) {
    return 'Generated Subject'
  }
  if (lowerFieldName.includes('name')) {
    return 'Generated Name'
  }
  if (lowerFieldName.includes('description')) {
    return 'Generated description'
  }
  if (lowerFieldName.includes('email')) {
    return 'Generated email content'
  }
  if (lowerFieldName.includes('number') || lowerFieldName.includes('amount')) {
    return 0
  }
  if (lowerFieldName.includes('date') || lowerFieldName.includes('time')) {
    return new Date().toISOString()
  }
  if (lowerFieldName.includes('enabled') || lowerFieldName.includes('active')) {
    return true
  }

  return `AI_GENERATED_${fieldName.toUpperCase()}`
}

/**
 * Clear the field value cache
 */
export function clearFieldValueCache(): void {
  fieldValueCache.clear()
  logger.debug('🧹 Field value cache cleared')
}