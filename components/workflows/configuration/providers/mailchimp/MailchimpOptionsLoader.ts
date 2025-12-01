/**
 * Mailchimp Options Loader
 * Handles loading dynamic options for Mailchimp-specific fields
 */

import { ProviderOptionsLoader, LoadOptionsParams, FormattedOption } from '../types';
import { logger } from '@/lib/utils/logger';

// Debounce map to prevent rapid consecutive calls
const debounceTimers = new Map<string, NodeJS.Timeout>();
const pendingPromises = new Map<string, Promise<FormattedOption[]>>();

export class MailchimpOptionsLoader implements ProviderOptionsLoader {
  private supportedFields = [
    'audience_id',
    'audienceId',
    'campaign_id',
    'campaignId',
    'tag_id',
    'tagId',
    'tags',
    'segment_id',
    'segmentId',
    'segments',
    'subscriber_email',
    'subscriberEmail'
  ];

  // Map field names to Mailchimp API data types
  private fieldToDataType: Record<string, string> = {
    audience_id: 'mailchimp_audiences',
    audienceId: 'mailchimp_audiences',
    campaign_id: 'mailchimp_campaigns',
    campaignId: 'mailchimp_campaigns',
    tag_id: 'mailchimp_tags',
    tagId: 'mailchimp_tags',
    tags: 'mailchimp_tags',
    segment_id: 'mailchimp_segments',
    segmentId: 'mailchimp_segments',
    segments: 'mailchimp_segments',
    subscriber_email: 'mailchimp_subscribers',
    subscriberEmail: 'mailchimp_subscribers'
  };

  canHandle(fieldName: string, providerId: string): boolean {
    return providerId === 'mailchimp' && this.supportedFields.includes(fieldName);
  }

  async loadOptions(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { fieldName, dependsOnValue, integrationId, forceRefresh, signal } = params;

    // Create a unique key for this request
    const requestKey = `${fieldName}:${dependsOnValue || 'none'}:${forceRefresh}`;

    // Check if there's already a pending promise for this exact request
    const pendingPromise = pendingPromises.get(requestKey);
    if (pendingPromise) {
      logger.debug(`🔄 [Mailchimp] Reusing pending request for ${fieldName}`);
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
            logger.warn(`❌ [Mailchimp] Unknown field: ${fieldName}`);
            resolve([]);
            return;
          }

          // Build options object for API request
          const options: Record<string, any> = {};

          // Add audience parameter for dependent fields (tags, segments, subscribers)
          if ((fieldName === 'tag_id' || fieldName === 'tagId' || fieldName === 'tags' ||
               fieldName === 'segment_id' || fieldName === 'segmentId' || fieldName === 'segments') && dependsOnValue) {
            options.audienceId = dependsOnValue;
          }

          // Subscribers need audience_id (not audienceId) for backend compatibility
          if ((fieldName === 'subscriber_email' || fieldName === 'subscriberEmail') && dependsOnValue) {
            options.audience_id = dependsOnValue;
          }

          logger.debug(`📡 [Mailchimp] Loading ${dataType}:`, { integrationId, options });

          // Make API request
          const response = await fetch('/api/integrations/mailchimp/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              integrationId,
              dataType,
              options
            }),
            signal
          });

          if (!response.ok) {
            throw new Error(`Failed to load ${fieldName}: ${response.statusText}`);
          }

          const responseData = await response.json();
          const rawData = responseData.data || [];

          // Subscribers handler already returns formatted data with value/label
          if (dataType === 'mailchimp_subscribers') {
            result = rawData; // Already formatted
          } else {
            // Transform data to FormattedOption format {value, label}
            result = rawData.map((item: any) => {
              // Determine label and value based on data type
              let label = item.id;
              let value = item.id;

              if (dataType === 'mailchimp_campaigns') {
                // Campaigns have nested settings with title or subject_line
                label = item.settings?.title || item.settings?.subject_line || item.id;
              } else if (dataType === 'mailchimp_tags') {
                // Tags use name as label, but value could be id (number) or name (string)
                // For tags, we use name as the value for easier matching
                label = item.name || String(item.id);
                value = item.name || String(item.id);
              } else {
                // Audiences, segments use 'name' field
                label = item.name || item.title || item.id;
              }

              return {
                value: String(value), // Ensure value is always a string
                label,
                ...item // Include original data for reference
              };
            });
          }

          logger.debug(`✅ [Mailchimp] Loaded ${result.length} ${dataType}`);

          // Clean up pending promise
          pendingPromises.delete(requestKey);

          resolve(result);
        } catch (error: any) {
          logger.error(`❌ [Mailchimp] Error loading ${fieldName}:`, error);

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
      case 'tag_id':
      case 'tagId':
      case 'tags':
      case 'segment_id':
      case 'segmentId':
      case 'segments':
      case 'subscriber_email':
      case 'subscriberEmail':
        return ['audience_id', 'audienceId'];
      default:
        return [];
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    pendingPromises.clear();
    debounceTimers.forEach(timer => clearTimeout(timer));
    debounceTimers.clear();
    logger.debug('🧹 [Mailchimp] Cache cleared');
  }
}
