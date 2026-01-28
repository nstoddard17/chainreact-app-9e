/**
 * Compact Node Catalog for LLM Context Efficiency
 *
 * This module transforms the full 247-node catalog into a compact format
 * optimized for LLM context windows. The compact format uses ~50 tokens
 * per node vs ~500 for the full schema, keeping total prompt size under 3K tokens.
 *
 * Two-Tier Architecture:
 * - Tier 1 (this file): Compact catalog for node selection (~2K tokens)
 * - Tier 2 (loaded on demand): Full schemas for configuration
 */

import { ALL_NODE_COMPONENTS } from '../../../../../lib/workflows/nodes'
import type { NodeComponent } from '../../../../../lib/workflows/nodes/types'
import type {
  CompactNodeEntry,
  GroupedNodeCatalog,
  CatalogStats,
} from './types'

// ============================================================================
// CATALOG GENERATION
// ============================================================================

/**
 * Determines the category for a node based on its properties
 */
function categorizeNode(node: NodeComponent): CompactNodeEntry['category'] {
  if (node.isTrigger) return 'trigger'

  const type = node.type.toLowerCase()
  const providerId = node.providerId?.toLowerCase() || ''

  // Logic nodes
  if (providerId === 'logic' || type.includes('logic.') || type.includes('if_') || type.includes('switch_')) {
    return 'logic'
  }

  // AI nodes
  if (providerId === 'ai' || type.includes('ai_') || type.includes('_ai') || type.includes('ai.')) {
    return 'ai'
  }

  // Automation/utility nodes
  if (providerId === 'automation' || type.includes('automation') || type.includes('delay') || type.includes('wait')) {
    return 'automation'
  }

  // Utility nodes (formatters, transformers, etc.)
  if (type.includes('format') || type.includes('transform') || type.includes('mapper') || type.includes('http')) {
    return 'utility'
  }

  // Everything else is an action
  return 'action'
}

/**
 * Extracts meaningful tags from a node for better LLM matching
 */
function extractTags(node: NodeComponent): string[] {
  const tags: string[] = []

  // Add provider as tag
  if (node.providerId) {
    tags.push(node.providerId)
  }

  // Add category
  if (node.category) {
    tags.push(node.category)
  }

  // Extract action keywords from type
  const type = node.type.toLowerCase()
  const actionWords = ['create', 'send', 'update', 'delete', 'get', 'list', 'search', 'add', 'remove', 'notify', 'post', 'reply']
  for (const word of actionWords) {
    if (type.includes(word)) {
      tags.push(word)
    }
  }

  // Add existing tags
  if (node.tags) {
    tags.push(...node.tags)
  }

  // Deduplicate and limit
  return [...new Set(tags)].slice(0, 5)
}

/**
 * Creates a compact description (max 60 chars) from node description
 */
function compactDescription(node: NodeComponent): string {
  let desc = node.description || node.title || node.type

  // Remove common fluff words
  desc = desc
    .replace(/^(This node |This action |This trigger )/i, '')
    .replace(/ when triggered$/i, '')
    .replace(/ automatically$/i, '')

  // Truncate if needed
  if (desc.length > 60) {
    desc = desc.substring(0, 57) + '...'
  }

  return desc
}

/**
 * Determines if a node requires OAuth authentication
 */
function requiresAuth(node: NodeComponent): boolean {
  // Logic, AI, and automation nodes typically don't require auth
  const providerId = node.providerId?.toLowerCase() || ''
  const noAuthProviders = ['logic', 'automation', 'ai', 'generic', 'misc', 'utility']

  if (noAuthProviders.includes(providerId)) {
    return false
  }

  // HTTP nodes may or may not need auth
  if (node.type.includes('http.')) {
    return false
  }

  // Most integration nodes require auth
  return !!node.providerId
}

/**
 * Converts a full NodeComponent to a compact entry
 */
function toCompactEntry(node: NodeComponent): CompactNodeEntry {
  return {
    type: node.type,
    provider: node.providerId || 'generic',
    category: categorizeNode(node),
    desc: compactDescription(node),
    requiresAuth: requiresAuth(node),
    tags: extractTags(node),
  }
}

// ============================================================================
// CACHED CATALOG
// ============================================================================

// Cache the compact catalog to avoid recomputation
let _compactCatalog: CompactNodeEntry[] | null = null
let _groupedCatalog: GroupedNodeCatalog | null = null
let _catalogStats: CatalogStats | null = null

/**
 * Gets the compact node catalog, generating it if needed
 * This is cached for performance
 */
export function getCompactCatalog(): CompactNodeEntry[] {
  if (!_compactCatalog) {
    _compactCatalog = ALL_NODE_COMPONENTS
      .filter(node => !node.deprecated && !node.comingSoon && !node.hideInActionSelection)
      .map(toCompactEntry)
  }
  return _compactCatalog
}

/**
 * Gets the catalog grouped by category for structured prompts
 */
export function getGroupedCatalog(): GroupedNodeCatalog {
  if (!_groupedCatalog) {
    const catalog = getCompactCatalog()
    _groupedCatalog = {
      triggers: catalog.filter(n => n.category === 'trigger'),
      actions: catalog.filter(n => n.category === 'action'),
      logic: catalog.filter(n => n.category === 'logic'),
      ai: catalog.filter(n => n.category === 'ai'),
      automation: catalog.filter(n => n.category === 'automation'),
      utility: catalog.filter(n => n.category === 'utility'),
    }
  }
  return _groupedCatalog
}

/**
 * Gets statistics about the catalog
 */
export function getCatalogStats(): CatalogStats {
  if (!_catalogStats) {
    const catalog = getCompactCatalog()

    const byProvider: Record<string, number> = {}
    const byCategory: Record<string, number> = {}

    for (const entry of catalog) {
      byProvider[entry.provider] = (byProvider[entry.provider] || 0) + 1
      byCategory[entry.category] = (byCategory[entry.category] || 0) + 1
    }

    // Estimate tokens (roughly 4 chars per token, plus formatting overhead)
    const catalogJson = formatCatalogForLLM(catalog)
    const estimatedTokens = Math.ceil(catalogJson.length / 4)

    _catalogStats = {
      totalNodes: catalog.length,
      totalTokens: estimatedTokens,
      byProvider,
      byCategory,
    }
  }
  return _catalogStats
}

// ============================================================================
// LLM PROMPT FORMATTING
// ============================================================================

/**
 * Formats a single entry for LLM consumption (minimal tokens)
 * Ultra-compact format to stay under 3K tokens for the entire catalog
 */
function formatEntry(entry: CompactNodeEntry): string {
  // Ultra-compact format: just type and short description
  // Example: "gmail_trigger_new_email: New email received"
  return `${entry.type}: ${entry.desc}`
}

/**
 * Formats the entire catalog for LLM prompt inclusion
 * Optimized to stay under 3K tokens by using compact format
 */
export function formatCatalogForLLM(catalog?: CompactNodeEntry[]): string {
  const entries = catalog || getCompactCatalog()

  // Group by provider for organization
  const byProvider = new Map<string, { triggers: CompactNodeEntry[]; actions: CompactNodeEntry[] }>()

  for (const entry of entries) {
    const provider = entry.provider
    if (!byProvider.has(provider)) {
      byProvider.set(provider, { triggers: [], actions: [] })
    }
    const group = byProvider.get(provider)!
    if (entry.category === 'trigger') {
      group.triggers.push(entry)
    } else {
      group.actions.push(entry)
    }
  }

  // Format compactly - one line per provider with node types
  const sections: string[] = []

  for (const [provider, group] of byProvider) {
    const lines: string[] = []

    if (group.triggers.length > 0) {
      // Just list trigger types compactly
      const triggerTypes = group.triggers.map(t => t.type.replace(`${provider}_trigger_`, '')).join(', ')
      lines.push(`  triggers: ${triggerTypes}`)
    }

    if (group.actions.length > 0) {
      // Just list action types compactly
      const actionTypes = group.actions.map(a => a.type.replace(`${provider}_action_`, '')).join(', ')
      lines.push(`  actions: ${actionTypes}`)
    }

    if (lines.length > 0) {
      sections.push(`[${provider}]\n${lines.join('\n')}`)
    }
  }

  return sections.join('\n')
}

/**
 * Formats catalog in verbose mode (for debugging or when context allows)
 */
export function formatCatalogVerbose(catalog?: CompactNodeEntry[]): string {
  const entries = catalog || getCompactCatalog()
  const grouped = {
    triggers: entries.filter(n => n.category === 'trigger'),
    actions: entries.filter(n => n.category === 'action'),
    logic: entries.filter(n => n.category === 'logic'),
    ai: entries.filter(n => n.category === 'ai'),
    automation: entries.filter(n => n.category === 'automation'),
    utility: entries.filter(n => n.category === 'utility'),
  }

  const sections: string[] = []

  if (grouped.triggers.length > 0) {
    sections.push(`## Triggers\n${grouped.triggers.map(formatEntry).join('\n')}`)
  }

  if (grouped.actions.length > 0) {
    const byProvider = new Map<string, CompactNodeEntry[]>()
    for (const action of grouped.actions) {
      const existing = byProvider.get(action.provider) || []
      existing.push(action)
      byProvider.set(action.provider, existing)
    }

    const actionLines: string[] = []
    for (const [provider, actions] of byProvider) {
      actionLines.push(`### ${provider}`)
      actionLines.push(...actions.map(formatEntry))
    }
    sections.push(`## Actions\n${actionLines.join('\n')}`)
  }

  if (grouped.logic.length > 0) {
    sections.push(`## Logic\n${grouped.logic.map(formatEntry).join('\n')}`)
  }

  if (grouped.ai.length > 0) {
    sections.push(`## AI\n${grouped.ai.map(formatEntry).join('\n')}`)
  }

  return sections.join('\n\n')
}

/**
 * Formats catalog for a specific subset of providers (reduces tokens further)
 */
export function formatCatalogForProviders(providers: string[]): string {
  const catalog = getCompactCatalog()
  const filtered = catalog.filter(entry =>
    providers.includes(entry.provider) ||
    entry.category === 'logic' ||
    entry.category === 'ai' ||
    entry.category === 'utility'
  )
  return formatCatalogForLLM(filtered)
}

// ============================================================================
// FULL SCHEMA LOADING (Tier 2)
// ============================================================================

/**
 * Gets the full NodeComponent for a node type
 * Used in Tier 2 after node selection for configuration
 */
export function getFullNodeSchema(type: string): NodeComponent | undefined {
  return ALL_NODE_COMPONENTS.find(node => node.type === type)
}

/**
 * Gets full schemas for multiple node types (for batch configuration)
 */
export function getFullNodeSchemas(types: string[]): Map<string, NodeComponent> {
  const schemas = new Map<string, NodeComponent>()
  for (const type of types) {
    const schema = getFullNodeSchema(type)
    if (schema) {
      schemas.set(type, schema)
    }
  }
  return schemas
}

/**
 * Formats a node's config schema for LLM configuration prompts
 */
export function formatConfigSchemaForLLM(node: NodeComponent): string {
  if (!node.configSchema || node.configSchema.length === 0) {
    return `${node.type}: No configuration needed`
  }

  const fields = node.configSchema.map(field => {
    const parts = [
      `- ${field.name}`,
      field.required ? '(required)' : '(optional)',
      `: ${field.type}`,
    ]

    if (field.description) {
      parts.push(`- ${field.description}`)
    }

    if (field.dynamic) {
      parts.push('[dynamic - user selects from dropdown]')
    }

    if (field.options && Array.isArray(field.options) && field.options.length > 0) {
      const opts = field.options.slice(0, 5)
      const optLabels = opts.map(o => typeof o === 'string' ? o : o.label)
      parts.push(`options: ${optLabels.join(', ')}${field.options.length > 5 ? '...' : ''}`)
    }

    if (field.defaultValue !== undefined) {
      parts.push(`default: ${JSON.stringify(field.defaultValue)}`)
    }

    return parts.join(' ')
  })

  return `${node.title} (${node.type}):\n${fields.join('\n')}`
}

/**
 * Formats output schema for LLM to understand available variables
 */
export function formatOutputSchemaForLLM(node: NodeComponent): string {
  if (!node.outputSchema || node.outputSchema.length === 0) {
    return `${node.type}: No documented outputs`
  }

  const fields = node.outputSchema.map(field => {
    return `- ${field.name}: ${field.type} - ${field.description}${field.example ? ` (e.g., ${JSON.stringify(field.example)})` : ''}`
  })

  return `${node.title} outputs:\n${fields.join('\n')}`
}

// ============================================================================
// SEARCH & FILTERING
// ============================================================================

/**
 * Searches the catalog for nodes matching a query
 */
export function searchCatalog(query: string): CompactNodeEntry[] {
  const catalog = getCompactCatalog()
  const queryLower = query.toLowerCase()
  const queryWords = queryLower.split(/\s+/)

  return catalog.filter(entry => {
    const searchText = `${entry.type} ${entry.desc} ${entry.provider} ${entry.tags?.join(' ') || ''}`.toLowerCase()
    return queryWords.every(word => searchText.includes(word))
  })
}

/**
 * Finds nodes that match a natural language description
 */
export function findMatchingNodes(description: string, options?: {
  category?: CompactNodeEntry['category']
  provider?: string
  requiresAuth?: boolean
  limit?: number
}): CompactNodeEntry[] {
  let results = searchCatalog(description)

  if (options?.category) {
    results = results.filter(n => n.category === options.category)
  }

  if (options?.provider) {
    results = results.filter(n => n.provider === options.provider)
  }

  if (options?.requiresAuth !== undefined) {
    results = results.filter(n => n.requiresAuth === options.requiresAuth)
  }

  if (options?.limit) {
    results = results.slice(0, options.limit)
  }

  return results
}

/**
 * Gets all providers that have at least one node in the catalog
 */
export function getAvailableProviders(): string[] {
  const catalog = getCompactCatalog()
  const providers = new Set(catalog.map(entry => entry.provider))
  return [...providers].sort()
}

/**
 * Gets triggers for a specific provider
 */
export function getProviderTriggers(provider: string): CompactNodeEntry[] {
  const catalog = getCompactCatalog()
  return catalog.filter(entry =>
    entry.provider === provider && entry.category === 'trigger'
  )
}

/**
 * Gets actions for a specific provider
 */
export function getProviderActions(provider: string): CompactNodeEntry[] {
  const catalog = getCompactCatalog()
  return catalog.filter(entry =>
    entry.provider === provider && entry.category === 'action'
  )
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clears the cached catalog (call on hot reload or after node updates)
 */
export function clearCatalogCache(): void {
  _compactCatalog = null
  _groupedCatalog = null
  _catalogStats = null
}

/**
 * Preloads the catalog cache (call on app startup)
 */
export function preloadCatalogCache(): CatalogStats {
  getCompactCatalog()
  getGroupedCatalog()
  return getCatalogStats()
}
