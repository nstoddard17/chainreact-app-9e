/**
 * Options Prefetch Service
 *
 * Smart pre-loading system for dropdown options in workflow configuration.
 * Only prefetches data for:
 * - Nodes that are actually in the workflow/plan
 * - Providers that the user has connected
 * - Fields that the specific node type requires
 *
 * Features:
 * - TTL-based caching (Time To Live)
 * - Priority-based prefetching (first node = highest priority)
 * - Background prefetching for subsequent nodes
 * - Manual refresh capability
 */

import { logger } from '@/lib/utils/logger'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import { getNodeByType } from '@/lib/workflows/nodes/registry'
import { buildCacheKey, getFieldTTL, shouldCacheField } from './cache-utils'
import { useConfigCacheStore } from '@/stores/configCacheStore'

// Cache TTL values (in milliseconds)
const CACHE_TTL = {
  short: 2 * 60 * 1000,    // 2 minutes - for frequently changing data (e.g., recent items)
  medium: 5 * 60 * 1000,   // 5 minutes - default for most options
  long: 15 * 60 * 1000,    // 15 minutes - for rarely changing data (e.g., workspaces, databases)
}

// Default TTL
const DEFAULT_TTL = CACHE_TTL.medium

interface CacheEntry<T = any> {
  data: T
  timestamp: number
  ttl: number
}

interface PrefetchConfig {
  /** The option type identifier (e.g., 'slack:channels', 'notion:databases') */
  optionType: string
  /** Function to fetch the options */
  fetcher: () => Promise<any[]>
  /** Cache TTL in milliseconds */
  ttl?: number
  /** Dependencies - other option types that must be loaded first */
  dependsOn?: string[]
}

interface NodeFieldRequirements {
  /** Fields that need dynamic options */
  dynamicFields: Array<{
    fieldName: string
    optionType: string
    ttl?: number
    dependsOn?: string[]
  }>
}

// Registry of what fields each node type needs
const NODE_FIELD_REQUIREMENTS: Record<string, NodeFieldRequirements> = {
  // Gmail
  'gmail_trigger_new_email': {
    dynamicFields: [
      { fieldName: 'label', optionType: 'gmail:labels', ttl: CACHE_TTL.long },
    ],
  },
  'gmail_action_send_email': {
    dynamicFields: [
      { fieldName: 'from', optionType: 'gmail:aliases', ttl: CACHE_TTL.long },
    ],
  },

  // Slack
  'slack_action_send_message': {
    dynamicFields: [
      { fieldName: 'workspace', optionType: 'slack:workspaces', ttl: CACHE_TTL.long },
      { fieldName: 'channel', optionType: 'slack:channels', ttl: CACHE_TTL.medium, dependsOn: ['slack:workspaces'] },
    ],
  },
  'slack_action_create_channel': {
    dynamicFields: [
      { fieldName: 'workspace', optionType: 'slack:workspaces', ttl: CACHE_TTL.long },
    ],
  },

  // Discord
  'discord_action_send_message': {
    dynamicFields: [
      { fieldName: 'server', optionType: 'discord:servers', ttl: CACHE_TTL.long },
      { fieldName: 'channel', optionType: 'discord:channels', ttl: CACHE_TTL.medium, dependsOn: ['discord:servers'] },
    ],
  },

  // Notion
  'notion_action_create_page': {
    dynamicFields: [
      { fieldName: 'database', optionType: 'notion:databases', ttl: CACHE_TTL.long },
    ],
  },
  'notion_action_update_page': {
    dynamicFields: [
      { fieldName: 'database', optionType: 'notion:databases', ttl: CACHE_TTL.long },
      { fieldName: 'page', optionType: 'notion:pages', ttl: CACHE_TTL.short, dependsOn: ['notion:databases'] },
    ],
  },

  // Trello
  'trello_action_create_card': {
    dynamicFields: [
      { fieldName: 'board', optionType: 'trello:boards', ttl: CACHE_TTL.long },
      { fieldName: 'list', optionType: 'trello:lists', ttl: CACHE_TTL.medium, dependsOn: ['trello:boards'] },
    ],
  },

  // Airtable
  'airtable_action_create_record': {
    dynamicFields: [
      { fieldName: 'base', optionType: 'airtable:bases', ttl: CACHE_TTL.long },
      { fieldName: 'table', optionType: 'airtable:tables', ttl: CACHE_TTL.medium, dependsOn: ['airtable:bases'] },
    ],
  },

  // HubSpot
  'hubspot_action_create_contact': {
    dynamicFields: [
      { fieldName: 'owner', optionType: 'hubspot:owners', ttl: CACHE_TTL.long },
    ],
  },

  // Monday.com
  'monday_action_create_item': {
    dynamicFields: [
      { fieldName: 'board', optionType: 'monday:boards', ttl: CACHE_TTL.long },
      { fieldName: 'group', optionType: 'monday:groups', ttl: CACHE_TTL.medium, dependsOn: ['monday:boards'] },
    ],
  },
}

class OptionsPrefetchService {
  private cache: Map<string, CacheEntry> = new Map()
  private pendingFetches: Map<string, Promise<any[]>> = new Map()
  private fetcherRegistry: Map<string, (params?: any) => Promise<any[]>> = new Map()
  // Abort controllers for cancelling in-flight prefetches
  private abortControllers: Map<string, AbortController> = new Map()
  // Track prefetch status for providers
  private prefetchStatus: Map<string, 'pending' | 'loading' | 'loaded' | 'error'> = new Map()

  /**
   * Register a fetcher function for an option type
   */
  registerFetcher(optionType: string, fetcher: (params?: any) => Promise<any[]>) {
    this.fetcherRegistry.set(optionType, fetcher)
  }

  /**
   * Get cached options if valid, otherwise return null
   */
  getCached(optionType: string, cacheKey?: string): any[] | null {
    const key = cacheKey || optionType
    const entry = this.cache.get(key)

    if (!entry) return null

    const now = Date.now()
    const isExpired = now - entry.timestamp > entry.ttl

    if (isExpired) {
      this.cache.delete(key)
      return null
    }

    return entry.data
  }

  /**
   * Check if options are cached and valid
   */
  isCached(optionType: string, cacheKey?: string): boolean {
    return this.getCached(optionType, cacheKey) !== null
  }

  /**
   * Get time remaining until cache expires (in seconds)
   */
  getCacheTimeRemaining(optionType: string, cacheKey?: string): number {
    const key = cacheKey || optionType
    const entry = this.cache.get(key)

    if (!entry) return 0

    const now = Date.now()
    const remaining = entry.ttl - (now - entry.timestamp)

    return Math.max(0, Math.floor(remaining / 1000))
  }

  /**
   * Set cached options
   */
  setCache(optionType: string, data: any[], ttl: number = DEFAULT_TTL, cacheKey?: string) {
    const key = cacheKey || optionType
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    })
    logger.debug(`[OptionsPrefetch] Cached ${data.length} items for ${key} (TTL: ${ttl / 1000}s)`)
  }

  /**
   * Clear cache for a specific option type or all cache
   */
  clearCache(optionType?: string, cacheKey?: string) {
    if (optionType || cacheKey) {
      const key = cacheKey || optionType
      this.cache.delete(key!)
      logger.debug(`[OptionsPrefetch] Cleared cache for ${key}`)
    } else {
      this.cache.clear()
      logger.debug('[OptionsPrefetch] Cleared all cache')
    }
  }

  /**
   * Fetch options with caching and deduplication
   * If a fetch is already in progress for this key, return the pending promise
   */
  async fetchOptions(
    optionType: string,
    fetcher: () => Promise<any[]>,
    options: {
      ttl?: number
      cacheKey?: string
      forceRefresh?: boolean
    } = {}
  ): Promise<any[]> {
    const { ttl = DEFAULT_TTL, cacheKey, forceRefresh = false } = options
    const key = cacheKey || optionType

    // Check cache first (unless forcing refresh)
    if (!forceRefresh) {
      const cached = this.getCached(optionType, cacheKey)
      if (cached) {
        logger.debug(`[OptionsPrefetch] Cache hit for ${key}`)
        return cached
      }
    }

    // Check if fetch is already in progress
    const pendingFetch = this.pendingFetches.get(key)
    if (pendingFetch) {
      logger.debug(`[OptionsPrefetch] Returning pending fetch for ${key}`)
      return pendingFetch
    }

    // Start new fetch
    logger.debug(`[OptionsPrefetch] Fetching ${key}...`)
    const fetchPromise = fetcher()
      .then((data) => {
        this.setCache(optionType, data, ttl, cacheKey)
        this.pendingFetches.delete(key)
        return data
      })
      .catch((error) => {
        this.pendingFetches.delete(key)
        logger.error(`[OptionsPrefetch] Failed to fetch ${key}:`, error)
        throw error
      })

    this.pendingFetches.set(key, fetchPromise)
    return fetchPromise
  }

  /**
   * Force refresh options (bypasses cache)
   */
  async refreshOptions(
    optionType: string,
    fetcher: () => Promise<any[]>,
    options: { ttl?: number; cacheKey?: string } = {}
  ): Promise<any[]> {
    return this.fetchOptions(optionType, fetcher, { ...options, forceRefresh: true })
  }

  /**
   * Prefetch options for a list of nodes
   * Fetches in priority order - first node's options are awaited,
   * subsequent nodes are fetched in background
   */
  async prefetchForNodes(
    nodes: Array<{ nodeType: string; providerId?: string }>,
    loadOptionsFn: (optionType: string, providerId?: string) => Promise<any[]>,
    isProviderConnected: (providerId: string) => boolean
  ): Promise<void> {
    if (nodes.length === 0) return

    logger.debug(`[OptionsPrefetch] Prefetching options for ${nodes.length} nodes`)

    // Group nodes by priority (index in array)
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      const requirements = NODE_FIELD_REQUIREMENTS[node.nodeType]

      if (!requirements) {
        logger.debug(`[OptionsPrefetch] No field requirements for ${node.nodeType}`)
        continue
      }

      // Check if provider is connected
      if (node.providerId && !isProviderConnected(node.providerId)) {
        logger.debug(`[OptionsPrefetch] Skipping ${node.nodeType} - provider not connected`)
        continue
      }

      // Get fields without dependencies first
      const independentFields = requirements.dynamicFields.filter(f => !f.dependsOn?.length)
      const dependentFields = requirements.dynamicFields.filter(f => f.dependsOn?.length)

      // Prefetch independent fields
      const prefetchPromises = independentFields.map(field => {
        const cacheKey = node.providerId
          ? `${field.optionType}:${node.providerId}`
          : field.optionType

        // Skip if already cached
        if (this.isCached(field.optionType, cacheKey)) {
          return Promise.resolve()
        }

        return this.fetchOptions(
          field.optionType,
          () => loadOptionsFn(field.optionType, node.providerId),
          { ttl: field.ttl, cacheKey }
        ).catch(err => {
          // Don't fail the whole prefetch if one field fails
          logger.warn(`[OptionsPrefetch] Failed to prefetch ${field.optionType}:`, err)
        })
      })

      // First node - await all prefetches (user will configure it first)
      if (i === 0) {
        await Promise.all(prefetchPromises)
        logger.debug(`[OptionsPrefetch] Completed prefetch for first node: ${node.nodeType}`)
      } else {
        // Background prefetch for other nodes - don't await
        Promise.all(prefetchPromises).then(() => {
          logger.debug(`[OptionsPrefetch] Background prefetch complete for: ${node.nodeType}`)
        })
      }

      // Note: Dependent fields are loaded on-demand when parent field is selected
    }
  }

  /**
   * Get node field requirements for a node type
   */
  getNodeRequirements(nodeType: string): NodeFieldRequirements | undefined {
    return NODE_FIELD_REQUIREMENTS[nodeType]
  }

  /**
   * Add or update field requirements for a node type
   */
  registerNodeRequirements(nodeType: string, requirements: NodeFieldRequirements) {
    NODE_FIELD_REQUIREMENTS[nodeType] = requirements
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    totalEntries: number
    entries: Array<{ key: string; itemCount: number; ttlRemaining: number }>
  } {
    const entries: Array<{ key: string; itemCount: number; ttlRemaining: number }> = []

    this.cache.forEach((entry, key) => {
      entries.push({
        key,
        itemCount: Array.isArray(entry.data) ? entry.data.length : 1,
        ttlRemaining: this.getCacheTimeRemaining(key),
      })
    })

    return {
      totalEntries: this.cache.size,
      entries,
    }
  }

  // ================================================
  // Provider-based prefetching (for IntegrationsSidePanel)
  // ================================================

  /**
   * Get fields that should be loaded on mount for a node type
   */
  private getLoadOnMountFields(nodeType: string): { name: string; dynamic: string; dependsOn?: string }[] {
    const nodeInfo = getNodeByType(nodeType)
    if (!nodeInfo?.configSchema) return []

    return nodeInfo.configSchema
      .filter((field: any) => field.loadOnMount === true && field.dynamic)
      .map((field: any) => ({
        name: field.name,
        dynamic: field.dynamic,
        dependsOn: field.dependsOn
      }))
  }

  /**
   * Get all node types for a provider
   */
  getNodeTypesForProvider(providerId: string): string[] {
    return ALL_NODE_COMPONENTS
      .filter(node => node.providerId === providerId && !node.isTrigger)
      .map(node => node.type)
  }

  /**
   * Load options for a single field via API
   */
  private async loadFieldOptionsFromAPI(
    fieldName: string,
    dynamicType: string,
    providerId: string,
    nodeType: string,
    signal?: AbortSignal
  ): Promise<{ success: boolean; options?: any[]; error?: string }> {
    try {
      const response = await fetch('/api/workflows/field-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId,
          nodeType,
          fieldName,
          resourceType: dynamicType,
          dependencies: {}
        }),
        signal
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()
      return { success: true, options: data.options || [] }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return { success: false, error: 'cancelled' }
      }
      return { success: false, error: error.message }
    }
  }

  /**
   * Start prefetching when user selects a provider in the action picker.
   * This pre-populates the cache so config modal opens faster.
   */
  async prefetchForProvider(
    providerId: string,
    options: { maxNodes?: number } = {}
  ): Promise<void> {
    const { maxNodes = 3 } = options
    const prefetchKey = `provider:${providerId}`

    logger.info(`[OptionsPrefetch] Starting provider prefetch for ${providerId}`)

    // Cancel any existing prefetch for this provider
    this.cancelProviderPrefetch(providerId)

    // Create new abort controller
    const controller = new AbortController()
    this.abortControllers.set(prefetchKey, controller)
    this.prefetchStatus.set(prefetchKey, 'loading')

    // Get node types for this provider (limit to maxNodes)
    const nodeTypes = this.getNodeTypesForProvider(providerId).slice(0, maxNodes)

    if (nodeTypes.length === 0) {
      logger.debug(`[OptionsPrefetch] No node types found for ${providerId}`)
      this.prefetchStatus.set(prefetchKey, 'loaded')
      return
    }

    logger.debug(`[OptionsPrefetch] Prefetching for ${nodeTypes.length} node types:`, nodeTypes)

    try {
      // Collect all loadOnMount fields across node types
      const fieldsToLoad: Array<{
        nodeType: string
        fieldName: string
        dynamic: string
      }> = []

      for (const nodeType of nodeTypes) {
        const fields = this.getLoadOnMountFields(nodeType)
        for (const field of fields) {
          // Only include independent fields (no dependsOn)
          if (!field.dependsOn) {
            fieldsToLoad.push({
              nodeType,
              fieldName: field.name,
              dynamic: field.dynamic
            })
          }
        }
      }

      if (fieldsToLoad.length === 0) {
        logger.debug(`[OptionsPrefetch] No loadOnMount fields for ${providerId}`)
        this.prefetchStatus.set(prefetchKey, 'loaded')
        return
      }

      // Deduplicate by dynamic type (same API call for same resource type)
      const uniqueFields = new Map<string, typeof fieldsToLoad[0]>()
      for (const field of fieldsToLoad) {
        const key = `${field.dynamic}`
        if (!uniqueFields.has(key)) {
          uniqueFields.set(key, field)
        }
      }

      logger.debug(`[OptionsPrefetch] Loading ${uniqueFields.size} unique field types for ${providerId}`)

      // Load all fields in parallel
      const loadPromises = Array.from(uniqueFields.values()).map(async (field) => {
        // Check if already cached
        const cacheKey = `${providerId}:${field.dynamic}`
        if (this.isCached(cacheKey)) {
          logger.debug(`[OptionsPrefetch] Already cached: ${cacheKey}`)
          return
        }

        const result = await this.loadFieldOptionsFromAPI(
          field.fieldName,
          field.dynamic,
          providerId,
          field.nodeType,
          controller.signal
        )

        if (result.success && result.options) {
          // Cache in our service cache
          this.setCache(cacheKey, result.options, CACHE_TTL.medium)

          // Also save to localStorage for useDynamicOptions
          this.saveToLocalStorageCache(providerId, field.nodeType, field.fieldName, result.options)

          // And to configCacheStore
          if (shouldCacheField(field.fieldName)) {
            const storeCacheKey = buildCacheKey(providerId, providerId, field.fieldName, undefined)
            useConfigCacheStore.getState().set(storeCacheKey, result.options, getFieldTTL(field.fieldName))
          }

          logger.debug(`[OptionsPrefetch] Loaded ${result.options.length} options for ${cacheKey}`)
        }
      })

      await Promise.all(loadPromises)
      this.prefetchStatus.set(prefetchKey, 'loaded')
      logger.info(`[OptionsPrefetch] Provider prefetch complete for ${providerId}`)

    } catch (error: any) {
      if (error.name !== 'AbortError') {
        this.prefetchStatus.set(prefetchKey, 'error')
        logger.error(`[OptionsPrefetch] Provider prefetch error for ${providerId}:`, error)
      }
    }
  }

  /**
   * Save to localStorage in the same format useDynamicOptions expects
   */
  private saveToLocalStorageCache(
    providerId: string,
    nodeType: string,
    fieldName: string,
    options: any[]
  ): void {
    if (typeof window === 'undefined') return

    try {
      const cacheKey = `dynamicOptions_${providerId}_${nodeType}`
      const existingRaw = localStorage.getItem(cacheKey)

      let cacheData = {
        options: {} as Record<string, any[]>,
        timestamp: Date.now()
      }

      if (existingRaw) {
        try {
          const existing = JSON.parse(existingRaw)
          if (Date.now() - existing.timestamp < CACHE_TTL.medium) {
            cacheData.options = existing.options || {}
          }
        } catch (e) {
          // Ignore parse errors
        }
      }

      cacheData.options[fieldName] = options
      cacheData.timestamp = Date.now()

      localStorage.setItem(cacheKey, JSON.stringify(cacheData))
    } catch (error) {
      logger.error('[OptionsPrefetch] Error writing to localStorage:', error)
    }
  }

  /**
   * Cancel an in-flight provider prefetch
   */
  cancelProviderPrefetch(providerId: string): void {
    const prefetchKey = `provider:${providerId}`
    const controller = this.abortControllers.get(prefetchKey)
    if (controller) {
      logger.debug(`[OptionsPrefetch] Cancelling prefetch for ${providerId}`)
      controller.abort()
      this.abortControllers.delete(prefetchKey)
      this.prefetchStatus.set(prefetchKey, 'pending')
    }
  }

  /**
   * Cancel all in-flight prefetches
   */
  cancelAllPrefetches(): void {
    for (const [key, controller] of this.abortControllers) {
      controller.abort()
    }
    this.abortControllers.clear()
    this.prefetchStatus.clear()
  }

  /**
   * Get prefetch status for a provider
   */
  getProviderPrefetchStatus(providerId: string): 'pending' | 'loading' | 'loaded' | 'error' {
    return this.prefetchStatus.get(`provider:${providerId}`) || 'pending'
  }

  /**
   * Prefetch for a specific node type (when user clicks on an action)
   */
  async prefetchForNodeType(
    nodeType: string,
    providerId: string
  ): Promise<void> {
    const prefetchKey = `node:${nodeType}`

    // Cancel any existing prefetch for this node
    const existingController = this.abortControllers.get(prefetchKey)
    if (existingController) {
      existingController.abort()
    }

    const controller = new AbortController()
    this.abortControllers.set(prefetchKey, controller)

    const fields = this.getLoadOnMountFields(nodeType)
    if (fields.length === 0) return

    logger.debug(`[OptionsPrefetch] Prefetching ${fields.length} fields for ${nodeType}`)

    const independentFields = fields.filter(f => !f.dependsOn)

    const loadPromises = independentFields.map(async (field) => {
      const cacheKey = `${providerId}:${field.dynamic}`
      if (this.isCached(cacheKey)) return

      const result = await this.loadFieldOptionsFromAPI(
        field.name,
        field.dynamic,
        providerId,
        nodeType,
        controller.signal
      )

      if (result.success && result.options) {
        this.setCache(cacheKey, result.options, CACHE_TTL.medium)
        this.saveToLocalStorageCache(providerId, nodeType, field.name, result.options)

        if (shouldCacheField(field.name)) {
          const storeCacheKey = buildCacheKey(providerId, providerId, field.name, undefined)
          useConfigCacheStore.getState().set(storeCacheKey, result.options, getFieldTTL(field.name))
        }
      }
    })

    try {
      await Promise.all(loadPromises)
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        logger.error(`[OptionsPrefetch] Node prefetch error for ${nodeType}:`, error)
      }
    }

    this.abortControllers.delete(prefetchKey)
  }
}

// Singleton instance
export const optionsPrefetchService = new OptionsPrefetchService()

// Export types and constants
export { CACHE_TTL, DEFAULT_TTL }
export type { CacheEntry, PrefetchConfig, NodeFieldRequirements }
