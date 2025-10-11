/**
 * API endpoint for AI field value generation
 * Used by the AI Field Generator to create values for workflow fields
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

// Cache for field values to reduce API calls
const fieldCache = new Map<string, { value: any; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      model,
      systemPrompt,
      userPrompt,
      temperature,
      fieldType,
      userId
    } = body

    // Validate input
    if (!model || !systemPrompt || !userPrompt) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    // Check cache
    const cacheKey = `${userId}-${fieldType}-${userPrompt.substring(0, 100)}`
    const cached = fieldCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('📦 Returning cached field value')
      return NextResponse.json({ value: cached.value })
    }

    // For anonymous field generation (during workflow building)
    if (!userId) {
      // Allow limited anonymous generation for testing
      const value = await generateFieldValue(
        model,
        systemPrompt,
        userPrompt,
        temperature,
        fieldType
      )
      return NextResponse.json({ value })
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
    const usageCheck = await checkUsageLimit(userId, 'ai_field_generation')
    if (!usageCheck.allowed) {
      return NextResponse.json(
        {
          error: `AI usage limit exceeded. You've used ${usageCheck.current}/${usageCheck.limit} field generations this month.`
        },
        { status: 429 }
      )
    }

    // Generate field value
    const value = await generateFieldValue(
      model,
      systemPrompt,
      userPrompt,
      temperature,
      fieldType
    )

    // Cache the result
    fieldCache.set(cacheKey, { value, timestamp: Date.now() })

    // Clean old cache entries
    if (fieldCache.size > 100) {
      const now = Date.now()
      for (const [key, entry] of fieldCache.entries()) {
        if (now - entry.timestamp > CACHE_TTL) {
          fieldCache.delete(key)
        }
      }
    }

    // Track usage
    const { trackUsage } = await import('@/lib/usageTracking')
    await trackUsage(userId, 'ai_field_generation', { model, fieldType })

    return NextResponse.json({ value })

  } catch (error: any) {
    console.error('Field generation API error:', error)
    return NextResponse.json(
      { error: 'Failed to generate field value' },
      { status: 500 }
    )
  }
}

async function generateFieldValue(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.7,
  fieldType?: string
): Promise<string> {
  try {
    let value = ''

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
        temperature,
        max_tokens: 500
      })

      value = completion.choices[0].message.content || ''

    } else if (model.includes('claude')) {
      // Use Anthropic Claude if available
      if (Anthropic) {
        const anthropic = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY
        })

        const message = await anthropic.messages.create({
          model: model,
          max_tokens: 500,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          temperature
        })

        const content = message.content[0]
        value = content.type === 'text' ? content.text : ''
      } else {
        // Fallback to OpenAI if Anthropic not available
        console.warn('Anthropic SDK not installed, using OpenAI as fallback for field generation')
        const openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY
        })

        const completion = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature,
          max_tokens: 500
        })

        value = completion.choices[0].message.content || ''
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
        temperature,
        max_tokens: 500
      })

      value = completion.choices[0].message.content || ''
    }

    // Post-process based on field type
    if (fieldType) {
      value = postProcessFieldValue(value, fieldType)
    }

    return value

  } catch (error: any) {
    console.error('AI generation error:', error)

    // Return default value based on field type
    return getDefaultFieldValue(fieldType)
  }
}

function postProcessFieldValue(value: string, fieldType: string): string {
  const trimmed = value.trim()

  switch (fieldType) {
    case 'number': {
      const num = parseFloat(trimmed)
      return isNaN(num) ? '0' : num.toString()
    }

    case 'boolean':
      return trimmed.toLowerCase() === 'true' ? 'true' : 'false'

    case 'date': {
      const date = new Date(trimmed)
      return isNaN(date.getTime())
        ? new Date().toISOString()
        : date.toISOString()
    }

    case 'url':
      if (!trimmed.startsWith('http')) {
        return `https://${trimmed}`
      }
      return trimmed

    case 'email_content':
    case 'message':
      // Remove quotes if the AI wrapped the response in them
      return trimmed.replace(/^["']|["']$/g, '')

    default:
      return trimmed
  }
}

function getDefaultFieldValue(fieldType?: string): string {
  if (!fieldType) return 'Generated value'

  switch (fieldType) {
    case 'message':
      return 'Generated message content'
    case 'subject':
      return 'Generated Subject'
    case 'email_content':
      return 'Dear recipient,\n\nGenerated email content.\n\nBest regards'
    case 'description':
      return 'Generated description'
    case 'name':
      return 'Generated Name'
    case 'number':
      return '0'
    case 'boolean':
      return 'true'
    case 'date':
      return new Date().toISOString()
    case 'url':
      return 'https://example.com'
    default:
      return 'Generated value'
  }
}