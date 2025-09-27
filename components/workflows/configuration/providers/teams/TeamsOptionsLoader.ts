/**
 * Microsoft Teams Options Loader
 * Handles loading dynamic options for Teams-related fields
 */

import { ProviderOptionsLoader } from '../types';

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

  async load(
    fieldName: string,
    providerId: string,
    integrationId: string,
    params?: {
      nodeType?: string;
      dependencyFieldName?: string;
      dependencyValue?: any;
      signal?: AbortSignal;
    }
  ): Promise<{ value: string; label: string }[]> {
    console.log(`[TeamsOptionsLoader] Loading ${fieldName} for provider ${providerId}`, {
      integrationId,
      dependencyFieldName: params?.dependencyFieldName,
      dependencyValue: params?.dependencyValue,
      nodeType: params?.nodeType
    });

    // Determine the resource type based on field name
    let resourceType: string;

    switch (fieldName) {
      case 'teamId':
        resourceType = 'teams_teams';
        break;
      case 'channelId':
        // Channels depend on teamId
        if (!params?.dependencyValue) {
          console.log('[TeamsOptionsLoader] No teamId provided for channels');
          return [];
        }
        resourceType = 'teams_channels';
        break;
      case 'chatId':
        resourceType = 'teams_chats';
        break;
      default:
        console.warn(`[TeamsOptionsLoader] Unsupported field: ${fieldName}`);
        return [];
    }

    try {
      // Build the URL with proper parameters
      const url = new URL(`/api/integrations/teams/data`, window.location.origin);
      url.searchParams.set('integrationId', integrationId);
      url.searchParams.set('type', resourceType);

      // Add teamId for channel requests
      if (fieldName === 'channelId' && params?.dependencyValue) {
        url.searchParams.set('teamId', params.dependencyValue);
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: params?.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`[TeamsOptionsLoader] API error:`, errorData);
        throw new Error(errorData.error || `Failed to load ${fieldName}`);
      }

      const data = await response.json();
      console.log(`[TeamsOptionsLoader] Loaded ${data.length} options for ${fieldName}`);

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
        console.log(`[TeamsOptionsLoader] Request aborted for ${fieldName}`);
        return [];
      }

      console.error(`[TeamsOptionsLoader] Error loading ${fieldName}:`, error);
      throw error;
    }
  }

  getCacheKey(
    fieldName: string,
    providerId: string,
    integrationId: string,
    params?: {
      nodeType?: string;
      dependencyFieldName?: string;
      dependencyValue?: any;
    }
  ): string {
    const parts = [providerId, integrationId, fieldName];

    if (params?.nodeType) {
      parts.push(params.nodeType);
    }

    // Include dependency value in cache key for dependent fields
    if (fieldName === 'channelId' && params?.dependencyValue) {
      parts.push(`team-${params.dependencyValue}`);
    }

    return parts.join(':');
  }
}