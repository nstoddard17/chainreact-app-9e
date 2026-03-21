/**
 * Test Cache — tracks systematic test results in the database
 *
 * Uses the `systematic_test_results` table in Supabase.
 * Once a test passes, it stays passed and is skipped on future runs.
 * Tests only re-run if:
 *   - "Force rerun" is checked (clears the table)
 *   - The test previously failed (always retried)
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'

export interface CachedTestResult {
  nodeType: string
  providerId: string
  passedAt: string
  duration: number
  nodeTitle: string
}

/** Load all passed results from the database */
export async function loadCache(): Promise<Map<string, CachedTestResult>> {
  const cache = new Map<string, CachedTestResult>()
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('systematic_test_results')
      .select('*')
      .eq('status', 'passed')

    if (error) {
      logger.error('[test-cache] Failed to load from DB:', error.message)
      return cache
    }

    for (const row of data || []) {
      cache.set(row.node_type, {
        nodeType: row.node_type,
        providerId: row.provider_id,
        passedAt: row.tested_at,
        duration: row.duration_ms || 0,
        nodeTitle: row.node_title || '',
      })
    }
  } catch (err: any) {
    logger.error('[test-cache] Failed to load cache:', err.message)
  }
  return cache
}

/** Check if a test can be skipped (previously passed) */
export function canSkipTest(
  cache: Map<string, CachedTestResult>,
  nodeType: string,
  _providerId: string
): CachedTestResult | null {
  return cache.get(nodeType) || null
}

/** Record a test result in the database (upsert) */
export async function recordTestResult(
  nodeType: string,
  providerId: string,
  nodeTitle: string,
  status: 'passed' | 'failed' | 'skipped',
  duration: number,
  errorMessage?: string,
): Promise<void> {
  try {
    const supabase = createAdminClient()
    await supabase
      .from('systematic_test_results')
      .upsert({
        node_type: nodeType,
        provider_id: providerId,
        node_title: nodeTitle,
        status,
        duration_ms: duration,
        error_message: errorMessage || null,
        tested_at: new Date().toISOString(),
      }, { onConflict: 'node_type' })
  } catch (err: any) {
    logger.error('[test-cache] Failed to record result:', err.message)
  }
}

/** Clear all cached results (for force rerun) */
export async function clearCache(): Promise<void> {
  try {
    const supabase = createAdminClient()
    await supabase
      .from('systematic_test_results')
      .delete()
      .neq('node_type', '')
  } catch (err: any) {
    logger.error('[test-cache] Failed to clear cache:', err.message)
  }
}
