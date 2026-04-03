/**
 * Business Context Formatter
 *
 * Pure function module — no state, no transport.
 * Formats business context entries, workflow preferences, and HITL memories
 * into a compact text block for LLM injection.
 *
 * Key design decisions:
 * - Strict precedence: user prompt > locked entries > unlocked > preferences > memories
 * - Canonical key normalization prevents duplicate/synonymous facts
 * - Relevance scoring orders entries within precedence tiers
 * - Token budget enforced via character estimation (4 chars ≈ 1 token)
 */

import { logger } from '@/lib/utils/logger'
import type {
  BusinessContextEntry,
  WorkflowPreferencesData,
  HitlMemoryEntry,
} from './fetchBusinessContext'

// --- Canonical Key Registry ---

const CANONICAL_KEYS: Record<string, string[]> = {
  company_name: ['company', 'org_name', 'business_name'],
  tone: ['writing_tone', 'communication_style', 'voice'],
  approval_threshold: ['approval_limit', 'expense_limit', 'approval_amount'],
  default_channel: ['notification_channel', 'alert_channel', 'slack_channel'],
  timezone: ['tz', 'time_zone'],
  language: ['locale', 'preferred_language'],
}

// Reverse lookup: alias → canonical
const ALIAS_TO_CANONICAL: Record<string, string> = {}
for (const [canonical, aliases] of Object.entries(CANONICAL_KEYS)) {
  for (const alias of aliases) {
    ALIAS_TO_CANONICAL[alias] = canonical
  }
}

export function normalizeKey(key: string): string {
  const lower = key.toLowerCase().trim()
  return ALIAS_TO_CANONICAL[lower] ?? lower
}

// --- Relevance Hints ---

export interface RelevanceHints {
  intent?: string
  providers?: string[]
  category?: string
}

// --- Scoring ---

interface ScoredEntry {
  key: string
  value: string
  category: string
  locked: boolean
  source: string
  precedence: number // lower = higher priority
  relevanceScore: number
  id: string
}

const PROVIDER_CATEGORY_MAP: Record<string, string> = {
  email: 'default_email_provider',
  calendar: 'default_calendar_provider',
  storage: 'default_storage_provider',
  notification: 'default_notification_provider',
  crm: 'default_crm_provider',
  spreadsheet: 'default_spreadsheet_provider',
  database: 'default_database_provider',
}

function scoreEntry(
  entry: { key: string; relevance_tags?: string[]; category: string; locked: boolean; scope: string; usage_count: number; last_used_at: string | null },
  hints: RelevanceHints
): number {
  let score = 0

  // Provider match (+3)
  if (hints.providers && entry.relevance_tags?.length) {
    const providerSet = new Set(hints.providers.map(p => p.toLowerCase()))
    if (entry.relevance_tags.some(tag => providerSet.has(tag.toLowerCase()))) {
      score += 3
    }
  }

  // Category match (+2)
  if (hints.category && entry.category === hints.category) {
    score += 2
  }

  // Locked (+2)
  if (entry.locked) {
    score += 2
  }

  // User scope > org scope (+1)
  if (entry.scope === 'user') {
    score += 1
  }

  // Usage count (+0-1, normalized)
  const usageScore = Math.min(entry.usage_count / 50, 1)
  score += usageScore

  // Recency (+0-1, normalized)
  if (entry.last_used_at) {
    const daysSinceUse = (Date.now() - new Date(entry.last_used_at).getTime()) / (1000 * 60 * 60 * 24)
    const recencyScore = Math.max(0, 1 - daysSinceUse / 30)
    score += recencyScore
  }

  return score
}

// --- Formatter ---

export interface FormatterResult {
  formatted: string
  selectedEntryIds: string[]
  tokenEstimate: number
  categories: string[]
}

export function formatBusinessContextForLLM(
  entries: BusinessContextEntry[],
  preferences: WorkflowPreferencesData | null,
  memories: HitlMemoryEntry[],
  hints: RelevanceHints = {},
  tokenBudget: number = 350
): FormatterResult {
  const scored: ScoredEntry[] = []
  const seenCanonicalKeys = new Map<string, ScoredEntry>()

  // 1. Score and deduplicate business_context entries by canonical key
  for (const entry of entries) {
    const canonicalKey = normalizeKey(entry.key)
    const precedence = entry.locked ? 1 : 2
    const relevanceScore = scoreEntry(entry, hints)

    const scored_entry: ScoredEntry = {
      key: canonicalKey,
      value: entry.value,
      category: entry.category,
      locked: entry.locked,
      source: entry.source,
      precedence,
      relevanceScore,
      id: entry.id,
    }

    const existing = seenCanonicalKeys.get(canonicalKey)
    if (!existing || precedence < existing.precedence ||
        (precedence === existing.precedence && relevanceScore > existing.relevanceScore)) {
      seenCanonicalKeys.set(canonicalKey, scored_entry)
    }
  }

  scored.push(...seenCanonicalKeys.values())

  // 2. Add workflow preferences as lower-precedence entries (precedence 3)
  if (preferences) {
    for (const [category, column] of Object.entries(PROVIDER_CATEGORY_MAP)) {
      const value = preferences[column as keyof WorkflowPreferencesData] as string | undefined
      if (!value) continue

      const canonicalKey = `default_${category}_provider`
      // Skip if a business_context entry already covers this
      if (seenCanonicalKeys.has(canonicalKey)) continue

      // Only include if relevant providers match
      if (hints.providers && !hints.providers.some(p => p.toLowerCase().includes(category))) continue

      scored.push({
        key: canonicalKey,
        value: `${category}: ${value}`,
        category: 'preferences',
        locked: false,
        source: 'workflow_preferences',
        precedence: 3,
        relevanceScore: hints.providers ? 2 : 0,
        id: `pref_${category}`,
      })
    }

    // Default channels
    if (preferences.default_channels && Object.keys(preferences.default_channels).length > 0) {
      const channelKey = 'default_channel'
      if (!seenCanonicalKeys.has(channelKey)) {
        const channelStr = Object.entries(preferences.default_channels)
          .map(([provider, channel]) => `${provider}: ${channel}`)
          .join(', ')
        scored.push({
          key: channelKey,
          value: channelStr,
          category: 'preferences',
          locked: false,
          source: 'workflow_preferences',
          precedence: 3,
          relevanceScore: 1,
          id: 'pref_channels',
        })
      }
    }
  }

  // 3. Add HITL memories as lowest-precedence entries (precedence 4)
  for (const memory of memories.slice(0, 5)) {
    if (!memory.learning_summary) continue
    scored.push({
      key: `memory_${memory.id.slice(0, 8)}`,
      value: memory.learning_summary,
      category: 'learned',
      locked: false,
      source: 'hitl_memory',
      precedence: 4,
      relevanceScore: memory.confidence_score,
      id: memory.id,
    })
  }

  // 4. Sort: precedence ASC, then relevanceScore DESC
  scored.sort((a, b) => {
    if (a.precedence !== b.precedence) return a.precedence - b.precedence
    return b.relevanceScore - a.relevanceScore
  })

  // 5. Apply fallback: when hints are weak, ensure essential entries are included
  const hintsAreWeak = !hints.intent && (!hints.providers || hints.providers.length === 0)
  if (hintsAreWeak) {
    // Boost locked entries and company_info to top
    scored.sort((a, b) => {
      const aBoost = (a.locked ? 10 : 0) + (a.category === 'company_info' ? 5 : 0)
      const bBoost = (b.locked ? 10 : 0) + (b.category === 'company_info' ? 5 : 0)
      if (aBoost !== bBoost) return bBoost - aBoost
      if (a.precedence !== b.precedence) return a.precedence - b.precedence
      return b.relevanceScore - a.relevanceScore
    })
  }

  // 6. Build formatted output within token budget
  const charBudget = tokenBudget * 4 // ~4 chars per token
  const lines: string[] = []
  const selectedIds: string[] = []
  const selectedCategories = new Set<string>()
  let charCount = 'BUSINESS CONTEXT:\n'.length

  for (const entry of scored) {
    const line = `- ${formatEntryLine(entry)}`
    if (charCount + line.length + 1 > charBudget) break

    lines.push(line)
    charCount += line.length + 1
    if (entry.id && !entry.id.startsWith('pref_')) {
      selectedIds.push(entry.id)
    }
    selectedCategories.add(entry.category)
  }

  if (lines.length === 0) {
    return { formatted: '', selectedEntryIds: [], tokenEstimate: 0, categories: [] }
  }

  const formatted = `BUSINESS CONTEXT:\n${lines.join('\n')}`

  const result: FormatterResult = {
    formatted,
    selectedEntryIds: selectedIds,
    tokenEstimate: Math.ceil(formatted.length / 4),
    categories: [...selectedCategories],
  }

  logger.debug('business_context_formatted', {
    entryCount: lines.length,
    tokenEstimate: result.tokenEstimate,
    categories: result.categories,
    selectedEntryIds: selectedIds,
  })

  return result
}

function formatEntryLine(entry: ScoredEntry): string {
  const keyLabel = entry.key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  // Keep it compact — key: value
  if (entry.value.length > 120) {
    return `${keyLabel}: ${entry.value.slice(0, 117)}...`
  }
  return `${keyLabel}: ${entry.value}`
}
