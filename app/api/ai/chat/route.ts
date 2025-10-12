import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import OpenAI from 'openai'
import { v4 as uuidv4 } from 'uuid'

import { logger } from '@/lib/utils/logger'

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

// Pricing configuration (per 1K tokens)
const MODEL_PRICING: Record<string, { prompt: number; completion: number }> = {
  'gpt-4-turbo': { prompt: 0.01, completion: 0.03 },
  'gpt-4': { prompt: 0.03, completion: 0.06 },
  'gpt-3.5-turbo': { prompt: 0.0005, completion: 0.0015 },
  'gpt-3.5-turbo-16k': { prompt: 0.003, completion: 0.004 },
}

interface ChatRequest {
  messages?: Array<{ role: string; content: string }>
  message?: string // Legacy support
  model?: string
  action?: string
  requestId?: string
  stream?: boolean
  temperature?: number
  max_tokens?: number
  workflowId?: string
  nodeId?: string
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = await createSupabaseServerClient()

    // Check for admin test mode
    const testUserId = request.headers.get('X-Test-User-Id')
    let userId: string

    if (testUserId) {
      // Admin test mode - verify the current user is an admin
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      // TODO: Add proper admin check here
      // For now, we'll allow any authenticated user to test
      // In production, you should verify the user has admin role
      logger.debug(`Admin test mode: User ${user.id} testing as ${testUserId}`)
      userId = testUserId
    } else {
      // Normal mode - use authenticated user
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      userId = user.id
    }

    const body: ChatRequest = await request.json()
    
    // Support both new format (messages array) and legacy format (single message)
    const messages = body.messages || (body.message ? [
      { role: 'user', content: body.message }
    ] : null)
    
    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: "Messages are required" }, { status: 400 })
    }

    const {
      model = 'gpt-3.5-turbo',
      action = 'chat',
      requestId = uuidv4(),
      stream = false,
      temperature = 0.7,
      max_tokens,
      workflowId,
      nodeId
    } = body

    // Check for existing request in ai_cost_logs (idempotency)
    const { data: existingRequest } = await supabase
      .from('ai_cost_logs')
      .select('*')
      .eq('metadata->request_id', requestId)
      .single()

    if (existingRequest) {
      logger.debug('Request already processed:', requestId)
      return NextResponse.json({
        requestId,
        cached: true,
        content: existingRequest.metadata?.response_content || '',
        usage: {
          prompt_tokens: existingRequest.input_tokens,
          completion_tokens: existingRequest.output_tokens,
          total_tokens: existingRequest.input_tokens + existingRequest.output_tokens,
          cost_usd: existingRequest.cost
        }
      })
    }

    // Note: Budget checking removed as ai_usage_budgets table doesn't exist
    // This can be implemented later with proper subscription/plan management

    try {
      // Make OpenAI API call
      const completion = await openai.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens,
        stream: false, // For now, handle non-streaming only
      })

      const usage = completion.usage
      const totalTokens = usage?.total_tokens || 0
      const promptTokens = usage?.prompt_tokens || 0
      const completionTokens = usage?.completion_tokens || 0
      const cost = calculateCost(model, promptTokens, completionTokens)
      const responseContent = completion.choices[0]?.message?.content || ''

      // Save to ai_cost_logs table
      const { data: costLog, error: costLogError } = await supabase
        .from('ai_cost_logs')
        .insert({
          user_id: userId,
          model,
          feature: action || 'chat',
          input_tokens: promptTokens,
          output_tokens: completionTokens,
          cost,
          calculated_cost: cost,
          metadata: {
            request_id: requestId,
            workflow_id: workflowId,
            node_id: nodeId,
            response_content: responseContent,
            messages,
            temperature,
            max_tokens,
            test_mode: testUserId ? true : undefined
          }
        })
        .select()
        .single()

      if (costLogError) {
        logger.error('Failed to save cost log:', costLogError)
      }

      // Save to chat history for backward compatibility
      await supabase.from("ai_chat_history").insert({
        user_id: userId,
        message: messages[messages.length - 1].content,
        response: responseContent,
        model,
        tokens_used: totalTokens,
        cost_usd: cost,
        timestamp: new Date().toISOString(),
      })

      // Return response in expected format
      return NextResponse.json({
        requestId,
        content: responseContent,
        choices: completion.choices,
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
          cost_usd: cost
        },
        model: completion.model,
        created: completion.created,
        metadata: {
          timestamp: new Date().toISOString(),
          userId: userId,
        }
      })
      
    } catch (error) {
      // Log the error for debugging
      logger.error('OpenAI API error:', error)

      // Still try to save error to cost logs for tracking
      await supabase
        .from('ai_cost_logs')
        .insert({
          user_id: userId,
          model,
          feature: action || 'chat',
          input_tokens: 0,
          output_tokens: 0,
          cost: 0,
          calculated_cost: 0,
          metadata: {
            request_id: requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
            status: 'failed'
          }
        })

      return NextResponse.json(
        { error: 'AI service error', message: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500 }
      )
    }
    
  } catch (error) {
    logger.error("AI chat error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

function calculateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['gpt-3.5-turbo']
  const promptCost = (promptTokens / 1000) * pricing.prompt
  const completionCost = (completionTokens / 1000) * pricing.completion
  return parseFloat((promptCost + completionCost).toFixed(6))
}

