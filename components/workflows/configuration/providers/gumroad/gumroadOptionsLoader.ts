/**
 * Gumroad Options Loader
 * Handles loading dynamic options for Gumroad-specific fields
 */

import { ProviderOptionsLoader, LoadOptionsParams, FormattedOption } from '../types';
import { logger } from '@/lib/utils/logger';
import { useConfigCacheStore } from '@/stores/configCacheStore';
import { buildCacheKey, getFieldTTL } from '@/lib/workflows/configuration/cache-utils';

// Debounce map to prevent rapid consecutive calls
const debounceTimers = new Map<string, NodeJS.Timeout>();
const pendingPromises = new Map<string, Promise<FormattedOption[]>>();

export class GumroadOptionsLoader implements ProviderOptionsLoader {
  private supportedFields = [
    'product',
    'productId'
  ];

  canHandle(fieldName: string, providerId: string): boolean {
    return providerId === 'gumroad' && this.supportedFields.includes(fieldName);
  }

  async loadOptions(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { fieldName, integrationId, forceRefresh } = params;

    // Create a unique key for this request
    const requestKey = `${fieldName}:${integrationId}:${forceRefresh}`;

    // Check if there's already a pending promise for this exact request
    const pendingPromise = pendingPromises.get(requestKey);
    if (pendingPromise) {
      logger.debug(`🔄 [Gumroad] Reusing pending request for ${fieldName}`);
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

          switch (fieldName) {
            case 'product':
            case 'productId':
              result = await this.loadProducts(params);
              break;

            default:
              logger.warn(`⚠️ [Gumroad] Unsupported field: ${fieldName}`);
          }

          pendingPromises.delete(requestKey);
          resolve(result);
        } catch (error) {
          logger.error(`❌ [Gumroad] Error loading ${fieldName}:`, error);
          pendingPromises.delete(requestKey);
          resolve([]);
        }
      }, 50); // 50ms debounce

      debounceTimers.set(fieldName, timer);
    });

    // Store the promise so other concurrent requests can reuse it
    pendingPromises.set(requestKey, loadPromise);

    return loadPromise;
  }

  private async loadProducts(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { integrationId, forceRefresh } = params;
    const cacheKey = buildCacheKey('gumroad', 'gumroad_products', integrationId || '');
    const cache = useConfigCacheStore.getState();

    // Check cache first
    if (!forceRefresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        logger.debug(`✅ [Gumroad] Returning cached products (${cached.length} items)`);
        return cached;
      }
    }

    if (!integrationId) {
      logger.error('❌ [Gumroad] No integration ID provided for products');
      return [];
    }

    logger.debug(`🔍 [Gumroad] Loading products for integration ${integrationId}`);

    try {
      const response = await fetch('/api/integrations/gumroad/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          integrationId,
          dataType: 'gumroad_products',
          options: {}
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.error(`❌ [Gumroad] API error:`, errorData);

        // Handle authentication errors
        if (response.status === 401 || errorData.needsReconnection) {
          throw new Error('Gumroad integration needs to be reconnected');
        }

        throw new Error(errorData.error || `Failed to load products: ${response.statusText}`);
      }

      const data = await response.json();
      const products = data.data || [];

      logger.debug(`✅ [Gumroad] Loaded ${products.length} products`);

      // Products are already formatted by the handler with value and label
      const formattedProducts = products.map((product: any) => ({
        value: product.value || product.id,
        label: product.label || product.name,
        raw: product
      }));

      // Cache the results
      const ttl = getFieldTTL('gumroad_products');
      cache.set(cacheKey, formattedProducts, ttl);

      return formattedProducts;
    } catch (error: any) {
      logger.error('❌ [Gumroad] Error loading products:', error);

      // Return empty array on error instead of throwing
      // This prevents the UI from breaking
      return [];
    }
  }
}
