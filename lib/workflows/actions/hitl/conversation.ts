/**
 * AI Conversation Handler for HITL
 * Manages conversational interaction with users using OpenAI
 */

import OpenAI from 'openai'
export type ScenarioDescriptor = {
  type: 'email' | 'chat' | 'general'
  instructions: string
  followUpPrompt: string
}

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

  // Handle extraction instructions - support user-defined variables or smart auto-extraction
  let extractionInstructions = ''
  const hasUserDefinedVariables = config.extractVariables &&
    (Array.isArray(config.extractVariables) ? config.extractVariables.length > 0 : Object.keys(config.extractVariables).length > 0)

  if (hasUserDefinedVariables) {
    if (Array.isArray(config.extractVariables)) {
      // New format: array of variable names like ["decision", "notes", "approvedBudget"]
      extractionInstructions = `\n\nWhen the user is ready to continue, you MUST extract these specific variables:\n${config.extractVariables.map(v => `- ${v}`).join('\n')}\n\nAlso extract any other relevant data discussed in the conversation.`
    } else {
      // Legacy format: object with descriptions like {"decision": "The user's final decision"}
      extractionInstructions = `\n\nWhen the user is ready to continue, you MUST extract:\n${JSON.stringify(config.extractVariables, null, 2)}\n\nAlso extract any other relevant data discussed in the conversation.`
    }
  } else {
    // Smart auto-extraction - AI determines what to extract based on context
    extractionInstructions = `

IMPORTANT - Smart Variable Extraction:
When the user is ready to continue, you MUST intelligently extract ALL relevant data from our conversation.

Analyze the context and extract appropriate variables. Common patterns:
- For EMAIL discussions: emailBody, emailSubject, recipientEmail, recipientName, senderName, ccEmails
- For TASK discussions: taskTitle, taskDescription, assignee, dueDate, priority, status
- For APPROVAL discussions: decision, approverNotes, conditions, approvedAmount
- For CONTENT discussions: content, title, author, category, tags, publishDate
- For MEETING discussions: meetingTitle, attendees, meetingDate, meetingTime, location, agenda
- For DATA discussions: extract the specific data fields discussed

ALWAYS include:
- decision: "approved", "rejected", "modified", or "continued"

Use camelCase for all variable names. Extract everything that would be useful for the next workflow step.`
  }

  const continuationSignals = config.continuationSignals || ['continue', 'proceed', 'go ahead', 'send it', 'looks good']

  return `${basePrompt}

Context Data:
${typeof contextData === 'string' ? contextData : JSON.stringify(contextData, null, 2)}

Your job:
1. Present what's about to happen clearly
2. Answer questions about the data and context
3. Accept suggestions and modifications
4. When the user is satisfied, detect continuation signals
5. Extract ALL relevant data from the conversation to pass to the next workflow steps

Continuation signals (any of these means the user wants to proceed):
${continuationSignals.map(s => `- "${s}"`).join('\n')}
${extractionInstructions}

When you detect a continuation signal, call the continue_workflow function with the extracted variables and a brief summary.
`
}

/**
 * Process a user message and get AI response
 */
export async function processConversationMessage(
  userMessage: string,
  conversationHistory: ConversationMessage[],
  config: HITLConfig,
  contextData: any,
  customSystemPrompt?: string
): Promise<{
  aiResponse: string
  shouldContinue: boolean
  extractedVariables?: ExtractedVariables
  summary?: string
}> {
  try {
    // Use custom system prompt if provided (contains memory + knowledge base)
    // Otherwise generate a basic one
    const systemPrompt = customSystemPrompt || generateSystemPrompt(config, contextData)
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

export function detectScenario(input: Record<string, any> = {}): ScenarioDescriptor {
  if (input.email || input.message?.email) {
    return {
      type: 'email',
      instructions: [
        'Draft a professional reply email using the provided details.',
        'Call out any missing information the human should fill in.',
        'Offer the reply in markdown with clear sections (Greeting, Body, Closing).'
      ].join('\n- '),
      followUpPrompt: 'Ask if the email should be sent as-is or if they want edits.'
    }
  }

  if (input.message || input.chat || input.slack || input.discord || input.text) {
    return {
      type: 'chat',
      instructions: [
        'Draft a short message or response suitable for chat or messaging platforms.',
        'Highlight any assumptions and offer quick alternatives if appropriate.'
      ].join('\n- '),
      followUpPrompt: 'Ask whether to post the message or adjust it.'
    }
  }

  return {
    type: 'general',
    instructions: [
      'Summarize what the workflow is about to do next.',
      'Outline the proposed actions in bullet points.',
      'Call out any risks or decisions the human should confirm.'
    ].join('\n- '),
    followUpPrompt: 'Ask for approval, edits, or additional guidance before continuing.'
  }
}

/**
 * Generate the initial assistant message that appears in Discord when the workflow pauses.
 */
export async function generateInitialAssistantOpening(
  systemPrompt: string,
  contextText: string,
  input: Record<string, any>,
  config: HITLConfig
): Promise<{ message: string | null; scenario: ScenarioDescriptor }> {
  try {
    const scenario = detectScenario(input)

    const continuationHint = Array.isArray(config.continuationSignals) && config.continuationSignals.length > 0
      ? `If the human wants to continue, they might say something like "${config.continuationSignals[0]}".`
      : ''

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `${systemPrompt}\n\nYou are preparing the very first assistant message for the human reviewer. The goal is to present a thoughtful proposal and invite collaboration before the workflow continues.`
      },
      {
        role: 'user',
        content: [
          'Context from the previous workflow step:',
          contextText,
          '',
          'Compose the initial assistant message that will be posted in Discord. The message should:',
          `- ${scenario.instructions}`,
          `- ${scenario.followUpPrompt}`,
          '- Keep the tone collaborative and confident.',
          '- Stay under 180 words.',
          continuationHint,
          '',
          'Return only the message text in markdown.'
        ].join('\n')
      }
    ]

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages,
      temperature: 0.6,
      max_tokens: 500
    })

    const aiMessage = response.choices[0]?.message?.content?.trim()
    return { message: aiMessage || null, scenario }
  } catch (error: any) {
    logger.warn('Failed to generate initial assistant opening', { error: error.message })
    return {
      message: null,
      scenario: detectScenario(input)
    }
  }
}
