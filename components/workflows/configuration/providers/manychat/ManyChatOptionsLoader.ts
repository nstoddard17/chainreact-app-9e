/**
 * ManyChat Options Loader
 * Handles loading dynamic options for ManyChat-specific fields
 */

import { ProviderOptionsLoader, LoadOptionsParams, FormattedOption } from '../types'
import { logger } from '@/lib/utils/logger'
import { useConfigCacheStore } from '@/stores/configCacheStore'
import { buildCacheKey, getFieldTTL } from '@/lib/workflows/configuration/cache-utils'
import { parseErrorAndHandleReconnection } from '@/lib/utils/integration-reconnection'

// Debounce map to prevent rapid consecutive calls
const debounceTimers = new Map<string, NodeJS.Timeout>()
const pendingPromises = new Map<string, Promise<FormattedOption[]>>()

export class ManyChatOptionsLoader implements ProviderOptionsLoader {
  private supportedFields = [
    'tag',
    'tagId',
    'customField',
    'fieldId',
    'flow',
    'flowNs',
    'sequence',
    'sequenceId',
  ]

  canHandle(fieldName: string, providerId: string): boolean {
    return providerId === 'manychat' && this.supportedFields.includes(fieldName)
  }

  async loadOptions(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { fieldName, integrationId, forceRefresh } = params

    // Create a unique key for this request
    const requestKey = `${fieldName}:${integrationId}:${forceRefresh}`

    // Check if there's already a pending promise for this exact request
    const pendingPromise = pendingPromises.get(requestKey)
    if (pendingPromise) {
      logger.debug(`🔄 [ManyChat] Reusing pending request for ${fieldName}`)
      return pendingPromise
    }

    // Clear any existing debounce timer for this field
    const existingTimer = debounceTimers.get(fieldName)
    if (existingTimer) {
      clearTimeout(existingTimer)
      debounceTimers.delete(fieldName)
    }

    // Create a new promise for this request
    const loadPromise = new Promise<FormattedOption[]>((resolve) => {
      // Add a small debounce delay to batch rapid consecutive calls
      const timer = setTimeout(async () => {
        debounceTimers.delete(fieldName)

        try {
          let result: FormattedOption[] = []

          switch (fieldName) {
            case 'tag':
            case 'tagId':
              result = await this.loadTags(params)
              break

            case 'customField':
            case 'fieldId':
              result = await this.loadCustomFields(params)
              break

            case 'flow':
            case 'flowNs':
              result = await this.loadFlows(params)
              break

            case 'sequence':
            case 'sequenceId':
              result = await this.loadSequences(params)
              break

            default:
              logger.warn(`⚠️ [ManyChat] Unsupported field: ${fieldName}`)
          }

          pendingPromises.delete(requestKey)
          resolve(result)
        } catch (error) {
          logger.error(`❌ [ManyChat] Error loading ${fieldName}:`, error)
          pendingPromises.delete(requestKey)
          resolve([])
        }
      }, 100) // 100ms debounce

      debounceTimers.set(fieldName, timer)
    })

    pendingPromises.set(requestKey, loadPromise)
    return loadPromise
  }

  private async loadTags(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { integrationId, forceRefresh } = params
    const cacheKey = buildCacheKey('manychat', 'tags', integrationId)

    // Check cache first
    if (!forceRefresh) {
      const cached = useConfigCacheStore.getState().get(cacheKey)
      if (cached && Array.isArray(cached)) {
        logger.debug(`✅ [ManyChat] Using cached tags (${cached.length} items)`)
        return cached
      }
    }

    try {
      logger.debug(`📡 [ManyChat] Fetching tags from API`)
      const response = await fetch(`/api/integrations/manychat/tags?integrationId=${integrationId}`)

      if (!response.ok) {
        await parseErrorAndHandleReconnection(response, 'manychat', integrationId)
        return []
      }

      const data = await response.json()
      const tags: FormattedOption[] = (data.tags || []).map((tag: any) => ({
        value: String(tag.id),
        label: tag.name,
      }))

      // Cache the results
      useConfigCacheStore.getState().set(cacheKey, tags, getFieldTTL('tags'))
      logger.debug(`✅ [ManyChat] Loaded ${tags.length} tags`)

      return tags
    } catch (error: any) {
      logger.error(`❌ [ManyChat] Failed to load tags:`, error)
      throw error
    }
  }

  private async loadCustomFields(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { integrationId, forceRefresh } = params
    const cacheKey = buildCacheKey('manychat', 'custom_fields', integrationId)

    // Check cache first
    if (!forceRefresh) {
      const cached = useConfigCacheStore.getState().get(cacheKey)
      if (cached && Array.isArray(cached)) {
        logger.debug(`✅ [ManyChat] Using cached custom fields (${cached.length} items)`)
        return cached
      }
    }

    try {
      logger.debug(`📡 [ManyChat] Fetching custom fields from API`)
      const response = await fetch(
        `/api/integrations/manychat/custom-fields?integrationId=${integrationId}`
      )

      if (!response.ok) {
        await parseErrorAndHandleReconnection(response, 'manychat', integrationId)
        return []
      }

      const data = await response.json()
      const fields: FormattedOption[] = (data.fields || []).map((field: any) => ({
        value: String(field.id),
        label: `${field.name} (${field.type})`,
      }))

      // Cache the results
      useConfigCacheStore.getState().set(cacheKey, fields, getFieldTTL('custom_fields'))
      logger.debug(`✅ [ManyChat] Loaded ${fields.length} custom fields`)

      return fields
    } catch (error: any) {
      logger.error(`❌ [ManyChat] Failed to load custom fields:`, error)
      throw error
    }
  }

  private async loadFlows(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { integrationId, forceRefresh } = params
    const cacheKey = buildCacheKey('manychat', 'flows', integrationId)

    // Check cache first
    if (!forceRefresh) {
      const cached = useConfigCacheStore.getState().get(cacheKey)
      if (cached && Array.isArray(cached)) {
        logger.debug(`✅ [ManyChat] Using cached flows (${cached.length} items)`)
        return cached
      }
    }

    try {
      logger.debug(`📡 [ManyChat] Fetching flows from API`)
      const response = await fetch(`/api/integrations/manychat/flows?integrationId=${integrationId}`)

      if (!response.ok) {
        await parseErrorAndHandleReconnection(response, 'manychat', integrationId)
        return []
      }

      const data = await response.json()
      const flows: FormattedOption[] = (data.flows || []).map((flow: any) => ({
        value: flow.ns, // Flow namespace is the value we need for sending
        label: `${flow.name}${flow.status !== 'active' ? ` (${flow.status})` : ''}`,
      }))

      // Cache the results
      useConfigCacheStore.getState().set(cacheKey, flows, getFieldTTL('flows'))
      logger.debug(`✅ [ManyChat] Loaded ${flows.length} flows`)

      return flows
    } catch (error: any) {
      logger.error(`❌ [ManyChat] Failed to load flows:`, error)
      throw error
    }
  }

  private async loadSequences(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { integrationId, forceRefresh } = params
    const cacheKey = buildCacheKey('manychat', 'sequences', integrationId)

    // Check cache first
    if (!forceRefresh) {
      const cached = useConfigCacheStore.getState().get(cacheKey)
      if (cached && Array.isArray(cached)) {
        logger.debug(`✅ [ManyChat] Using cached sequences (${cached.length} items)`)
        return cached
      }
    }

    try {
      logger.debug(`📡 [ManyChat] Fetching sequences from API`)
      const response = await fetch(
        `/api/integrations/manychat/sequences?integrationId=${integrationId}`
      )

      if (!response.ok) {
        await parseErrorAndHandleReconnection(response, 'manychat', integrationId)
        return []
      }

      const data = await response.json()
      const sequences: FormattedOption[] = (data.sequences || []).map((sequence: any) => ({
        value: String(sequence.id),
        label: `${sequence.name}${sequence.status !== 'active' ? ` (${sequence.status})` : ''}`,
      }))

      // Cache the results
      useConfigCacheStore.getState().set(cacheKey, sequences, getFieldTTL('sequences'))
      logger.debug(`✅ [ManyChat] Loaded ${sequences.length} sequences`)

      return sequences
    } catch (error: any) {
      logger.error(`❌ [ManyChat] Failed to load sequences:`, error)
      throw error
    }
  }
}
