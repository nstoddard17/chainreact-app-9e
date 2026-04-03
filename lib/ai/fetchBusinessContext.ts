/**
 * Server-side fetcher for business context data.
 * Owns Supabase queries + auth. No caching — runs once per API request.
 *
 * Fetches from three sources in parallel:
 * - business_context table (durable facts, rules, defaults)
 * - workflow_preferences table (provider/tool defaults)
 * - hitl_memory table (episodic learnings with business_context category)
 */

import { createSupabaseServerClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'

export interface BusinessContextEntry {
  id: string
  user_id: string
  organization_id: string | null
  key: string
  value: string
  category: 'company_info' | 'preferences' | 'rules' | 'mappings' | 'style' | 'defaults'
  scope: 'user' | 'organization'
  locked: boolean
  source: 'manual' | 'learned'
  usage_count: number
  relevance_tags: string[]
  last_used_at: string | null
  created_at: string
  updated_at: string
}

export interface WorkflowPreferencesData {
  default_email_provider?: string
  default_calendar_provider?: string
  default_storage_provider?: string
  default_notification_provider?: string
  default_crm_provider?: string
  default_spreadsheet_provider?: string
  default_database_provider?: string
  default_channels: Record<string, string>
  node_config_defaults: Record<string, Record<string, unknown>>
}

export interface HitlMemoryEntry {
  id: string
  learning_summary: string
  learning_data: Record<string, unknown>
  confidence_score: number
  category: string
}

export interface BusinessContextData {
  entries: BusinessContextEntry[]
  preferences: WorkflowPreferencesData | null
  memories: HitlMemoryEntry[]
}

export async function fetchBusinessContextForUser(
  userId: string,
  organizationId?: string
): Promise<BusinessContextData> {
  const supabase = await createSupabaseServerClient()

  // Cast to any for tables not yet in generated Supabase types
  const db = supabase as any

  const [contextResult, prefsResult, memoryResult] = await Promise.all([
    // 1. Business context entries for this user (+ org if provided)
    db
      .from('business_context')
      .select('*')
      .eq('user_id', userId)
      .order('usage_count', { ascending: false }),

    // 2. Workflow preferences
    db
      .from('workflow_preferences')
      .select('default_email_provider, default_calendar_provider, default_storage_provider, default_notification_provider, default_crm_provider, default_spreadsheet_provider, default_database_provider, default_channels, node_config_defaults')
      .eq('user_id', userId)
      .maybeSingle(),

    // 3. HITL memory with business_context category, confidence >= 0.7
    db
      .from('hitl_memory')
      .select('id, learning_summary, learning_data, confidence_score, category')
      .eq('user_id', userId)
      .eq('category', 'business_context')
      .gte('confidence_score', 0.7)
      .order('confidence_score', { ascending: false })
      .limit(10),
  ])

  if (contextResult.error) {
    logger.error('Failed to fetch business context', { error: contextResult.error, userId })
  }
  if (prefsResult.error) {
    logger.error('Failed to fetch workflow preferences', { error: prefsResult.error, userId })
  }
  if (memoryResult.error) {
    logger.error('Failed to fetch HITL memory', { error: memoryResult.error, userId })
  }

  return {
    entries: (contextResult.data ?? []) as BusinessContextEntry[],
    preferences: (prefsResult.data as WorkflowPreferencesData) ?? null,
    memories: (memoryResult.data ?? []) as HitlMemoryEntry[],
  }
}

/**
 * Fire-and-forget: increment usage_count and set last_used_at for selected entries.
 * Called after a successful LLM call that used business context.
 */
export async function incrementUsageCount(entryIds: string[]): Promise<void> {
  if (entryIds.length === 0) return

  try {
    const supabase = await createSupabaseServerClient()
    const now = new Date().toISOString()
    // Update each entry's last_used_at. usage_count increment requires raw SQL or RPC,
    // so we set last_used_at as the trackable signal for now.
    await Promise.all(
      entryIds.map(id =>
        (supabase as any)
          .from('business_context')
          .update({ last_used_at: now })
          .eq('id', id)
      )
    )
  } catch (error) {
    // Non-critical — log and move on
    logger.error('Failed to increment business context usage', { error, entryIds })
  }
}
