/**
 * Stripe Options Loader
 * Handles loading dynamic options for Stripe-specific fields
 *
 * Maps field names to Stripe API data types:
 * - stripe_account -> stripe_accounts
 * - customerId/customer -> stripe_customers
 * - priceId -> stripe_prices
 * - subscriptionId -> stripe_subscriptions
 * - paymentIntentId -> stripe_payment_intents
 * - payment_method/invoice_settings_default_payment_method -> stripe_payment_methods
 */

import { ProviderOptionsLoader, LoadOptionsParams, FormattedOption } from '../types';
import { logger } from '@/lib/utils/logger';
import { useConfigCacheStore } from '@/stores/configCacheStore';
import { buildCacheKey, getFieldTTL } from '@/lib/workflows/configuration/cache-utils';

// Debounce map to prevent rapid consecutive calls
const debounceTimers = new Map<string, NodeJS.Timeout>();
const pendingPromises = new Map<string, Promise<FormattedOption[]>>();

// Field name to data type mapping
const FIELD_DATA_TYPE_MAP: Record<string, string> = {
  stripe_account: 'stripe_accounts',
  customerId: 'stripe_customers',
  customer: 'stripe_customers',
  priceId: 'stripe_prices',
  subscriptionId: 'stripe_subscriptions',
  paymentIntentId: 'stripe_payment_intents',
  payment_method: 'stripe_payment_methods',
  invoice_settings_default_payment_method: 'stripe_payment_methods',
};

export class StripeOptionsLoader implements ProviderOptionsLoader {
  canHandle(fieldName: string, providerId: string): boolean {
    return providerId === 'stripe' && fieldName in FIELD_DATA_TYPE_MAP;
  }

  async loadOptions(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { fieldName, integrationId, forceRefresh } = params;

    // Create a unique key for this request
    const requestKey = `stripe:${fieldName}:${integrationId}:${forceRefresh}`;

    // Check if there's already a pending promise for this exact request
    const pendingPromise = pendingPromises.get(requestKey);
    if (pendingPromise) {
      logger.debug(`[Stripe] Reusing pending request for ${fieldName}`);
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
      const timer = setTimeout(async () => {
        debounceTimers.delete(fieldName);

        try {
          const dataType = FIELD_DATA_TYPE_MAP[fieldName];
          if (!dataType) {
            logger.warn(`[Stripe] Unsupported field: ${fieldName}`);
            pendingPromises.delete(requestKey);
            resolve([]);
            return;
          }

          const result = await this.loadResource(params, dataType);
          pendingPromises.delete(requestKey);
          resolve(result);
        } catch (error) {
          logger.error(`[Stripe] Error loading ${fieldName}:`, error);
          pendingPromises.delete(requestKey);
          resolve([]);
        }
      }, 50); // 50ms debounce

      debounceTimers.set(fieldName, timer);
    });

    pendingPromises.set(requestKey, loadPromise);
    return loadPromise;
  }

  /**
   * Generic resource loader - all Stripe handlers return { value, label } formatted data
   */
  private async loadResource(
    params: LoadOptionsParams,
    dataType: string
  ): Promise<FormattedOption[]> {
    const { integrationId, forceRefresh } = params;
    const cacheKey = buildCacheKey('stripe', dataType, integrationId || '');
    const cache = useConfigCacheStore.getState();

    // Check cache first
    if (!forceRefresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        logger.debug(`[Stripe] Returning cached ${dataType} (${cached.length} items)`);
        return cached;
      }
    }

    if (!integrationId) {
      logger.error(`[Stripe] No integration ID provided for ${dataType}`);
      return [];
    }

    logger.debug(`[Stripe] Loading ${dataType} for integration ${integrationId}`);

    try {
      const response = await fetch('/api/integrations/stripe/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          dataType,
          options: {}
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.error(`[Stripe] API error for ${dataType}:`, errorData);

        if (response.status === 401 || errorData.details?.needsReconnection) {
          throw new Error('Stripe integration needs to be reconnected');
        }

        throw new Error(errorData.error || `Failed to load ${dataType}: ${response.statusText}`);
      }

      const responseData = await response.json();
      const data = responseData.data || [];

      logger.debug(`[Stripe] Loaded ${data.length} ${dataType} items`);

      // Stripe handlers already return { value, label } formatted objects
      const formattedOptions: FormattedOption[] = data.map((item: any) => ({
        value: item.value || item.id,
        label: item.label || item.name || item.id,
        raw: item
      }));

      // Cache the results
      const ttl = getFieldTTL(dataType);
      cache.set(cacheKey, formattedOptions, ttl);

      return formattedOptions;
    } catch (error: any) {
      logger.error(`[Stripe] Error loading ${dataType}:`, error);
      return [];
    }
  }
}
