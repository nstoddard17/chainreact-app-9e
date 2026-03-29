import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { callAnthropicWithRetry } from '@/lib/ai/llm-retry'
import { AI_MODELS } from '@/lib/ai/models'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check feature entitlement (Pro plan or higher)
    const { requireFeature } = await import('@/lib/utils/require-entitlement')
    const entitlement = await requireFeature(user.id, 'aiAgents')
    if (!entitlement.allowed) return entitlement.response

    const { prompt, connectedIntegrations } = await request.json()

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 })
    }

    // Build context about connected integrations
    const integrationContext = connectedIntegrations?.length > 0
      ? `The user has these integrations connected: ${connectedIntegrations.join(', ')}.`
      : 'The user has not connected any integrations yet.'

    // Build dynamic examples based on connected integrations
    const examples = buildDynamicExamples(connectedIntegrations || [])

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
${examples}

Respond with ONLY the enhanced prompt, nothing else. No explanations, no quotes, just the improved prompt text.`

    const result = await callAnthropicWithRetry({
      messages: [
        {
          role: 'user',
          content: `Enhance this workflow prompt: "${prompt}"`,
        },
      ],
      system: systemPrompt,
      model: AI_MODELS.anthropic.fast,
      maxTokens: 300,
      temperature: 0.7,
      timeoutMs: 15000,
      label: 'enhance-prompt',
    })

    // Calculate approximate cost (Haiku pricing)
    const inputTokens = result.usage?.inputTokens || 0
    const outputTokens = result.usage?.outputTokens || 0
    const cost = (inputTokens * 0.00025 + outputTokens * 0.00125) / 1000

    return NextResponse.json({
      original: prompt,
      enhanced: result.content,
      cost: cost.toFixed(6),
    })

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to enhance prompt' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// Dynamic example generation
// ---------------------------------------------------------------------------

// Provider category mappings for example generation
const PROVIDER_CATEGORIES: Record<string, string[]> = {
  email: ['gmail', 'microsoft-outlook', 'outlook'],
  storage: ['google-drive', 'dropbox', 'onedrive'],
  spreadsheet: ['google-sheets', 'airtable'],
  chat: ['slack', 'discord', 'microsoft-teams'],
  crm: ['hubspot', 'salesforce'],
  calendar: ['google-calendar', 'microsoft-calendar'],
  payment: ['stripe'],
  social: ['twitter', 'linkedin'],
  docs: ['notion', 'google-docs'],
}

function findConnectedProvider(category: string, connected: string[]): string | null {
  const providers = PROVIDER_CATEGORIES[category] || []
  return providers.find(p => connected.includes(p)) || null
}

function providerDisplayName(provider: string): string {
  const names: Record<string, string> = {
    'gmail': 'Gmail',
    'microsoft-outlook': 'Outlook',
    'outlook': 'Outlook',
    'google-drive': 'Google Drive',
    'dropbox': 'Dropbox',
    'onedrive': 'OneDrive',
    'google-sheets': 'Google Sheets',
    'airtable': 'Airtable',
    'slack': 'Slack',
    'discord': 'Discord',
    'microsoft-teams': 'Teams',
    'hubspot': 'HubSpot',
    'salesforce': 'Salesforce',
    'stripe': 'Stripe',
    'notion': 'Notion',
    'google-calendar': 'Google Calendar',
    'microsoft-calendar': 'Outlook Calendar',
    'twitter': 'Twitter',
    'linkedin': 'LinkedIn',
    'google-docs': 'Google Docs',
  }
  return names[provider] || provider
}

function buildDynamicExamples(connected: string[]): string {
  const email = findConnectedProvider('email', connected)
  const storage = findConnectedProvider('storage', connected)
  const spreadsheet = findConnectedProvider('spreadsheet', connected)
  const chat = findConnectedProvider('chat', connected)

  const emailName = email ? providerDisplayName(email) : 'your email provider'
  const storageName = storage ? providerDisplayName(storage) : 'your cloud storage'
  const sheetName = spreadsheet ? providerDisplayName(spreadsheet) : 'your spreadsheet app'
  const chatName = chat ? providerDisplayName(chat) : 'your chat app'

  return [
    `- "notify me about emails" → "When I receive a new email in ${emailName}, send me a ${chatName} notification in #notifications with the sender name and subject line"`,
    `- "save attachments" → "When I receive an email with attachments in ${emailName}, automatically save the files to ${storageName} in a folder called 'Email Attachments'"`,
    `- "track expenses" → "When I receive an email with 'invoice' or 'receipt' in the subject, extract the details and add a new row to my ${sheetName} expense tracker"`,
  ].join('\n')
}
