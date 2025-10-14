/**
 * Microsoft Teams Options Loader
 * Handles loading dynamic options for Teams-related fields
 */

import { ProviderOptionsLoader } from '../types';

import { logger } from '@/lib/utils/logger'

export class TeamsOptionsLoader implements ProviderOptionsLoader {
  private supportedFields = new Set([
    'teamId',
    'channelId',
    'chatId',
  ]);

  canHandle(fieldName: string, providerId?: string): boolean {
    // Handle both 'teams' and 'microsoft-teams' provider IDs
    if (providerId && !providerId.includes('teams')) {
      return false;
    }
    return this.supportedFields.has(fieldName);
  }

  async loadOptions(params: {
    fieldName: string;
    nodeType: string;
    providerId: string;
    integrationId?: string;
    dependsOn?: string;
    dependsOnValue?: any;
    forceRefresh?: boolean;
    extraOptions?: Record<string, any>;
    signal?: AbortSignal;
  }): Promise<{ value: string; label: string }[]> {
    const { fieldName, providerId, integrationId, dependsOn, dependsOnValue, signal } = params;

    if (!integrationId) {
      logger.error('[TeamsOptionsLoader] No integration ID provided');
      return [];
    }
    logger.debug(`[TeamsOptionsLoader] Loading ${fieldName} for provider ${providerId}`, {
      integrationId,
      dependsOn,
      dependsOnValue,
      nodeType: params.nodeType
    });

    // Determine the resource type based on field name
    let resourceType: string;

    switch (fieldName) {
      case 'teamId':
        resourceType = 'teams_teams';
        break;
      case 'channelId':
        // Channels depend on teamId
        if (!dependsOnValue || dependsOnValue === '') {
          logger.debug('[TeamsOptionsLoader] No teamId provided for channels', {
            hasDependencyValue: !!dependsOnValue,
            dependsOnValue
          });
          return [];
        }
        resourceType = 'teams_channels';
        break;
      case 'chatId':
        resourceType = 'teams_chats';
        break;
      default:
        logger.warn(`[TeamsOptionsLoader] Unsupported field: ${fieldName}`);
        return [];
    }

    try {
      // Build the URL with proper parameters
      const url = new URL(`/api/integrations/teams/data`, window.location.origin);
      url.searchParams.set('integrationId', integrationId);
      url.searchParams.set('type', resourceType);

      // Add teamId for channel requests
      if (fieldName === 'channelId' && dependsOnValue) {
        url.searchParams.set('teamId', dependsOnValue);
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.error(`[TeamsOptionsLoader] API error:`, errorData);
        throw new Error(errorData.error || `Failed to load ${fieldName}`);
      }

      const data = await response.json();
      logger.debug(`[TeamsOptionsLoader] Loaded ${data.length} options for ${fieldName}`);

      // Ensure we return the expected format
      if (Array.isArray(data)) {
        return data.map(item => ({
          value: item.value || item.id || '',
          label: item.label || item.name || item.displayName || ''
        }));
      }

      return [];
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.debug(`[TeamsOptionsLoader] Request aborted for ${fieldName}`);
        return [];
      }

      logger.error(`[TeamsOptionsLoader] Error loading ${fieldName}:`, error);
      throw error;
    }
  }

}