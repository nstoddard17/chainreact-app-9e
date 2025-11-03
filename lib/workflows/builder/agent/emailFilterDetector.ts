/**
 * Email Filter Detector
 *
 * Analyzes user prompts to extract email filtering intent:
 * - Specific email addresses (from field)
 * - Subject keywords (exact or semantic matching)
 * - Semantic content matching (requires AI classifier)
 */

import Anthropic from '@anthropic-ai/sdk'

export interface EmailFilterIntent {
  type: 'simple' | 'semantic' | 'hybrid'

  // Simple filters (can use native Gmail filters)
  fromAddress?: string
  subjectKeyword?: string
  hasAttachment?: 'any' | 'yes' | 'no'
  folder?: string

  // Semantic filtering (requires AI classifier node)
  semanticIntent?: string
  requiresAIClassifier: boolean

  // Confidence
  confidence: number
}

const systemPrompt = `You are an email filter intent analyzer. Given a user's workflow prompt, determine:

1. **Simple filters**: Email address, subject keywords, attachments
2. **Semantic intent**: Abstract topics that require AI understanding (e.g., "about our return policy")

Respond with JSON:
{
  "type": "simple" | "semantic" | "hybrid",
  "fromAddress": "email@example.com" or null,
  "subjectKeyword": "exact keyword" or null,
  "hasAttachment": "any" | "yes" | "no",
  "folder": "inbox" | "sent" etc or null,
  "semanticIntent": "description of what email should be about" or null,
  "requiresAIClassifier": boolean,
  "confidence": 0-100
}

**Examples:**

Prompt: "When I get an email from boss@company.com send it to slack"
Response: {
  "type": "simple",
  "fromAddress": "boss@company.com",
  "requiresAIClassifier": false,
  "confidence": 95
}

Prompt: "When I get an email about our return policy send it to slack"
Response: {
  "type": "semantic",
  "semanticIntent": "emails asking about or discussing our return policy",
  "requiresAIClassifier": true,
  "confidence": 90
}

Prompt: "When I get an email from support@company.com about billing issues"
Response: {
  "type": "hybrid",
  "fromAddress": "support@company.com",
  "semanticIntent": "emails discussing billing issues, payment problems, or invoice questions",
  "requiresAIClassifier": true,
  "confidence": 92
}

Be precise. Extract email addresses exactly. For semantic intent, describe what the email should be about.`

/**
 * Analyze a workflow prompt to detect email filtering intent
 */
export async function detectEmailFilters(prompt: string): Promise<EmailFilterIntent> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  })

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 512,
      temperature: 0.2,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Analyze this workflow prompt and extract email filtering intent:\n\n"${prompt}"`
        }
      ]
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type')
    }

    // Parse JSON
    let jsonText = content.text.trim()
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '')
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '')
    }

    const result = JSON.parse(jsonText) as EmailFilterIntent

    return result

  } catch (error: any) {
    console.error('[Email Filter Detector] Error:', error)

    // Default: no filters detected
    return {
      type: 'simple',
      requiresAIClassifier: false,
      confidence: 0
    }
  }
}

/**
 * Generate workflow plan edits based on detected filters
 */
export function generateEmailFilterEdits(filters: EmailFilterIntent) {
  const edits: any[] = []

  // 1. Configure Gmail trigger
  const gmailTriggerConfig: any = {}

  if (filters.fromAddress) {
    gmailTriggerConfig.from = filters.fromAddress
  }

  if (filters.subjectKeyword) {
    gmailTriggerConfig.subject = filters.subjectKeyword
    gmailTriggerConfig.subjectExactMatch = true
  }

  if (filters.hasAttachment && filters.hasAttachment !== 'any') {
    gmailTriggerConfig.hasAttachment = filters.hasAttachment
  }

  if (filters.folder) {
    gmailTriggerConfig.labelIds = [filters.folder.toUpperCase()]
  }

  // 2. Add AI Content Filter to Gmail trigger if needed
  if (filters.requiresAIClassifier && filters.semanticIntent) {
    gmailTriggerConfig.aiContentFilter = filters.semanticIntent
    gmailTriggerConfig.aiFilterConfidence = 'medium' // Default to balanced confidence
  }

  // Push the complete config (with both basic and AI filters if applicable)
  if (Object.keys(gmailTriggerConfig).length > 0) {
    edits.push({
      op: 'setConfig',
      nodeId: 'trigger', // Assumes trigger node ID
      patch: gmailTriggerConfig
    })
  }

  return edits
}

// Example usage in planner:
/*
const filters = await detectEmailFilters(userPrompt)
const filterEdits = generateEmailFilterEdits(filters)
edits.push(...filterEdits)
*/
