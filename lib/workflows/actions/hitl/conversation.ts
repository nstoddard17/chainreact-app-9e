/**
 * AI Conversation Handler for HITL
 * Manages conversational interaction with users using OpenAI
 */

import OpenAI from 'openai'
import type {
  ConversationMessage,
  ExtractedVariables,
  ContinuationDetectionResult,
  HITLConfig
} from './types'
import { logger } from '@/lib/utils/logger'

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

/**
 * Generate the system prompt for the AI assistant
 */
export function generateSystemPrompt(config: HITLConfig, contextData: any): string {
  const basePrompt = config.systemPrompt || `You are a helpful workflow assistant. Help the user review and refine this workflow step before continuing.`

  const extractionInstructions = config.extractVariables
    ? `\n\nWhen the user is ready to continue, you MUST extract the following information:\n${JSON.stringify(config.extractVariables, null, 2)}`
    : ''

  const continuationSignals = config.continuationSignals || ['continue', 'proceed', 'go ahead', 'send it', 'looks good']

  return `${basePrompt}

Context Data:
${typeof contextData === 'string' ? contextData : JSON.stringify(contextData, null, 2)}

Your job:
1. Present what's about to happen clearly
2. Answer questions about the data and context
3. Accept suggestions and modifications
4. When the user is satisfied, detect continuation signals
5. Extract key decisions and changes to pass to the next workflow steps

Continuation signals (any of these means the user wants to proceed):
${continuationSignals.map(s => `- "${s}"`).join('\n')}

${extractionInstructions}

When you detect a continuation signal, call the continue_workflow function with the extracted variables and a brief summary of the conversation.
`
}

/**
 * Process a user message and get AI response
 */
export async function processConversationMessage(
  userMessage: string,
  conversationHistory: ConversationMessage[],
  config: HITLConfig,
  contextData: any
): Promise<{
  aiResponse: string
  shouldContinue: boolean
  extractedVariables?: ExtractedVariables
  summary?: string
}> {
  try {
    // Build messages array for OpenAI
    const systemPrompt = generateSystemPrompt(config, contextData)
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      })) as OpenAI.Chat.ChatCompletionMessageParam[],
      { role: 'user', content: userMessage }
    ]

    // Define the continuation function for OpenAI
    const tools: OpenAI.Chat.ChatCompletionTool[] = [
      {
        type: 'function',
        function: {
          name: 'continue_workflow',
          description: 'Call this when the user is ready to continue the workflow. Extract required variables and provide a summary.',
          parameters: {
            type: 'object',
            properties: {
              extractedVariables: {
                type: 'object',
                description: 'Variables extracted from the conversation as defined in the system prompt',
                additionalProperties: true
              },
              summary: {
                type: 'string',
                description: 'Brief summary of what was discussed and decided'
              }
            },
            required: ['summary']
          }
        }
      }
    ]

    // Call OpenAI
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.7,
      max_tokens: 1000
    })

    const choice = response.choices[0]

    // Check if AI wants to continue workflow
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      const toolCall = choice.message.tool_calls.find(tc => tc.function.name === 'continue_workflow')

      if (toolCall) {
        const args = JSON.parse(toolCall.function.arguments)

        // Generate a final message to the user
        const finalMessage = `Great! Continuing the workflow with these changes: ${args.summary}`

        return {
          aiResponse: finalMessage,
          shouldContinue: true,
          extractedVariables: args.extractedVariables || {},
          summary: args.summary
        }
      }
    }

    // Regular conversation response
    const aiResponse = choice.message.content || "I'm sorry, I didn't understand that. Can you rephrase?"

    return {
      aiResponse,
      shouldContinue: false
    }

  } catch (error: any) {
    logger.error('Error in HITL conversation processing', { error: error.message })

    // Fallback: check for simple continuation keywords
    const continuationSignals = config.continuationSignals || ['continue', 'proceed', 'go ahead', 'send it', 'looks good', 'approve']
    const lowerMessage = userMessage.toLowerCase().trim()

    if (continuationSignals.some(signal => lowerMessage.includes(signal.toLowerCase()))) {
      return {
        aiResponse: 'Continuing the workflow...',
        shouldContinue: true,
        extractedVariables: {},
        summary: 'User approved'
      }
    }

    return {
      aiResponse: "I'm having trouble processing that. Please try again or type 'continue' to proceed.",
      shouldContinue: false
    }
  }
}

/**
 * Simple fallback continuation detection (if OpenAI fails)
 */
export function detectContinuationSignal(
  message: string,
  continuationSignals: string[]
): boolean {
  const lowerMessage = message.toLowerCase().trim()
  return continuationSignals.some(signal =>
    lowerMessage.includes(signal.toLowerCase())
  )
}
