import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import OpenAI from 'openai'
import { v4 as uuidv4 } from 'uuid'

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
    
    // Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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

    // Check for existing request (idempotency)
    const { data: existingRequest } = await supabase
      .from('ai_usage_records')
      .select('*')
      .eq('request_id', requestId)
      .single()

    if (existingRequest) {
      console.log('Request already processed:', requestId)
      return NextResponse.json({
        requestId,
        cached: true,
        content: existingRequest.response_content,
        usage: {
          prompt_tokens: existingRequest.prompt_tokens,
          completion_tokens: existingRequest.completion_tokens,
          total_tokens: existingRequest.total_tokens,
          cost_usd: existingRequest.cost_usd
        }
      })
    }

    // Check user's budget
    const { data: budget } = await supabase
      .from('ai_usage_budgets')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .gte('budget_period_end', new Date().toISOString())
      .single()

    if (budget) {
      const usagePercent = (budget.current_usage_usd / budget.monthly_budget_usd) * 100
      
      // Hard stop at 100%
      if (budget.enforcement_mode === 'hard' && usagePercent >= 100) {
        return NextResponse.json({
          error: 'Monthly AI usage limit exceeded',
          usage_percent: usagePercent,
          upgrade_url: '/settings/billing'
        }, { status: 429 })
      }
      
      // Soft warning at 100%
      if (budget.enforcement_mode === 'soft' && usagePercent >= 100) {
        console.warn(`User ${user.id} exceeded soft limit at ${usagePercent}%`)
      }
    }

    // Create initial usage record
    const { data: usageRecord, error: insertError } = await supabase
      .from('ai_usage_records')
      .insert({
        request_id: requestId,
        user_id: user.id,
        provider: 'openai',
        model,
        action,
        workflow_id: workflowId,
        node_id: nodeId,
        status: 'pending'
      })
      .select()
      .single()

    if (insertError) {
      console.error('Failed to create usage record:', insertError)
      // Continue anyway but log the error
    }

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

      // Update usage record if it was created
      if (usageRecord) {
        await supabase
          .from('ai_usage_records')
          .update({
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens,
            cost_usd: cost,
            status: 'completed',
            completed_at: new Date().toISOString()
          })
          .eq('id', usageRecord.id)
      }

      // Update budget if exists
      if (budget) {
        await supabase
          .from('ai_usage_budgets')
          .update({
            current_usage_usd: budget.current_usage_usd + cost,
            last_updated: new Date().toISOString()
          })
          .eq('id', budget.id)
        
        // Check for alerts
        const newUsagePercent = ((budget.current_usage_usd + cost) / budget.monthly_budget_usd) * 100
        await checkAndSendAlerts(supabase, user.id, newUsagePercent, budget)
      }

      // Save to chat history for backward compatibility
      await supabase.from("ai_chat_history").insert({
        user_id: user.id,
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
          userId: user.id,
        }
      })
      
    } catch (error) {
      // Update usage record with error if it exists
      if (usageRecord) {
        await supabase
          .from('ai_usage_records')
          .update({
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error',
            completed_at: new Date().toISOString()
          })
          .eq('id', usageRecord.id)
      }

      console.error('OpenAI API error:', error)
      return NextResponse.json(
        { error: 'AI service error', message: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500 }
      )
    }
    
  } catch (error) {
    console.error("AI chat error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

function calculateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['gpt-3.5-turbo']
  const promptCost = (promptTokens / 1000) * pricing.prompt
  const completionCost = (completionTokens / 1000) * pricing.completion
  return parseFloat((promptCost + completionCost).toFixed(6))
}

async function checkAndSendAlerts(supabase: any, userId: string, usagePercent: number, budget: any) {
  const thresholds = [
    { percent: 75, type: 'usage_75', level: 'warning' },
    { percent: 90, type: 'usage_90', level: 'alert' },
    { percent: 100, type: 'usage_100', level: 'error' }
  ]

  // Check which alerts have already been sent this period
  const { data: existingAlerts } = await supabase
    .from('ai_usage_alerts')
    .select('alert_type')
    .eq('user_id', userId)
    .gte('created_at', budget.budget_period_start)

  const sentAlertTypes = new Set(existingAlerts?.map((a: any) => a.alert_type) || [])

  // Send new alerts
  for (const threshold of thresholds) {
    if (usagePercent >= threshold.percent && !sentAlertTypes.has(threshold.type)) {
      await supabase
        .from('ai_usage_alerts')
        .insert({
          user_id: userId,
          alert_type: threshold.type,
          alert_level: threshold.level,
          message: `You've used ${Math.round(usagePercent)}% of your monthly AI budget`,
          metadata: {
            usage_percent: usagePercent,
            budget_usd: budget.monthly_budget_usd,
            current_usage_usd: budget.current_usage_usd
          }
        })
    }
  }
}
