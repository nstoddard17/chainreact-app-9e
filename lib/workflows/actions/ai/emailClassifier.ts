/**
 * AI Email Classifier Action
 *
 * Uses Claude/GPT to semantically analyze email content and determine if it
 * matches the user's described intent.
 */

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

const ConfigSchema = z.object({
  intent: z.string().min(1, 'Intent description is required'),
  emailBody: z.string().min(1, 'Email body is required'),
  emailSubject: z.string().optional(),
  matchThreshold: z.enum(['low', 'medium', 'high']).default('medium'),
  additionalContext: z.string().optional()
})

type Config = z.infer<typeof ConfigSchema>

interface ClassificationResult {
  matches: boolean
  confidence: number
  reasoning: string
  categories: string[]
  sentiment: string
  keyPoints: string[]
}

export async function executeEmailClassifier(config: Config): Promise<ClassificationResult> {
  // Validate config
  const validated = ConfigSchema.parse(config)

  // Get threshold values
  const thresholds = {
    low: 50,
    medium: 70,
    high: 90
  }
  const requiredConfidence = thresholds[validated.matchThreshold]

  // Initialize Anthropic client
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  })

  // Build the prompt
  const systemPrompt = `You are an email classification assistant. Your job is to analyze email content and determine if it matches the user's described intent.

You must respond with valid JSON containing:
- matches: boolean (true if email matches the intent)
- confidence: number (0-100, how confident you are)
- reasoning: string (explain why it matches or doesn't)
- categories: string[] (topics detected, e.g., ["complaint", "urgent", "shipping"])
- sentiment: string (positive, negative, neutral, urgent)
- keyPoints: string[] (main points from the email)

Be thorough but concise. Understand context, tone, and implied meaning - not just keywords.`

  const userPrompt = `**User Intent:** ${validated.intent}

${validated.additionalContext ? `**Additional Context:** ${validated.additionalContext}\n\n` : ''}**Email Subject:** ${validated.emailSubject || '(No subject)'}

**Email Body:**
${validated.emailBody}

---

Does this email match the user's intent? Analyze the content carefully and respond with JSON.`

  try {
    // Call Claude
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      temperature: 0.3, // Lower temperature for more consistent classification
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ]
    })

    // Parse Claude's response
    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude')
    }

    // Extract JSON from response (Claude might wrap it in markdown)
    let jsonText = content.text.trim()
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '')
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '')
    }

    const result = JSON.parse(jsonText) as ClassificationResult

    // Apply confidence threshold
    if (result.confidence < requiredConfidence) {
      result.matches = false
      result.reasoning += ` (Confidence ${result.confidence}% is below threshold ${requiredConfidence}%)`
    }

    return result

  } catch (error: any) {
    console.error('[AI Email Classifier] Error:', error)

    // Return safe default on error
    return {
      matches: false,
      confidence: 0,
      reasoning: `Error during classification: ${error.message}`,
      categories: ['error'],
      sentiment: 'unknown',
      keyPoints: []
    }
  }
}

// Export for registration
export default {
  execute: executeEmailClassifier,
  schema: ConfigSchema
}
