/**
 * Google Analytics Options Loader
 * Handles dynamic option loading for Google Analytics 4 fields
 */

import { ProviderOptionsLoader, LoadOptionsParams, SelectOption } from '../types';
import { logger } from '@/lib/utils/logger'

export class GoogleAnalyticsOptionsLoader implements ProviderOptionsLoader {
  /**
   * Check if this loader can handle the field
   */
  canHandle(fieldName: string, providerId: string): boolean {
    if (providerId !== 'google-analytics') {
      return false;
    }

    // Fields this loader handles
    const handledFields = [
      'accountId',
      'propertyId',
      'measurementId',
      'conversionEvent'
    ];

    return handledFields.includes(fieldName);
  }

  /**
   * Load options for the field
   */
  async loadOptions(params: LoadOptionsParams): Promise<SelectOption[]> {
    const { fieldName, integrationId, dependsOnValue } = params;

    logger.debug('📊 [GoogleAnalytics] Loading options:', {
      fieldName,
      integrationId,
      dependsOnValue
    });

    if (!integrationId) {
      logger.warn('📊 [GoogleAnalytics] No integration ID provided');
      return [];
    }

    try {
      // Determine data type based on field
      let dataType = '';
      const requestBody: any = {
        integrationId,
      };

      switch (fieldName) {
        case 'accountId':
          dataType = 'google-analytics_accounts';
          break;

        case 'propertyId':
          dataType = 'google-analytics_properties';
          // If accountId is provided, filter properties by account
          if (dependsOnValue) {
            requestBody.options = { accountId: dependsOnValue };
          }
          break;

        case 'measurementId':
          dataType = 'google-analytics_measurement_ids';
          if (dependsOnValue) {
            requestBody.options = { propertyId: dependsOnValue };
          }
          break;

        case 'conversionEvent':
          dataType = 'google-analytics_conversion_events';
          if (dependsOnValue) {
            requestBody.options = { propertyId: dependsOnValue };
          }
          break;

        default:
          logger.warn(`📊 [GoogleAnalytics] Unknown field: ${fieldName}`);
          return [];
      }

      requestBody.dataType = dataType;

      const response = await fetch('/api/integrations/google-analytics/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        logger.error('📊 [GoogleAnalytics] Failed to load options:', errorData);

        if (errorData.needsReconnection) {
          throw new Error('Google Analytics integration needs reconnection. Please reconnect your account.');
        }

        throw new Error(errorData.error || 'Failed to load Google Analytics data');
      }

      const result = await response.json();
      const items = result.data || [];

      // Format based on field type
      if (fieldName === 'accountId') {
        // Account selection
        return items.map((account: any) => ({
          value: account.id,
          label: account.displayName || account.name,
          metadata: {
            name: account.name
          }
        }));
      } else if (fieldName === 'propertyId') {
        // Property selection
        return items.map((property: any) => ({
          value: property.id,
          label: property.displayName || property.name,
          metadata: {
            name: property.name,
            timeZone: property.timeZone,
            industryCategory: property.industryCategory
          }
        }));
      } else if (fieldName === 'measurementId') {
        // Measurement ID selection
        return items.map((measurement: any) => ({
          value: measurement.measurementId,
          label: `${measurement.measurementId} (${measurement.name})`,
          metadata: {
            id: measurement.id,
            propertyId: measurement.propertyId
          }
        }));
      } else if (fieldName === 'conversionEvent') {
        // Conversion event selection
        return items.map((event: any) => ({
          value: event.eventName,
          label: event.eventName,
          description: event.name,
          metadata: {
            id: event.id,
            counting_method: event.counting_method,
            defaultValue: event.defaultValue
          }
        }));
      }

      return items;

    } catch (error: any) {
      logger.error('📊 [GoogleAnalytics] Error loading options:', error);
      throw error;
    }
  }

  /**
   * Format value for display
   */
  formatValue(value: any, fieldName: string): string {
    if (!value) return '';

    if (typeof value === 'object' && value.label) {
      return value.label;
    }

    return String(value);
  }

  /**
   * Validate field value
   */
  validateValue(value: any, fieldName: string): boolean {
    if (!value) return false;

    // All GA4 fields should be non-empty strings
    if (Array.isArray(value)) {
      return value.length > 0 && value.every(v => v && typeof v === 'string');
    }
    return typeof value === 'string' && value.length > 0;
  }

  /**
   * Get dependencies for a field
   */
  getDependencies(fieldName: string): string[] {
    // Property fields depend on account selection
    if (fieldName === 'propertyId') {
      return ['accountId'];
    }

    // Measurement ID and conversion events depend on property
    if (fieldName === 'measurementId' || fieldName === 'conversionEvent') {
      return ['propertyId'];
    }

    return [];
  }

  /**
   * Check if field should load on mount
   */
  shouldLoadOnMount(fieldName: string): boolean {
    // Only account field should load immediately
    return fieldName === 'accountId';
  }
}
