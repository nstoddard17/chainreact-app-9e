/**
 * Twitter Options Loader
 * Handles loading dynamic options for Twitter-specific fields
 */

import { ProviderOptionsLoader, LoadOptionsParams, FormattedOption } from '../types';
import { logger } from '@/lib/utils/logger';

// Debounce map to prevent rapid consecutive calls
const debounceTimers = new Map<string, NodeJS.Timeout>();
const pendingPromises = new Map<string, Promise<FormattedOption[]>>();

export class TwitterOptionsLoader implements ProviderOptionsLoader {
  private supportedFields = [
    'mentions',
    'followers',
    'lists'
  ];

  // Map field names to Twitter API data types
  private fieldToDataType: Record<string, string> = {
    mentions: 'twitter_mentions',
    followers: 'twitter_followers',
    lists: 'twitter_lists'
  };

  canHandle(fieldName: string, providerId: string): boolean {
    return providerId === 'twitter' && this.supportedFields.includes(fieldName);
  }

  async loadOptions(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { fieldName, integrationId, forceRefresh, signal } = params;

    // Create a unique key for this request
    const requestKey = `${fieldName}:${forceRefresh}`;

    // Check if there's already a pending promise for this exact request
    const pendingPromise = pendingPromises.get(requestKey);
    if (pendingPromise) {
      logger.debug(`🔄 [Twitter] Reusing pending request for ${fieldName}`);
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
          // Get the data type for this field
          const dataType = this.fieldToDataType[fieldName];

          if (!dataType) {
            logger.warn(`❌ [Twitter] Unknown field: ${fieldName}`);
            resolve([]);
            return;
          }

          logger.debug(`📡 [Twitter] Loading ${dataType}:`, { integrationId });

          // Make API request
          const response = await fetch('/api/integrations/twitter/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              integrationId,
              dataType
            }),
            signal
          });

          if (!response.ok) {
            throw new Error(`Failed to load ${fieldName}: ${response.statusText}`);
          }

          const responseData = await response.json();
          const result = responseData.data || [];

          logger.debug(`✅ [Twitter] Loaded ${result.length} ${dataType}`);

          // Clean up pending promise
          pendingPromises.delete(requestKey);

          resolve(result);
        } catch (error: any) {
          logger.error(`❌ [Twitter] Error loading ${fieldName}:`, error);

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
    // Twitter fields don't have dependencies currently
    return [];
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    pendingPromises.clear();
    debounceTimers.forEach(timer => clearTimeout(timer));
    debounceTimers.clear();
    logger.debug('🧹 [Twitter] Cache cleared');
  }
}
