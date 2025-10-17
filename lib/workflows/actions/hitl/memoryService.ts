/**
 * AI Memory & Learning Service for HITL
 * Extracts learnings from conversations and stores them in user-controlled documents
 */

import OpenAI from 'openai'
import { logger } from '@/lib/utils/logger'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import type { ConversationMessage } from './types'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

/**
 * Extract learnings from a completed HITL conversation
 */
export async function extractLearningsFromConversation(
  conversationHistory: ConversationMessage[],
  contextData: any,
  memoryCategories: string[]
): Promise<Record<string, any>> {
  try {
    logger.info('[Memory] Extracting learnings from conversation', {
      messageCount: conversationHistory.length,
      categories: memoryCategories
    })

    // Build prompt for learning extraction
    const prompt = buildLearningExtractionPrompt(conversationHistory, contextData, memoryCategories)

    // Call OpenAI to analyze conversation and extract patterns
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: prompt
        },
        {
          role: 'user',
          content: 'Analyze the conversation and extract learnings in JSON format.'
        }
      ],
      temperature: 0.3, // Lower temperature for more consistent extraction
      response_format: { type: 'json_object' }
    })

    const learnings = JSON.parse(response.choices[0].message.content || '{}')

    logger.info('[Memory] Learnings extracted successfully', {
      categoriesFound: Object.keys(learnings).length
    })

    return learnings

  } catch (error: any) {
    logger.error('[Memory] Failed to extract learnings', { error: error.message })
    return {}
  }
}

/**
 * Build prompt for learning extraction
 */
function buildLearningExtractionPrompt(
  conversationHistory: ConversationMessage[],
  contextData: any,
  memoryCategories: string[]
): string {
  const categoryDescriptions: Record<string, string> = {
    tone_preferences: 'User preferences for communication tone and style (e.g., formal vs casual, emoji usage, language style)',
    formatting_rules: 'Specific formatting requirements (e.g., date formats, capitalization, structure, templates)',
    approval_criteria: 'What the user looks for when approving content (e.g., specific checks, requirements, red flags)',
    common_corrections: 'Frequent changes the user makes (e.g., always changing X to Y, removing certain phrases)',
    business_context: 'Business policies, rules, and constraints mentioned (e.g., working hours, approval processes, limits)',
    user_preferences: 'Personal preferences and habits (e.g., preferred times, specific people to CC, default settings)'
  }

  const categoryInstructions = memoryCategories
    .map(cat => `- **${cat}**: ${categoryDescriptions[cat] || 'General preferences in this category'}`)
    .join('\n')

  return `You are analyzing a conversation between a user and an AI assistant to extract learnings that should be remembered for future interactions.

Context of what was being reviewed:
${typeof contextData === 'string' ? contextData : JSON.stringify(contextData, null, 2)}

Conversation history:
${conversationHistory.map((msg, idx) =>
  `${idx + 1}. [${msg.role.toUpperCase()}]: ${msg.content}`
).join('\n\n')}

Extract learnings in the following categories:
${categoryInstructions}

For each category, extract:
1. Specific patterns or preferences mentioned
2. Corrections or changes the user requested
3. Policies or rules they referenced
4. Preferences they expressed

Return a JSON object with this structure:
{
  "tone_preferences": {
    "patterns": ["specific observation 1", "specific observation 2"],
    "examples": ["example from conversation"],
    "confidence": 0.8
  },
  "formatting_rules": {
    "patterns": ["specific rule 1", "specific rule 2"],
    "examples": ["example from conversation"],
    "confidence": 0.9
  },
  ... (for each requested category)
}

IMPORTANT:
- Only include categories where you found actual learnings
- Be specific and actionable - not generic
- Include confidence score (0-1) based on how clear the pattern is
- Use actual quotes or paraphrases from the conversation as examples
- If no learnings found for a category, omit it from the response`
}

/**
 * Save learnings to user's document (primary storage)
 */
export async function saveLearningsToDocument(
  documentInfo: any,
  existingLearnings: Record<string, any>,
  newLearnings: Record<string, any>,
  userId: string
): Promise<boolean> {
  try {
    // Parse document info
    const docInfo = typeof documentInfo === 'string' ? JSON.parse(documentInfo) : documentInfo

    logger.info('[Memory] Saving learnings to user document', {
      provider: docInfo.provider,
      documentId: docInfo.id
    })

    // Merge new learnings with existing ones
    const mergedLearnings = mergeLearnings(existingLearnings, newLearnings)

    // Format as readable content
    const documentContent = formatLearningsForDocument(mergedLearnings)

    // Save to provider-specific storage
    const saved = await saveToProvider(docInfo, documentContent, userId)

    if (saved) {
      logger.info('[Memory] Learnings saved successfully to user document')
    }

    return saved

  } catch (error: any) {
    logger.error('[Memory] Failed to save learnings to document', { error: error.message })
    return false
  }
}

/**
 * Merge new learnings with existing ones
 */
function mergeLearnings(
  existing: Record<string, any>,
  newLearnings: Record<string, any>
): Record<string, any> {
  const merged = { ...existing }

  for (const [category, newData] of Object.entries(newLearnings)) {
    if (!merged[category]) {
      // New category - add it
      merged[category] = newData
    } else {
      // Existing category - merge patterns and update confidence
      const existingData = merged[category]

      // Merge patterns (avoiding duplicates)
      const allPatterns = [
        ...(existingData.patterns || []),
        ...(newData.patterns || [])
      ]
      const uniquePatterns = Array.from(new Set(allPatterns))

      // Merge examples (keep recent ones)
      const allExamples = [
        ...(existingData.examples || []),
        ...(newData.examples || [])
      ]
      const recentExamples = allExamples.slice(-10) // Keep last 10 examples

      // Average confidence (weighted toward existing if more established)
      const existingConfidence = existingData.confidence || 0.5
      const newConfidence = newData.confidence || 0.5
      const mergedConfidence = (existingConfidence * 0.7 + newConfidence * 0.3)

      merged[category] = {
        patterns: uniquePatterns,
        examples: recentExamples,
        confidence: mergedConfidence,
        lastUpdated: new Date().toISOString(),
        updateCount: (existingData.updateCount || 0) + 1
      }
    }
  }

  return merged
}

/**
 * Format learnings as readable document content
 */
function formatLearningsForDocument(learnings: Record<string, any>): string {
  let content = '# AI Memory & Learnings\n\n'
  content += `Last updated: ${new Date().toISOString()}\n\n`
  content += '---\n\n'

  for (const [category, data] of Object.entries(learnings)) {
    // Format category name
    const categoryName = category
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())

    content += `## ${categoryName}\n\n`

    if (data.patterns && data.patterns.length > 0) {
      content += '**Patterns:**\n'
      data.patterns.forEach((pattern: string) => {
        content += `- ${pattern}\n`
      })
      content += '\n'
    }

    if (data.examples && data.examples.length > 0) {
      content += '**Examples:**\n'
      data.examples.forEach((example: string) => {
        content += `- ${example}\n`
      })
      content += '\n'
    }

    content += `**Confidence:** ${(data.confidence * 100).toFixed(0)}%\n`
    content += `**Last Updated:** ${data.lastUpdated || 'N/A'}\n`
    content += `**Updates:** ${data.updateCount || 1}\n\n`
    content += '---\n\n'
  }

  content += '\n\n_This document is automatically updated by your AI workflow assistant. You can edit it directly to add or modify learnings._'

  return content
}

/**
 * Save content to provider-specific storage
 */
async function saveToProvider(
  docInfo: any,
  content: string,
  userId: string
): Promise<boolean> {
  const { provider, id, name } = docInfo

  try {
    switch (provider) {
      case 'google_docs':
        // TODO: Implement Google Docs save
        logger.warn('[Memory] Google Docs save not yet implemented')
        return false

      case 'notion':
        // TODO: Implement Notion save
        logger.warn('[Memory] Notion save not yet implemented')
        return false

      case 'onedrive':
        // TODO: Implement OneDrive save
        logger.warn('[Memory] OneDrive save not yet implemented')
        return false

      default:
        logger.warn('[Memory] Unknown provider for saving', { provider })
        return false
    }
  } catch (error: any) {
    logger.error('[Memory] Provider-specific save failed', { error: error.message, provider })
    return false
  }
}

/**
 * Cache learnings in Supabase database (optional performance optimization)
 */
export async function cacheLearningsInDatabase(
  userId: string,
  workflowId: string,
  conversationId: string,
  learnings: Record<string, any>
): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient()

    // Store each learning as a separate record for easier querying
    const records = []

    for (const [category, data] of Object.entries(learnings)) {
      if (data.patterns && data.patterns.length > 0) {
        records.push({
          user_id: userId,
          workflow_id: workflowId,
          scope: 'workflow',
          category,
          learning_summary: data.patterns.join('; '),
          learning_data: data,
          confidence_score: data.confidence || 0.5,
          source_conversation_id: conversationId,
          usage_count: 0
        })
      }
    }

    if (records.length > 0) {
      const { error } = await supabase
        .from('hitl_memory')
        .insert(records)

      if (error) {
        logger.error('[Memory] Failed to cache learnings in database', { error })
      } else {
        logger.info('[Memory] Learnings cached in database', { count: records.length })
      }
    }

  } catch (error: any) {
    logger.error('[Memory] Database caching error', { error: error.message })
  }
}

/**
 * Load learnings from database cache
 */
export async function loadLearningsFromCache(
  userId: string,
  workflowId: string
): Promise<Record<string, any>> {
  try {
    const supabase = await createSupabaseServerClient()

    const { data, error } = await supabase
      .from('hitl_memory')
      .select('*')
      .eq('user_id', userId)
      .eq('workflow_id', workflowId)
      .order('confidence_score', { ascending: false })
      .order('usage_count', { ascending: false })

    if (error || !data || data.length === 0) {
      return {}
    }

    // Group by category
    const learnings: Record<string, any> = {}

    for (const record of data) {
      if (!learnings[record.category]) {
        learnings[record.category] = record.learning_data
      } else {
        // Merge if multiple records for same category
        const existing = learnings[record.category]
        learnings[record.category] = mergeLearnings(existing, record.learning_data)
      }
    }

    logger.info('[Memory] Loaded learnings from cache', {
      categories: Object.keys(learnings).length,
      records: data.length
    })

    return learnings

  } catch (error: any) {
    logger.error('[Memory] Failed to load from cache', { error: error.message })
    return {}
  }
}

/**
 * Main function: Process conversation and update memory
 */
export async function processConversationLearnings(
  conversationId: string,
  userId: string,
  workflowId: string,
  conversationHistory: ConversationMessage[],
  contextData: any,
  config: {
    enableMemory?: boolean
    memoryCategories?: string[]
    memoryStorageDocument?: any
    cacheInDatabase?: boolean
  }
): Promise<void> {
  if (!config.enableMemory) {
    logger.debug('[Memory] Learning disabled for this conversation')
    return
  }

  try {
    logger.info('[Memory] Processing conversation learnings', { conversationId })

    // 1. Extract learnings from conversation
    const categories = config.memoryCategories || [
      'tone_preferences',
      'formatting_rules',
      'approval_criteria',
      'common_corrections'
    ]

    const newLearnings = await extractLearningsFromConversation(
      conversationHistory,
      contextData,
      categories
    )

    if (Object.keys(newLearnings).length === 0) {
      logger.info('[Memory] No new learnings extracted')
      return
    }

    // 2. Load existing learnings from user's document
    let existingLearnings: Record<string, any> = {}
    if (config.memoryStorageDocument) {
      // Try to load from cache first for performance
      if (config.cacheInDatabase) {
        existingLearnings = await loadLearningsFromCache(userId, workflowId)
      }

      // If no cache, load from user's document
      // (loadDocumentContent function from hitl/index.ts would be used here)
    }

    // 3. Save merged learnings to user's document (primary storage)
    if (config.memoryStorageDocument) {
      await saveLearningsToDocument(
        config.memoryStorageDocument,
        existingLearnings,
        newLearnings,
        userId
      )
    }

    // 4. Optionally cache in database for performance
    if (config.cacheInDatabase) {
      await cacheLearningsInDatabase(
        userId,
        workflowId,
        conversationId,
        newLearnings
      )
    }

    // 5. Update conversation record with learnings summary
    const supabase = await createSupabaseServerClient()
    await supabase
      .from('hitl_conversations')
      .update({
        learnings_extracted: newLearnings
      })
      .eq('id', conversationId)

    logger.info('[Memory] Conversation learnings processed successfully')

  } catch (error: any) {
    logger.error('[Memory] Failed to process conversation learnings', { error: error.message })
  }
}
