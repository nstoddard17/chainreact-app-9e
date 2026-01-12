/**
 * Slack Options Loader
 * Handles loading dynamic options for Slack-specific fields
 */

import { ProviderOptionsLoader, LoadOptionsParams, FormattedOption } from '../types';
import { logger } from '@/lib/utils/logger';
import { useConfigCacheStore } from '@/stores/configCacheStore';
import { buildCacheKey, getFieldTTL } from '@/lib/workflows/configuration/cache-utils';
import { parseErrorAndHandleReconnection } from '@/lib/utils/integration-reconnection';

// Debounce map to prevent rapid consecutive calls
const debounceTimers = new Map<string, NodeJS.Timeout>();
const pendingPromises = new Map<string, Promise<FormattedOption[]>>();

export class SlackOptionsLoader implements ProviderOptionsLoader {
  private supportedFields = [
    'channel',
    'channels', // Plural form used in some actions like upload_file
    'user',
    'addPeople',
    'workspace'
  ];

  canHandle(fieldName: string, providerId: string): boolean {
    return providerId === 'slack' && this.supportedFields.includes(fieldName);
  }

  async loadOptions(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { fieldName, integrationId, forceRefresh } = params;

    // Create a unique key for this request
    const requestKey = `${fieldName}:${integrationId}:${forceRefresh}`;

    // Check if there's already a pending promise for this exact request
    const pendingPromise = pendingPromises.get(requestKey);
    if (pendingPromise) {
      logger.debug(`🔄 [Slack] Reusing pending request for ${fieldName}`);
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
            case 'channel':
            case 'channels': // Plural form used in some actions like upload_file
              result = await this.loadChannels(params);
              break;

            case 'user':
            case 'addPeople':
              result = await this.loadUsers(params);
              break;

            case 'workspace':
              result = await this.loadWorkspaces(params);
              break;

            default:
              logger.warn(`⚠️ [Slack] Unsupported field: ${fieldName}`);
          }

          pendingPromises.delete(requestKey);
          resolve(result);
        } catch (error) {
          logger.error(`❌ [Slack] Error loading ${fieldName}:`, error);
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

  private async loadChannels(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { integrationId, forceRefresh } = params;
    const cacheKey = buildCacheKey('slack', 'slack_channels', integrationId || '');
    const cache = useConfigCacheStore.getState();

    // Check cache first
    if (!forceRefresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        logger.debug('✅ [Slack] Using cached channels');
        return cached;
      }
    }

    try {
      logger.debug('📡 [Slack] Fetching channels from API');

      const response = await fetch('/api/integrations/slack/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          dataType: 'slack_channels'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage = await parseErrorAndHandleReconnection(
          errorText,
          'slack',
          `API error: ${response.status}`
        );
        throw new Error(errorMessage);
      }

      const { data } = await response.json();
      const options: FormattedOption[] = (data || []).map((channel: any) => ({
        value: channel.id || channel.value,
        label: channel.name || channel.label,
        id: channel.id,
        name: channel.name
      }));

      // Cache the results
      cache.set(cacheKey, options, getFieldTTL('slack_channels'));

      logger.debug(`✅ [Slack] Loaded ${options.length} channels`);
      return options;

    } catch (error: any) {
      logger.error('❌ [Slack] Failed to load channels:', error);
      return [];
    }
  }

  private async loadUsers(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { integrationId, forceRefresh } = params;
    const cacheKey = buildCacheKey('slack', 'slack_users', integrationId || '');
    const cache = useConfigCacheStore.getState();

    // Check cache first
    if (!forceRefresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        logger.debug('✅ [Slack] Using cached users');
        return cached;
      }
    }

    try {
      logger.debug('📡 [Slack] Fetching users from API');

      const response = await fetch('/api/integrations/slack/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          dataType: 'slack_users'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage = await parseErrorAndHandleReconnection(
          errorText,
          'slack',
          `API error: ${response.status}`
        );
        throw new Error(errorMessage);
      }

      const { data } = await response.json();
      const options: FormattedOption[] = (data || []).map((user: any) => ({
        value: user.id || user.value,
        label: user.name || user.real_name || user.label,
        id: user.id,
        name: user.name || user.real_name,
        email: user.email
      }));

      // Cache the results
      cache.set(cacheKey, options, getFieldTTL('slack_users'));

      logger.debug(`✅ [Slack] Loaded ${options.length} users`);
      return options;

    } catch (error: any) {
      logger.error('❌ [Slack] Failed to load users:', error);
      return [];
    }
  }

  private async loadWorkspaces(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { integrationId, forceRefresh } = params;
    const cacheKey = buildCacheKey('slack', 'slack_workspaces', integrationId || '');
    const cache = useConfigCacheStore.getState();

    // Check cache first
    if (!forceRefresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        logger.debug('✅ [Slack] Using cached workspaces');
        return cached;
      }
    }

    try {
      logger.debug('📡 [Slack] Fetching workspaces from API');

      const response = await fetch('/api/integrations/slack/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          dataType: 'slack_workspaces'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage = await parseErrorAndHandleReconnection(
          errorText,
          'slack',
          `API error: ${response.status}`
        );
        throw new Error(errorMessage);
      }

      const { data } = await response.json();
      const options: FormattedOption[] = (data || []).map((workspace: any) => ({
        value: workspace.id || workspace.value,
        label: workspace.name || workspace.label,
        id: workspace.id,
        name: workspace.name
      }));

      // Cache the results
      cache.set(cacheKey, options, getFieldTTL('slack_workspaces'));

      logger.debug(`✅ [Slack] Loaded ${options.length} workspaces`);
      return options;

    } catch (error: any) {
      logger.error('❌ [Slack] Failed to load workspaces:', error);
      return [];
    }
  }
}
