/**
 * Template Catalog for Planner
 *
 * Loads published workflow templates from the database and makes them
 * available to the planner's lightweight LLM fallback. As users create
 * and publish templates, the pool of available workflow patterns grows
 * organically — the LLM can reference real templates when planning.
 *
 * Sources:
 * 1. `templates` table — user-created and predefined templates
 * 2. `dynamic_templates` table — auto-learned from user behavior
 *
 * Caching: 5 minutes (same as templateMatching.ts)
 */

import { createClient } from '@/utils/supabase/client'
import { logger } from '@/lib/utils/logger'

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const LOAD_TIMEOUT_MS = 3000 // 3 seconds — fail fast

export interface TemplateCatalogEntry {
  id: string
  name: string
  description: string
  category: string | null
  nodeTypes: string[]
  nodeCount: number
  integrations: string[]
  tags: string[]
}

let _cache: TemplateCatalogEntry[] | null = null
let _lastLoad = 0

/**
 * Get the template catalog (cached).
 * Returns a compact list of published templates suitable for LLM context.
 */
export async function getTemplateCatalog(): Promise<TemplateCatalogEntry[]> {
  const now = Date.now()

  if (_cache && now - _lastLoad < CACHE_TTL_MS) {
    return _cache
  }

  try {
    const result = await Promise.race([
      loadTemplatesFromDB(),
      new Promise<TemplateCatalogEntry[]>((_, reject) =>
        setTimeout(() => reject(new Error('Template catalog load timeout')), LOAD_TIMEOUT_MS)
      ),
    ])

    _cache = result
    _lastLoad = now
    return result
  } catch (error: any) {
    logger.warn('[TemplateCatalog] Failed to load, using cached or empty', {
      error: error?.message,
      hasCached: !!_cache,
    })
    _lastLoad = now // prevent retry storm
    return _cache || []
  }
}

/**
 * Format the template catalog as compact text for LLM context.
 * Keeps token count low (~10 tokens per template).
 */
export function formatTemplateCatalogForLLM(templates: TemplateCatalogEntry[]): string {
  if (templates.length === 0) return ''

  const lines = templates.map(t => {
    const integrations = t.integrations.length > 0 ? ` [${t.integrations.join(', ')}]` : ''
    return `- "${t.name}": ${t.description} (${t.nodeCount} nodes)${integrations}`
  })

  return [
    'EXISTING WORKFLOW TEMPLATES (users have created these — reuse when relevant):',
    ...lines,
  ].join('\n')
}

/**
 * Clear the cache (for testing).
 */
export function clearTemplateCatalogCache(): void {
  _cache = null
  _lastLoad = 0
}

// ============================================================================
// INTERNAL
// ============================================================================

async function loadTemplatesFromDB(): Promise<TemplateCatalogEntry[]> {
  const supabase = createClient()

  // Use select('*') and cast to any to avoid Supabase type mismatches
  // when DB schema has columns not yet reflected in generated types
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .or('is_predefined.eq.true,is_public.eq.true')
    .order('created_at', { ascending: false })
    .limit(100) as { data: any[] | null; error: any }

  if (error) {
    logger.error('[TemplateCatalog] DB query failed', { error: error.message })
    return []
  }

  if (!data || data.length === 0) {
    return []
  }

  const entries: TemplateCatalogEntry[] = []

  for (const row of data) {
    // Parse nodes to extract node types
    let nodes: any[] = []
    const rawNodes = row.nodes
    if (typeof rawNodes === 'string') {
      try { nodes = JSON.parse(rawNodes) } catch { continue }
    } else if (Array.isArray(rawNodes)) {
      nodes = rawNodes
    }

    if (nodes.length === 0) continue

    // Extract node types from the nodes array
    const nodeTypes = nodes
      .map((n: any) => n.data?.type || n.type || n.nodeType)
      .filter(Boolean)

    if (nodeTypes.length === 0) continue

    entries.push({
      id: row.id,
      name: row.name || 'Unnamed Template',
      description: row.description || '',
      category: row.category || null,
      nodeTypes,
      nodeCount: nodeTypes.length,
      integrations: Array.isArray(row.integrations) ? row.integrations : [],
      tags: Array.isArray(row.tags) ? row.tags : [],
    })
  }

  logger.info('[TemplateCatalog] Loaded templates from DB', { count: entries.length })
  return entries
}
