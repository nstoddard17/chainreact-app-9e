import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'
import OpenAI from 'openai'

/**
 * Improve Prompt API Endpoint
 *
 * Takes a user's initial prompt and uses AI to improve it for better results.
 * Uses GPT-4o-mini for cost efficiency (~$0.003-0.004 per improvement).
 *
 * Cost Calculation:
 * - Input: ~50-100 tokens (system prompt + user prompt)
 * - Output: ~150-250 tokens (improved prompt)
 * - Total: ~200-350 tokens
 * - GPT-4o-mini: $0.00001 per 1k input tokens, $0.00003 per 1k output tokens
 * - Average cost: $0.003-0.004 per improvement
 */

const IMPROVEMENT_SYSTEM_PROMPT = `You are an expert at improving AI prompts for workflow automation. Your job is to take a user's initial prompt and make it:

1. **More specific and actionable** - Add clear instructions about what the AI should do
2. **Better structured** - Use clear formatting when needed (bullet points, sections)
3. **Include helpful context** - Suggest what information the AI needs
4. **Specify output format** - Make clear what format the response should be in
5. **Handle edge cases** - Add guidance for unexpected inputs

Keep the improved prompt concise (2-4 sentences or a short paragraph with bullets). Don't make it overly complex.

Examples of improvements:

USER: "analyze the email"
IMPROVED: "Analyze the email to extract: sender's request type (question/complaint/feedback), urgency level (high/medium/low), and required action (respond/forward/archive). Provide a 1-sentence summary of the main point."

USER: "check sentiment"
IMPROVED: "Analyze the sentiment of the text and classify it as: positive, negative, or neutral. Include a confidence score (0-100%) and highlight the key phrases that influenced your decision."

USER: "summarize"
IMPROVED: "Create a concise 3-bullet summary of the main points. Focus on: (1) the primary request or topic, (2) any important deadlines or urgency indicators, and (3) required actions or next steps."

Now improve the user's prompt. Return ONLY the improved prompt text, nothing else.`

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.error('[ImprovePrompt] Unauthorized request', { error: authError?.message })
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse request
    const body = await request.json()
    const { prompt } = body

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Prompt is required and must be a string' },
        { status: 400 }
      )
    }

    if (prompt.trim().length === 0) {
      return NextResponse.json(
        { error: 'Prompt cannot be empty' },
        { status: 400 }
      )
    }

    if (prompt.length > 2000) {
      return NextResponse.json(
        { error: 'Prompt is too long (max 2000 characters)' },
        { status: 400 }
      )
    }

    logger.info('[ImprovePrompt] Request received', {
      userId: user.id,
      promptLength: prompt.length
    })

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    if (!process.env.OPENAI_API_KEY) {
      logger.error('[ImprovePrompt] OpenAI API key not configured')
      return NextResponse.json(
        { error: 'AI service not configured' },
        { status: 500 }
      )
    }

    // Track start time for cost calculation
    const startTime = Date.now()

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: IMPROVEMENT_SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: `Improve this prompt:\n\n${prompt}`
        }
      ],
      temperature: 0.7,
      max_tokens: 300,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    })

    const duration = Date.now() - startTime

    // Extract improved prompt
    const improvedPrompt = completion.choices[0]?.message?.content?.trim()

    if (!improvedPrompt) {
      logger.error('[ImprovePrompt] No response from AI')
      return NextResponse.json(
        { error: 'Failed to improve prompt' },
        { status: 500 }
      )
    }

    // Calculate cost
    const usage = completion.usage
    const inputCost = (usage?.prompt_tokens || 0) * 0.00001 / 1000 // $0.00001 per 1k tokens
    const outputCost = (usage?.completion_tokens || 0) * 0.00003 / 1000 // $0.00003 per 1k tokens
    const totalCost = inputCost + outputCost

    logger.info('[ImprovePrompt] Success', {
      userId: user.id,
      originalLength: prompt.length,
      improvedLength: improvedPrompt.length,
      tokensUsed: usage?.total_tokens || 0,
      inputTokens: usage?.prompt_tokens || 0,
      outputTokens: usage?.completion_tokens || 0,
      cost: totalCost,
      duration
    })

    return NextResponse.json({
      success: true,
      originalPrompt: prompt,
      improvedPrompt,
      metadata: {
        tokensUsed: usage?.total_tokens || 0,
        inputTokens: usage?.prompt_tokens || 0,
        outputTokens: usage?.completion_tokens || 0,
        cost: totalCost,
        costFormatted: `$${totalCost.toFixed(4)}`,
        duration
      }
    })

  } catch (error: any) {
    logger.error('[ImprovePrompt] Error', {
      message: error?.message,
      stack: error?.stack
    })

    return NextResponse.json(
      { error: 'Failed to improve prompt', details: error?.message },
      { status: 500 }
    )
  }
}
