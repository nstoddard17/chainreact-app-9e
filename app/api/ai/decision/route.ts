/**
 * API endpoint for AI decision making
 * Used by the AI Decision Maker to get chain routing decisions
 */

import { NextRequest, NextResponse } from 'next/server'
import { OpenAI } from 'openai'
import { createClient } from '@supabase/supabase-js'

// Dynamic import for Anthropic SDK (optional dependency)
let Anthropic: any
try {
  Anthropic = require('@anthropic-ai/sdk').default
} catch {
  // Anthropic SDK not installed, will use OpenAI as fallback
  Anthropic = null
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { model, systemPrompt, userPrompt, temperature, userId } = body

    // Validate input
    if (!model || !systemPrompt || !userPrompt || !userId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    // Check user authentication
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check usage limits
    const { checkUsageLimit } = await import('@/lib/usageTracking')
    const usageCheck = await checkUsageLimit(userId, 'ai_decision')
    if (!usageCheck.allowed) {
      return NextResponse.json(
        {
          error: `AI usage limit exceeded. You've used ${usageCheck.current}/${usageCheck.limit} AI decisions this month.`
        },
        { status: 429 }
      )
    }

    let decision = '{}'

    try {
      // Route to appropriate AI provider
      if (model.includes('gpt')) {
        // Use OpenAI
        const openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY
        })

        const completion = await openai.chat.completions.create({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: temperature || 0.7,
          response_format: { type: 'json_object' }
        })

        decision = completion.choices[0].message.content || '{}'

      } else if (model.includes('claude')) {
        // Use Anthropic Claude if available
        if (Anthropic) {
          const anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY
          })

          const message = await anthropic.messages.create({
            model: model,
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
            temperature: temperature || 0.7
          })

          const content = message.content[0]
          decision = content.type === 'text' ? content.text : '{}'
        } else {
          // Fallback to OpenAI if Anthropic not available
          console.warn('Anthropic SDK not installed, using OpenAI as fallback')
          const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
          })

          const completion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: temperature || 0.7,
            response_format: { type: 'json_object' }
          })

          decision = completion.choices[0].message.content || '{}'
        }

      } else {
        // Default to OpenAI GPT-4
        const openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY
        })

        const completion = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: temperature || 0.7,
          response_format: { type: 'json_object' }
        })

        decision = completion.choices[0].message.content || '{}'
      }

      // Track usage
      const { trackUsage } = await import('@/lib/usageTracking')
      await trackUsage(userId, 'ai_decision', { model })

      return NextResponse.json({ decision })

    } catch (aiError: any) {
      console.error('AI provider error:', aiError)
      return NextResponse.json(
        {
          error: 'AI service temporarily unavailable',
          details: aiError.message
        },
        { status: 503 }
      )
    }

  } catch (error: any) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}