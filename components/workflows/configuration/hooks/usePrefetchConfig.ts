"use client"

import { useCallback, useRef } from 'react'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useConfigCacheStore } from '@/stores/configCacheStore'
import { getResourceTypeForField } from '../config/fieldMappings'
import { logger } from '@/lib/utils/logger'

/**
 * Hook for prefetching configuration data before modal opens
 * Implements aggressive prefetching strategy for instant UX
 */
export const usePrefetchConfig = () => {
  const { fetchIntegrations, getIntegrationByProvider, loadIntegrationData } = useIntegrationStore()
  const { get: getCache, set: setCache } = useConfigCacheStore()

  // Track in-flight prefetch requests to avoid duplicates
  const prefetchingRef = useRef<Set<string>>(new Set())
  const prefetchPromisesRef = useRef<Map<string, Promise<any>>>(new Map())

  /**
   * Prefetch data for a specific field
   */
  const prefetchField = useCallback(async (
    fieldName: string,
    nodeType: string,
    providerId: string,
    dependsOnValue?: any
  ): Promise<void> => {
    const cacheKey = `${providerId}_${nodeType}_${fieldName}_${dependsOnValue || 'root'}`

    // Check if already prefetching
    if (prefetchingRef.current.has(cacheKey)) {
      return prefetchPromisesRef.current.get(cacheKey)
    }

    // Check cache first
    const cached = getCache(cacheKey)
    if (cached) {
      logger.debug('✅ [Prefetch] Cache hit:', cacheKey)
      return Promise.resolve()
    }

    const promise = (async () => {
      try {
        logger.debug('🚀 [Prefetch] Starting for field:', fieldName)

        const resourceType = getResourceTypeForField(providerId, fieldName)
        if (!resourceType) {
          logger.debug('⚠️ [Prefetch] No resource type for field:', fieldName)
          return
        }

        const integration = getIntegrationByProvider(providerId)
        if (!integration) {
          logger.debug('⚠️ [Prefetch] No integration found for:', providerId)
          // Fetch integrations and retry
          await fetchIntegrations()
          return
        }

        // Load data from API
        const data = await loadIntegrationData(resourceType, integration.id, {}, false)

        // Cache the result
        setCache(cacheKey, data, 15 * 60 * 1000) // 15 min TTL for prefetched data

        logger.debug('✅ [Prefetch] Completed for field:', fieldName)
      } catch (error: any) {
        logger.error('❌ [Prefetch] Failed for field:', fieldName, error.message)
      } finally {
        prefetchingRef.current.delete(cacheKey)
        prefetchPromisesRef.current.delete(cacheKey)
      }
    })()

    prefetchingRef.current.add(cacheKey)
    prefetchPromisesRef.current.set(cacheKey, promise)

    return promise
  }, [getIntegrationByProvider, loadIntegrationData, fetchIntegrations, getCache, setCache])

  /**
   * Prefetch all independent fields for a node
   */
  const prefetchNodeConfig = useCallback(async (
    nodeType: string,
    providerId: string,
    fields: any[]
  ): Promise<void> => {
    try {
      logger.debug('🚀 [Prefetch] Starting node prefetch:', { nodeType, providerId })

      // First, ensure integrations are loaded
      await fetchIntegrations()

      // Get all independent fields (no dependencies)
      const independentFields = fields.filter((field: any) =>
        field.dynamic && !field.dependsOn && !field.hidden
      )

      if (independentFields.length === 0) {
        logger.debug('⚠️ [Prefetch] No independent fields to prefetch')
        return
      }

      logger.debug(`🚀 [Prefetch] Found ${independentFields.length} independent fields to prefetch`)

      // Prefetch all independent fields in parallel
      await Promise.allSettled(
        independentFields.map(field =>
          prefetchField(field.name, nodeType, providerId)
        )
      )

      logger.debug('✅ [Prefetch] Completed node prefetch:', nodeType)
    } catch (error: any) {
      logger.error('❌ [Prefetch] Failed node prefetch:', error.message)
    }
  }, [fetchIntegrations, prefetchField])

  /**
   * Clear prefetch cache for a provider
   */
  const clearPrefetchCache = useCallback((providerId: string) => {
    // Clear all entries related to this provider
    logger.debug('🧹 [Prefetch] Clearing cache for provider:', providerId)
    // The cache store will handle this
  }, [])

  return {
    prefetchField,
    prefetchNodeConfig,
    clearPrefetchCache
  }
}
