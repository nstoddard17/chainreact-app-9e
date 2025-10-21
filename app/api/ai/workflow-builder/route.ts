import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'

export const dynamic = 'force-dynamic'

/**
 * AI Workflow Builder API
 * Processes natural language requests and builds workflows progressively
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()

    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unauthorized', 401)
    }

    const body = await request.json()
    const { message, workflowId, connectedIntegrations = [], conversationHistory = [], contextNodes = [] } = body

    if (!message) {
      return errorResponse('Message is required', 400)
    }

    // Get available nodes
    const availableNodes = ALL_NODE_COMPONENTS.map(node => ({
      type: node.type,
      name: node.name,
      providerId: node.providerId,
      isTrigger: node.isTrigger,
      description: node.description || '',
      category: node.category || 'misc'
    }))

    // Build context for AI
    const systemPrompt = buildSystemPrompt(availableNodes, connectedIntegrations, contextNodes)
    const userMessage = message.trim()

    // Call OpenAI API (or your AI provider)
    const aiResponse = await callAI({
      systemPrompt,
      userMessage,
      conversationHistory,
      availableNodes,
      contextNodes
    })

    // Parse AI response and determine action
    const action = parseAIResponse(aiResponse, availableNodes, connectedIntegrations)

    return jsonResponse(action)

  } catch (error) {
    logger.error('AI Workflow Builder error:', error)
    return errorResponse('Failed to process request', 500)
  }
}

/**
 * Build system prompt with available nodes
 */
function buildSystemPrompt(availableNodes: any[], connectedIntegrations: string[], contextNodes: any[] = []) {
  const nodeList = availableNodes.map(n => `- ${n.name} (${n.type})`).join('\n')

  const connectedList = connectedIntegrations.length > 0
    ? connectedIntegrations.join(', ')
    : 'None'

  // Build context nodes section
  let contextSection = ''
  if (contextNodes.length > 0) {
    contextSection = `\n\nContext Nodes (Current Workflow):\nThe user has selected the following nodes from their workflow for you to reference:\n${contextNodes.map(n => {
      const configStr = n.config ? `\n  Configuration: ${JSON.stringify(n.config, null, 2)}` : ''
      return `- ${n.title} (${n.type})${configStr}`
    }).join('\n')}\n\nUse this context to:\n- Reference existing node configurations\n- Map data between nodes\n- Suggest connections based on available fields\n- Provide specific recommendations based on current setup`
  }

  return `You are an expert workflow automation assistant for ChainReact.

Your goal is to help users build workflows using natural language by:
1. Understanding their automation needs
2. Breaking workflows into logical steps
3. Mapping steps to specific nodes
4. Checking integration status
5. Adding nodes progressively
6. Providing clear explanations

Available Nodes:
${nodeList}

Currently Connected Integrations:
${connectedList}
${contextSection}

Rules:
- ONLY suggest nodes that exist in the available nodes list
- If a needed integration isn't connected, prompt the user to connect it
- Add ONE node at a time with clear explanations
- Ask clarifying questions when the request is ambiguous
- Validate that the workflow makes logical sense
- Use simple, friendly language

Response Format (JSON):
{
  "message": "Your response to the user",
  "actionType": "add_node" | "connect_integration" | "configure_node" | "clarify" | "complete",
  "nodeType": "node_type_if_adding",
  "provider": "provider_if_connecting",
  "config": {},
  "metadata": {},
  "status": "pending" | "complete" | "error"
}

Examples:
- User: "When I get an email, send it to Slack"
  Response: Check if Gmail and Slack are connected, then add email trigger and Slack action

- User: "Schedule a daily report"
  Response: Ask what time and what the report should contain

- User: "Save form responses to Google Sheets"
  Response: Add form trigger and Sheets action, ask for spreadsheet details

Be helpful, concise, and guide users step-by-step!`
}

/**
 * Call AI API (OpenAI, Anthropic, etc.)
 */
async function callAI({
  systemPrompt,
  userMessage,
  conversationHistory,
  availableNodes,
  contextNodes = []
}: {
  systemPrompt: string
  userMessage: string
  conversationHistory: any[]
  availableNodes: any[]
  contextNodes?: any[]
}) {
  // Check if user has their own OpenAI key
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    throw new Error('OpenAI API key not configured')
  }

  // Build messages array
  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.map((msg: any) => ({
      role: msg.role,
      content: msg.content
    })),
    { role: 'user', content: userMessage }
  ]

  // Call OpenAI
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini', // Fast and cost-effective
      messages,
      temperature: 0.7,
      max_tokens: 500,
      response_format: { type: 'json_object' } // Force JSON response
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'AI API request failed')
  }

  const data = await response.json()
  const aiMessage = data.choices[0].message.content

  // Parse JSON response
  try {
    return JSON.parse(aiMessage)
  } catch (e) {
    // Fallback if AI doesn't return valid JSON
    return {
      message: aiMessage,
      actionType: 'clarify',
      status: 'pending'
    }
  }
}

/**
 * Parse AI response and validate
 */
function parseAIResponse(aiResponse: any, availableNodes: any[], connectedIntegrations: string[]) {
  // Validate node type exists
  if (aiResponse.nodeType) {
    const nodeExists = availableNodes.some(n => n.type === aiResponse.nodeType)
    if (!nodeExists) {
      return {
        message: `I apologize, but the node type "${aiResponse.nodeType}" isn't available. Let me suggest an alternative...`,
        actionType: 'clarify',
        status: 'error'
      }
    }
  }

  // Check if integration is connected
  if (aiResponse.provider && !connectedIntegrations.includes(aiResponse.provider)) {
    return {
      message: aiResponse.message || `To use ${aiResponse.provider}, you'll need to connect it first. Would you like to do that now?`,
      actionType: 'connect_integration',
      provider: aiResponse.provider,
      status: 'pending',
      metadata: {
        integrationConnected: false,
        provider: aiResponse.provider
      }
    }
  }

  return {
    message: aiResponse.message,
    actionType: aiResponse.actionType || 'clarify',
    nodeType: aiResponse.nodeType,
    provider: aiResponse.provider,
    config: aiResponse.config || {},
    metadata: aiResponse.metadata || {},
    status: aiResponse.status || 'pending'
  }
}
