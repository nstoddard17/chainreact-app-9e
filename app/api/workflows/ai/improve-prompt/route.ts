import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { handleCorsPreFlight } from '@/lib/utils/cors'
import OpenAI from 'openai'

import { logger } from '@/lib/utils/logger'

/**
 * API endpoint for improving AI prompts
 * POST /api/workflows/ai/improve-prompt
 *
 * Uses AI to enhance user prompts for better results
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unauthorized', 401)
    }

    const body = await request.json()
    const { prompt, context, availableVariables } = body

    if (!prompt || typeof prompt !== 'string') {
      return errorResponse('Prompt is required', 400)
    }

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })

    // Build the available variables section for the system prompt
    let variablesSection = ''
    if (availableVariables && Array.isArray(availableVariables) && availableVariables.length > 0) {
      const variablesList = availableVariables.map((v: any) => {
        const desc = v.description ? ` - ${v.description}` : ''
        return `  - ${v.reference} (${v.fieldType}) from "${v.nodeTitle}": ${v.fieldName}${desc}`
      }).join('\n')

      variablesSection = `
AVAILABLE VARIABLES FROM THIS WORKFLOW:
${variablesList}

IMPORTANT: You MUST only use the variables listed above. Do not invent or guess variable names.
If you need data that isn't available, use a descriptive placeholder like {{your_data_here}} and note it needs to be configured.
`
    } else {
      variablesSection = `
NO UPSTREAM VARIABLES AVAILABLE:
This node has no previous steps to pull data from.
Use generic placeholders like {{input}} or {{data}} that the user can replace, or write the prompt without variables.
`
    }

    const systemPrompt = `You are an expert prompt engineer. Your task is to improve user prompts for AI workflow automation.

IMPROVEMENT GUIDELINES:
1. Make the prompt clear and specific
2. Add structure (numbered steps, bullet points)
3. Use ONLY the available variables listed below - do not invent variable names
4. Specify the desired output format
5. Add context clues for better AI understanding
6. Keep the core intent but enhance clarity
${variablesSection}
USER CONTEXT:
- Tone preference: ${context?.tone || 'professional'}
- Verbosity: ${context?.verbosity || 'concise'}
- Model: ${context?.model || 'gpt-4o-mini'}

RULES:
- Maintain the original intent
- Don't add unnecessary complexity
- Keep it actionable and clear
- ONLY use variables from the AVAILABLE VARIABLES list above
- Return ONLY the improved prompt, no explanations`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Improve this prompt:\n\n${prompt}` }
      ],
      temperature: 0.7,
      max_tokens: 1000
    })

    const improvedPrompt = response.choices[0]?.message?.content?.trim()

    if (!improvedPrompt) {
      throw new Error('Failed to generate improved prompt')
    }

    logger.debug('[AI Improve Prompt] Prompt improved', {
      userId: user.id,
      originalLength: prompt.length,
      improvedLength: improvedPrompt.length
    })

    return jsonResponse({
      success: true,
      improvedPrompt,
      tokensUsed: response.usage?.total_tokens || 0
    })

  } catch (error) {
    logger.error('Prompt improvement error:', error)
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to improve prompt'
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
