/**
 * User Learning Service
 *
 * Aggregates user correction patterns from agent_eval_events and hitl_memory
 * to inject into the LLM planner's Stage 2 (configuration), helping the AI
 * avoid repeating mistakes users have already corrected.
 *
 * Gated by FEATURE_FLAGS.LEARNING_SYSTEM_V2.
 */

import { createSupabaseServiceClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'

export interface UserLearning {
  pattern: string
  frequency: number
  confidence: number
  lastSeen: string
}

// In-memory cache per userId (5-min TTL).
// In serverless, each invocation gets a fresh process so this primarily
// helps within a single planning session if planWithLLM is called multiple times.
const cache = new Map<string, { learnings: UserLearning[]; fetchedAt: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000

/**
 * Fetch and aggregate user correction patterns.
 * Returns cached results if available and fresh.
 */
export async function getUserLearnings(userId: string): Promise<UserLearning[]> {
  const cached = cache.get(userId)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.learnings
  }

  try {
    const supabase = await createSupabaseServiceClient()

    // Query manual corrections from agent eval events
    const { data: corrections } = await (supabase as any)
      .from('agent_eval_events')
      .select('metadata, created_at')
      .eq('user_id', userId)
      .eq('event_name', 'agent.manual_correction')
      .order('created_at', { ascending: false })
      .limit(100)

    // Query high-confidence learnings from HITL memory
    const { data: memories } = await (supabase as any)
      .from('hitl_memory')
      .select('learning_summary, learning_data, confidence_score, updated_at')
      .eq('user_id', userId)
      .gte('confidence_score', 0.7)
      .order('confidence_score', { ascending: false })
      .limit(50)

    const learnings = aggregatePatterns(corrections || [], memories || [])

    cache.set(userId, { learnings, fetchedAt: Date.now() })
    return learnings
  } catch (error: any) {
    logger.error('[UserLearning] Failed to fetch learnings', { userId, error: error.message })
    return []
  }
}

/**
 * Format learnings as a compact prompt string for injection into Stage 2.
 * Returns empty string if no learnings (no-op for the planner).
 */
export function formatLearningsForPrompt(learnings: UserLearning[]): string {
  if (learnings.length === 0) return ''

  const top = learnings.slice(0, 10) // Cap at 10 to limit token usage (~200 tokens)

  return [
    'Based on this user\'s history, apply these preferences when configuring nodes:',
    ...top.map(l => `- ${l.pattern} (observed ${l.frequency}x)`),
  ].join('\n')
}

/**
 * Aggregate raw correction events and HITL memories into deduplicated patterns.
 * Only includes patterns seen 2+ times for correction events.
 */
function aggregatePatterns(
  corrections: Array<{ metadata: any; created_at: string }>,
  memories: Array<{ learning_summary: string; learning_data: any; confidence_score: number; updated_at: string }>
): UserLearning[] {
  const patternMap = new Map<string, { frequency: number; confidence: number; lastSeen: string }>()

  // Process correction events — group by a normalized key
  for (const correction of corrections) {
    const meta = correction.metadata
    if (!meta) continue

    // Build a human-readable pattern from the correction metadata
    const key = extractCorrectionPattern(meta)
    if (!key) continue

    const existing = patternMap.get(key)
    if (existing) {
      existing.frequency++
      existing.confidence = Math.min(1, existing.confidence + 0.1)
      if (correction.created_at > existing.lastSeen) {
        existing.lastSeen = correction.created_at
      }
    } else {
      patternMap.set(key, {
        frequency: 1,
        confidence: 0.5,
        lastSeen: correction.created_at,
      })
    }
  }

  // Process HITL memories — these are pre-aggregated with confidence
  for (const memory of memories) {
    if (!memory.learning_summary) continue
    const key = memory.learning_summary.slice(0, 200) // Normalize length

    const existing = patternMap.get(key)
    if (existing) {
      existing.frequency++
      existing.confidence = Math.max(existing.confidence, memory.confidence_score)
    } else {
      patternMap.set(key, {
        frequency: 1,
        confidence: memory.confidence_score,
        lastSeen: memory.updated_at,
      })
    }
  }

  // Filter to patterns seen 2+ times (corrections) or high confidence (memories)
  const learnings: UserLearning[] = []
  for (const [pattern, data] of patternMap) {
    if (data.frequency >= 2 || data.confidence >= 0.7) {
      learnings.push({ pattern, ...data })
    }
  }

  // Sort by frequency * confidence (most significant patterns first)
  learnings.sort((a, b) => (b.frequency * b.confidence) - (a.frequency * a.confidence))

  return learnings
}

/**
 * Extract a human-readable pattern description from correction event metadata.
 */
function extractCorrectionPattern(meta: any): string | null {
  // Correction metadata varies by correction type — handle common shapes
  const nodeType = meta.node_type || meta.nodeType
  const field = meta.field_name || meta.fieldName || meta.field
  const oldValue = meta.old_value || meta.oldValue || meta.from
  const newValue = meta.new_value || meta.newValue || meta.to
  const action = meta.action || meta.correction_type

  if (nodeType && field && oldValue && newValue) {
    return `For ${nodeType}, user changes "${field}" from "${truncate(oldValue)}" to "${truncate(newValue)}"`
  }

  if (nodeType && action === 'removed') {
    return `User removes ${nodeType} nodes from workflows`
  }

  if (nodeType && field && newValue) {
    return `For ${nodeType}, user prefers "${field}" set to "${truncate(newValue)}"`
  }

  if (meta.description || meta.summary) {
    return truncate(meta.description || meta.summary, 200)
  }

  return null
}

function truncate(value: any, maxLen = 50): string {
  const str = String(value)
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str
}
