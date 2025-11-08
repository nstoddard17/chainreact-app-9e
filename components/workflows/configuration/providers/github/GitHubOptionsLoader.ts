/**
 * GitHub Options Loader
 * Handles loading dynamic options for GitHub-specific fields
 */

import { ProviderOptionsLoader, LoadOptionsParams, FormattedOption } from '../types';
import { logger } from '@/lib/utils/logger';
import { useConfigCacheStore } from '@/stores/configCacheStore';
import { buildCacheKey, getFieldTTL } from '@/lib/workflows/configuration/cache-utils';

// Debounce map to prevent rapid consecutive calls
const debounceTimers = new Map<string, NodeJS.Timeout>();
const pendingPromises = new Map<string, Promise<FormattedOption[]>>();

export class GitHubOptionsLoader implements ProviderOptionsLoader {
  private supportedFields = [
    'repository',
    'branch',
    'head',
    'base',
    'assignees',
    'labels',
    'milestone',
    'issueNumber'
  ];

  // Map field names to GitHub API data types
  private fieldToDataType: Record<string, string> = {
    repository: 'github_repositories',
    branch: 'github_branches',
    head: 'github_branches',
    base: 'github_branches',
    assignees: 'github_assignees',
    labels: 'github_labels',
    milestone: 'github_milestones',
    issueNumber: 'github_issues'
  };

  canHandle(fieldName: string, providerId: string): boolean {
    return providerId === 'github' && this.supportedFields.includes(fieldName);
  }

  async loadOptions(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { fieldName, dependsOnValue, integrationId, forceRefresh, signal } = params;

    // Build cache key
    const options = fieldName !== 'repository' && dependsOnValue
      ? { repository: dependsOnValue }
      : undefined;
    const cacheKey = buildCacheKey('github', integrationId, fieldName, options);

    // Get cache store
    const cacheStore = useConfigCacheStore.getState();

    // Check if we should force refresh (invalidate cache first)
    if (forceRefresh) {
      logger.debug(`🔄 [GitHub] Force refresh - invalidating cache:`, cacheKey);
      cacheStore.invalidate(cacheKey);
    }

    // Try to get from cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = cacheStore.get(cacheKey);
      if (cached) {
        logger.debug(`💾 [GitHub] Cache HIT for ${fieldName}:`, { cacheKey, count: cached.length });
        return cached;
      }
      logger.debug(`❌ [GitHub] Cache MISS for ${fieldName}:`, { cacheKey });
    }

    // Create a unique key for pending promises (includes forceRefresh to prevent reuse during refresh)
    const requestKey = `${cacheKey}:${forceRefresh}`;

    // Check if there's already a pending promise for this exact request
    const pendingPromise = pendingPromises.get(requestKey);
    if (pendingPromise) {
      logger.debug(`🔄 [GitHub] Reusing pending request for ${fieldName}`);
      return pendingPromise;
    }

    // Clear any existing debounce timer for this field
    const existingTimer = debounceTimers.get(fieldName);
    if (existingTimer) {
      clearTimeout(existingTimer);
      debounceTimers.delete(fieldName);
    }

    // Create a new promise for this request
    const loadPromise = new Promise<FormattedOption[]>((resolve) => {
      // Add a small debounce delay to batch rapid consecutive calls
      const timer = setTimeout(async () => {
        debounceTimers.delete(fieldName);

        try {
          let result: FormattedOption[] = [];

          // Get the data type for this field
          const dataType = this.fieldToDataType[fieldName];

          if (!dataType) {
            logger.warn(`❌ [GitHub] Unknown field: ${fieldName}`);
            resolve([]);
            return;
          }

          // Build options object for API request
          const apiOptions: Record<string, any> = {};

          // Add repository parameter for dependent fields
          if (fieldName !== 'repository' && dependsOnValue) {
            apiOptions.repository = dependsOnValue;
          }

          logger.debug(`📡 [GitHub] Loading ${dataType}:`, { integrationId, options: apiOptions });

          // Make API request
          const response = await fetch('/api/integrations/github/data', {
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
            throw new Error(`Failed to load ${fieldName}: ${response.statusText}`);
          }

          const responseData = await response.json();
          result = responseData.data || [];

          logger.debug(`✅ [GitHub] Loaded ${result.length} ${dataType}`);

          // Store in cache with appropriate TTL
          const ttl = getFieldTTL(fieldName);
          cacheStore.set(cacheKey, result, ttl);
          logger.debug(`💾 [GitHub] Cached ${result.length} options for ${fieldName} (TTL: ${ttl / 1000}s)`);

          // Clean up pending promise
          pendingPromises.delete(requestKey);

          resolve(result);
        } catch (error: any) {
          // Better error logging - show actual error details
          const errorDetails = {
            message: error?.message || 'Unknown error',
            name: error?.name,
            code: error?.code,
            stack: error?.stack
          };

          // Don't log AbortErrors (they're expected when requests are cancelled)
          if (error?.name !== 'AbortError') {
            logger.error(`❌ [GitHub] Error loading ${fieldName}:`, errorDetails);
          }

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
      case 'branch':
      case 'head':
      case 'base':
      case 'assignees':
      case 'labels':
      case 'milestone':
        return ['repository'];
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
    cacheStore.invalidateProvider('github');

    logger.debug('🧹 [GitHub] Cache cleared');
  }
}
