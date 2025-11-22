import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { handleCorsPreFlight } from '@/lib/utils/cors'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'

import { logger } from '@/lib/utils/logger'

// Model pricing per 1K tokens
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'gemini-pro': { input: 0.00025, output: 0.0005 }
}

/**
 * API endpoint for testing AI prompts
 * POST /api/workflows/ai/test-prompt
 *
 * Executes a prompt with sample data and returns the response
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const supabase = await createSupabaseRouteHandlerClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unauthorized', 401)
    }

    const body = await request.json()
    const {
      prompt,
      systemInstructions,
      model = 'gpt-4o-mini',
      temperature = 0.7,
      maxTokens = 1000,
      input = {}
    } = body

    if (!prompt || typeof prompt !== 'string') {
      return errorResponse('Prompt is required', 400)
    }

    // Resolve variables in prompt
    let resolvedPrompt = prompt
    for (const [key, value] of Object.entries(input)) {
      const placeholder = new RegExp(`\\{\\{(trigger\\.)?${key}\\}\\}`, 'g')
      resolvedPrompt = resolvedPrompt.replace(placeholder, String(value))
    }
    // Also replace nested object references
    resolvedPrompt = resolvedPrompt.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const parts = path.split('.')
      let value: any = input
      for (const part of parts) {
        if (part === 'trigger') continue
        value = value?.[part]
        if (value === undefined) return match
      }
      return String(value)
    })

    // Build system prompt
    const systemPrompt = systemInstructions
      ? `${systemInstructions}\n\nInput data available: ${JSON.stringify(input)}`
      : `You are a helpful AI assistant. Process the following request based on this input data: ${JSON.stringify(input)}`

    let output: string
    let tokensUsed = 0

    // Execute based on model provider
    if (model.startsWith('claude')) {
      // Anthropic
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      })

      const anthropicModel = model === 'claude-3-sonnet' ? 'claude-3-5-sonnet-20241022' : 'claude-3-haiku-20240307'

      const response = await anthropic.messages.create({
        model: anthropicModel,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [
          { role: 'user', content: resolvedPrompt }
        ]
      })

      output = response.content[0].type === 'text' ? response.content[0].text : ''
      tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)

    } else {
      // OpenAI (default)
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      })

      const response = await openai.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: resolvedPrompt }
        ],
        temperature,
        max_tokens: maxTokens
      })

      output = response.choices[0]?.message?.content?.trim() || ''
      tokensUsed = response.usage?.total_tokens || 0
    }

    // Calculate cost
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['gpt-4o-mini']
    const inputTokens = Math.floor(tokensUsed * 0.3) // Estimate 30% input
    const outputTokens = tokensUsed - inputTokens
    const cost = (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output

    const latency = Date.now() - startTime

    logger.debug('[AI Test Prompt] Test completed', {
      userId: user.id,
      model,
      tokensUsed,
      latency,
      cost
    })

    // Try to parse as JSON if it looks like JSON
    let parsedOutput: any = output
    if (output.startsWith('{') || output.startsWith('[')) {
      try {
        parsedOutput = JSON.parse(output)
      } catch {
        // Keep as string if not valid JSON
      }
    }

    return jsonResponse({
      success: true,
      output: parsedOutput,
      tokensUsed,
      cost,
      latency,
      model
    })

  } catch (error) {
    logger.error('Prompt test error:', error)
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to test prompt'
      },
      { status: 500 }
    )
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request, {
    allowCredentials: true,
    allowedMethods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
}
