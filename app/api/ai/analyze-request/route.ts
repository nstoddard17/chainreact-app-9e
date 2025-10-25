import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'

// Analysis API - determines what clarifications are needed before building workflow
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { prompt, connectedIntegrations } = await request.json()

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    logger.info('[ANALYZE] Analyzing user request:', { prompt, userId: user.id })

    // Call AI to analyze the request and determine what clarifications are needed
    const analysisPrompt = `You are an expert workflow automation assistant. Analyze this user request and determine what clarifications are needed BEFORE building the workflow.

USER REQUEST: "${prompt}"

CONNECTED INTEGRATIONS: ${connectedIntegrations?.join(', ') || 'none'}

Your task:
1. Identify what integrations/services will be used
2. For each service, determine what CRITICAL information is missing that you absolutely need to know
3. For each missing piece of information, determine:
   - What type of input is needed (dropdown, text, multiselect, etc.)
   - What API endpoint should provide the options (for dropdowns)
   - Whether this is REQUIRED or optional

IMPORTANT RULES:
- Only ask about CRITICAL information you cannot infer or use reasonable defaults for
- If the user has only ONE integration of a type (e.g., only Gmail for email), DON'T ask which email service - infer it
- For destination fields like "send to Slack channel", you MUST ask which specific channel
- For filter fields like "from specific sender", make it optional (don't ask unless the user mentioned filtering)

Return a JSON response with this structure:
{
  "needsClarification": boolean,
  "questions": [
    {
      "id": "slack_channel",
      "question": "Which Slack channel would you like to send messages to?",
      "fieldType": "dropdown",
      "dataEndpoint": "/api/integrations/slack/channels",
      "nodeType": "slack_action_send_message",
      "configField": "channel",
      "required": true
    }
  ],
  "inferredData": {
    "email_source": "gmail",
    "reasoning": "User has only Gmail connected"
  }
}

Return ONLY valid JSON, no other text.`

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured')
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: analysisPrompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('[ANALYZE] OpenAI API error:', { status: response.status, error: errorText })
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    const analysisResult = JSON.parse(data.choices[0].message.content)

    logger.info('[ANALYZE] Analysis complete:', analysisResult)

    return NextResponse.json(analysisResult)

  } catch (error: any) {
    logger.error('[ANALYZE] Analysis failed:', error)
    return NextResponse.json(
      { error: error.message || 'Analysis failed' },
      { status: 500 }
    )
  }
}
