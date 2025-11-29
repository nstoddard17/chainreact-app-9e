/**
 * Monday.com Options Loader
 * Handles loading dynamic options for Monday.com-specific fields
 */

import { ProviderOptionsLoader, LoadOptionsParams, FormattedOption } from '../types';
import { logger } from '@/lib/utils/logger';
import { useConfigCacheStore } from '@/stores/configCacheStore';
import { buildCacheKey, getFieldTTL } from '@/lib/workflows/configuration/cache-utils';

// Debounce map to prevent rapid consecutive calls
const debounceTimers = new Map<string, NodeJS.Timeout>();
const pendingPromises = new Map<string, Promise<FormattedOption[]>>();

export class MondayOptionsLoader implements ProviderOptionsLoader {
  private supportedFields = [
    'boardId',
    'board',
    'groupId',
    'group',
    'columnId',
    'column'
  ];

  // Map field names to Monday.com API data types
  private fieldToDataType: Record<string, string> = {
    boardId: 'monday_boards',
    board: 'monday_boards',
    groupId: 'monday_groups',
    group: 'monday_groups',
    columnId: 'monday_columns',
    column: 'monday_columns'
  };

  canHandle(fieldName: string, providerId: string): boolean {
    return providerId === 'monday' && this.supportedFields.includes(fieldName);
  }

  async loadOptions(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { fieldName, dependsOnValue, integrationId, forceRefresh, signal } = params;

    // Build cache key
    const options = (fieldName === 'groupId' || fieldName === 'group' ||
                     fieldName === 'columnId' || fieldName === 'column') && dependsOnValue
      ? { boardId: dependsOnValue }
      : undefined;
    const cacheKey = buildCacheKey('monday', integrationId, fieldName, options);

    // Get cache store
    const cacheStore = useConfigCacheStore.getState();

    // Check if we should force refresh (invalidate cache first)
    if (forceRefresh) {
      logger.debug(`🔄 [Monday] Force refresh - invalidating cache:`, cacheKey);
      cacheStore.invalidate(cacheKey);
    }

    // Try to get from cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = cacheStore.get(cacheKey);
      if (cached) {
        logger.debug(`💾 [Monday] Cache HIT for ${fieldName}:`, { cacheKey, count: cached.length });
        return cached;
      }
      logger.debug(`❌ [Monday] Cache MISS for ${fieldName}:`, { cacheKey });
    }

    // Create a unique key for pending promises (includes forceRefresh to prevent reuse during refresh)
    const requestKey = `${cacheKey}:${forceRefresh}`;

    // Check if there's already a pending promise for this exact request
    const pendingPromise = pendingPromises.get(requestKey);
    if (pendingPromise) {
      logger.debug(`🔄 [Monday] Reusing pending request for ${fieldName}`);
      return pendingPromise;
    }

    // Clear any existing debounce timer for this field
    const existingTimer = debounceTimers.get(fieldName);
    if (existingTimer) {
      clearTimeout(existingTimer);
      debounceTimers.delete(fieldName);
    }

    const dataType = this.fieldToDataType[fieldName];
    if (!dataType) {
      logger.warn(`❌ [Monday] Unknown field: ${fieldName}`);
      return [];
    }

    // Create a new promise for this request
    const loadPromise = new Promise<FormattedOption[]>((resolve) => {
      // Add a small debounce delay to batch rapid consecutive calls
      const timer = setTimeout(async () => {
        debounceTimers.delete(fieldName);

        try {
          let result: FormattedOption[] = [];

          // Build options object for API request
          const apiOptions: Record<string, any> = {};

          // Add board parameter for dependent fields (groups, columns)
          if ((fieldName === 'groupId' || fieldName === 'group' ||
               fieldName === 'columnId' || fieldName === 'column') && dependsOnValue) {
            apiOptions.boardId = dependsOnValue;
          }

          logger.debug(`📡 [Monday] Loading ${dataType}:`, { integrationId, options: apiOptions });

          // Make API request
          const response = await fetch('/api/integrations/monday/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              integrationId,
              dataType,
              options: apiOptions
            }),
            signal
          });

          if (!response.ok) {
            // Try to get error details from response body
            let errorMessage = response.statusText;
            try {
              const errorData = await response.json();
              errorMessage = errorData.error || errorData.message || errorMessage;
            } catch {
              // If we can't parse JSON, use statusText
            }
            throw new Error(`Failed to load ${fieldName}: ${errorMessage}`);
          }

          const responseData = await response.json();
          result = responseData.data || [];

          logger.debug(`✅ [Monday] Loaded ${result.length} ${dataType}`);

          // Store in cache with appropriate TTL
          const ttl = getFieldTTL(fieldName);
          cacheStore.set(cacheKey, result, ttl);
          logger.debug(`💾 [Monday] Cached ${result.length} options for ${fieldName} (TTL: ${ttl / 1000}s)`);

          // Clean up pending promise
          pendingPromises.delete(requestKey);

          resolve(result);
        } catch (error: any) {
          logger.error(`❌ [Monday] Error loading ${fieldName}:`, {
            message: error.message,
            fieldName,
            dataType,
            integrationId,
            dependsOnValue
          });

          // Clean up pending promise
          pendingPromises.delete(requestKey);

          resolve([]);
        }
      }, 100); // 100ms debounce

      debounceTimers.set(fieldName, timer);
    });

    // Store the pending promise
    pendingPromises.set(requestKey, loadPromise);

    return loadPromise;
  }

  /**
   * Get field dependencies
   */
  getFieldDependencies(fieldName: string): string[] {
    switch (fieldName) {
      case 'groupId':
      case 'group':
      case 'columnId':
      case 'column':
        return ['boardId', 'board'];
      default:
        return [];
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    // Clear pending promises and debounce timers
    pendingPromises.clear();
    debounceTimers.forEach(timer => clearTimeout(timer));
    debounceTimers.clear();

    // Clear cache store for this provider
    const cacheStore = useConfigCacheStore.getState();
    cacheStore.invalidateProvider('monday');

    logger.debug('🧹 [Monday] Cache cleared');
  }
}
