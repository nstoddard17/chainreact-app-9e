import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/utils/supabase/server'

const anthropic = new Anthropic()

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { prompt, connectedIntegrations } = await request.json()

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 })
    }

    // Build context about connected integrations
    const integrationContext = connectedIntegrations?.length > 0
      ? `The user has these integrations connected: ${connectedIntegrations.join(', ')}.`
      : 'The user has not connected any integrations yet.'

    const systemPrompt = `You are a workflow automation assistant. Your job is to enhance user prompts to be more specific and actionable for creating automated workflows.

${integrationContext}

Guidelines for enhancing prompts:
1. If the user mentions vague terms like "email", "calendar", "chat", suggest specific apps they have connected
2. Clarify the trigger (what starts the workflow) and actions (what happens)
3. Add specific details like channels, folders, or filters if they make sense
4. Keep the enhanced prompt concise but complete
5. Preserve the user's original intent - don't add features they didn't ask for
6. Use natural language, not technical jargon

Examples:
- "notify me about emails" → "When I receive a new email in Gmail, send me a Slack notification in #notifications with the sender name and subject line"
- "save attachments" → "When I receive an email with attachments in Gmail, automatically save the files to my Google Drive in a folder called 'Email Attachments'"
- "track expenses" → "When I receive an email with 'invoice' or 'receipt' in the subject, extract the details and add a new row to my Google Sheets expense tracker"

Respond with ONLY the enhanced prompt, nothing else. No explanations, no quotes, just the improved prompt text.`

    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `Enhance this workflow prompt: "${prompt}"`
        }
      ],
      system: systemPrompt,
    })

    const enhancedPrompt = response.content[0].type === 'text'
      ? response.content[0].text.trim()
      : prompt

    // Calculate approximate cost (Haiku pricing)
    const inputTokens = response.usage?.input_tokens || 0
    const outputTokens = response.usage?.output_tokens || 0
    const cost = (inputTokens * 0.00025 + outputTokens * 0.00125) / 1000

    return NextResponse.json({
      original: prompt,
      enhanced: enhancedPrompt,
      cost: cost.toFixed(6),
    })

  } catch (error: any) {
    console.error('[enhance-prompt] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to enhance prompt' },
      { status: 500 }
    )
  }
}
