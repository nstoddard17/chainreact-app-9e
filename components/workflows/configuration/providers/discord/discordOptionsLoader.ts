/**
 * Discord Options Loader
 * Handles loading dynamic options for Discord-specific fields
 */

import { ProviderOptionsLoader, LoadOptionsParams, FormattedOption } from '../types';
import { logger } from '@/lib/utils/logger';
import { useConfigCacheStore } from '@/stores/configCacheStore';
import { buildCacheKey, getFieldTTL } from '@/lib/workflows/configuration/cache-utils';

// Debounce map to prevent rapid consecutive calls
const debounceTimers = new Map<string, NodeJS.Timeout>();
const pendingPromises = new Map<string, Promise<FormattedOption[]>>();

export class DiscordOptionsLoader implements ProviderOptionsLoader {
  private supportedFields = [
    'guildId',
    'channelId',
    'channelFilter', // For filtering by channel
    'messageId',
    'messageIds', // Support plural for multi-select
    'filterAuthor',
    'userId',
    'userIds', // Support plural for multi-select
    'roleId',
    'parentId',
    'categoryId',
    'parentCategory',
    'roleFilter',
    'allowedUsers',
    'allowedRoles',
    'command'
  ];

  canHandle(fieldName: string, providerId: string): boolean {
    return providerId === 'discord' && this.supportedFields.includes(fieldName);
  }

  async loadOptions(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { fieldName, dependsOnValue, forceRefresh, signal } = params;
    
    // Create a unique key for this request
    const requestKey = `${fieldName}:${dependsOnValue || 'none'}:${forceRefresh}`;
    
    // Check if there's already a pending promise for this exact request
    const pendingPromise = pendingPromises.get(requestKey);
    if (pendingPromise) {
      logger.debug(`🔄 [Discord] Reusing pending request for ${fieldName}`);
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
            case 'guildId':
              result = await this.loadGuilds(forceRefresh);
              break;

            case 'channelId':
            case 'channelFilter': // Handle channel filter field
              result = await this.loadChannels(params);
              break;
            
            case 'messageId':
            case 'messageIds': // Handle both singular and plural
              result = await this.loadMessages(params);
              break;
            
            case 'filterAuthor':
            case 'userId':
            case 'userIds': // Handle plural
            case 'allowedUsers':
              result = await this.loadMembers(params);
              break;
            
            case 'roleId':
            case 'roleFilter':
            case 'allowedRoles':
              result = await this.loadRoles(params);
              break;

          case 'command':
            result = await this.loadCommands(params)
            break;
            
            case 'parentId':
            case 'categoryId':
            case 'parentCategory':
              result = await this.loadCategories(params);
              break;
            
            default:
              result = [];
          }
          
          resolve(result);
        } catch (error) {
          logger.error(`❌ [Discord] Error loading ${fieldName}:`, error);
          resolve([]);
        } finally {
          // Clean up the pending promise
          pendingPromises.delete(requestKey);
        }
      }, 10); // 10ms debounce delay - reduced for better responsiveness with proper deduplication
      
      debounceTimers.set(fieldName, timer);
    });
    
    // Store the pending promise
    pendingPromises.set(requestKey, loadPromise);
    
    return loadPromise;
  }

  private async loadCommands(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { dependsOnValue: guildId, integrationId, signal, forceRefresh } = params
    if (!guildId) {
      logger.debug('🔍 [Discord] Cannot load commands without guildId')
      return []
    }

    // Build cache key
    const cacheKey = buildCacheKey('discord', integrationId, 'command', { guildId });
    const cacheStore = useConfigCacheStore.getState();

    // Force refresh handling
    if (forceRefresh) {
      logger.debug(`🔄 [Discord] Force refresh - invalidating cache:`, cacheKey);
      cacheStore.invalidate(cacheKey);
    }

    // Try cache first
    if (!forceRefresh) {
      const cached = cacheStore.get(cacheKey);
      if (cached) {
        logger.debug(`💾 [Discord] Cache HIT for command:`, { cacheKey, count: cached.length });
        return cached;
      }
      logger.debug(`❌ [Discord] Cache MISS for command:`, { cacheKey });
    }

    try {
      const response = await fetch('/api/integrations/discord/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          dataType: 'discord_commands',
          options: { guildId }
        }),
        signal
      })
      if (!response.ok) {
        throw new Error(`Failed to load commands: ${response.status}`)
      }
      const result = await response.json()
      const commands = result.data || []

      const formattedCommands = commands.map((cmd: any) => ({
        value: cmd.name,
        label: `/${cmd.name}`,
        id: cmd.id
      }))

      // Store in cache
      const ttl = getFieldTTL('command');
      cacheStore.set(cacheKey, formattedCommands, ttl);
      logger.debug(`💾 [Discord] Cached ${formattedCommands.length} options for command (TTL: ${ttl / 1000}s)`);

      return formattedCommands
    } catch (error) {
      logger.error('❌ [Discord] Error loading commands:', error)
      return []
    }
  }

  // Track active guild loading promise to prevent duplicates
  private static guildLoadingPromise: Promise<FormattedOption[]> | null = null;

  // Track active channel loading promises per guildId to prevent duplicates
  private static channelLoadingPromises: Map<string, Promise<FormattedOption[]>> = new Map();

  private async loadGuilds(forceRefresh?: boolean): Promise<FormattedOption[]> {
    // Build cache key (no integrationId needed for guilds)
    const cacheKey = buildCacheKey('discord', 'global', 'guildId');
    const cacheStore = useConfigCacheStore.getState();

    // Force refresh handling
    if (forceRefresh) {
      logger.debug(`🔄 [Discord] Force refresh - invalidating cache:`, cacheKey);
      cacheStore.invalidate(cacheKey);
    } else {
      // Try cache first
      const cached = cacheStore.get(cacheKey);
      if (cached) {
        logger.debug(`💾 [Discord] Cache HIT for guildId:`, { cacheKey, count: cached.length });
        return cached;
      }
      logger.debug(`❌ [Discord] Cache MISS for guildId:`, { cacheKey });
    }

    // If there's already a guild loading in progress and we're not forcing refresh, return it
    if (!forceRefresh && DiscordOptionsLoader.guildLoadingPromise) {
      logger.debug('🔄 [Discord] Reusing existing guild loading promise');
      return DiscordOptionsLoader.guildLoadingPromise;
    }

    // Create the loading promise
    DiscordOptionsLoader.guildLoadingPromise = (async () => {
      try {
        const response = await fetch('/api/integrations/discord/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataType: 'discord_guilds',
            options: {
              requireBotAccess: true
            }
          })
        });

        if (!response.ok) {
          throw new Error(`Failed to load guilds: ${response.statusText}`);
        }

        const result = await response.json();
        const guilds = result.data || [];

        if (!guilds || guilds.length === 0) {
          logger.debug('🔍 [Discord] No guilds found - bot may not be in any servers');
          return [];
        }

        const formattedGuilds = guilds.map((guild: any) => ({
          value: guild.id,
          label: guild.name,
        }));

        // Store in cache
        const ttl = getFieldTTL('guildId');
        cacheStore.set(cacheKey, formattedGuilds, ttl);
        logger.debug(`💾 [Discord] Cached ${formattedGuilds.length} options for guildId (TTL: ${ttl / 1000}s)`);

        return formattedGuilds;
      } catch (error: any) {
        logger.error('❌ [Discord] Error loading guilds:', error);

        // Handle authentication errors
        if (error.message?.includes('authentication') || error.message?.includes('expired')) {
          logger.debug('🔄 [Discord] Authentication error detected, may need to refresh integration');
          // Could trigger integration refresh here if needed
        }

        return [];
      } finally {
        // Clear the promise after a short delay to allow cache to be used
        setTimeout(() => {
          DiscordOptionsLoader.guildLoadingPromise = null;
        }, 1000);
      }
    })();

    return DiscordOptionsLoader.guildLoadingPromise;
  }

  private async loadChannels(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { dependsOnValue: guildId, integrationId, forceRefresh, signal } = params;

    if (!guildId || !integrationId) {
      logger.debug('🔍 [Discord] Cannot load channels without guildId and integrationId');
      return [];
    }

    // If there's already a channel loading in progress for this guild and we're not forcing refresh, return it
    const existingPromise = DiscordOptionsLoader.channelLoadingPromises.get(guildId);
    if (!forceRefresh && existingPromise) {
      logger.debug('🔄 [Discord] Reusing existing channel loading promise for guild:', guildId);
      return existingPromise;
    }

    // Create the loading promise
    const loadPromise = (async () => {
      try {
        const response = await fetch('/api/integrations/discord/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            integrationId,
            dataType: 'discord_channels',
            options: { guildId }
          }),
          signal
        });

        if (!response.ok) {
          throw new Error(`Failed to load channels: ${response.statusText}`);
        }

        const result = await response.json();
        const channels = result.data || [];

        if (!channels || channels.length === 0) {
          logger.warn('⚠️ [Discord] No channels found for guild:', guildId);
          return [];
        }

        return channels
          .filter((channel: any) => channel && channel.id)
          .sort((a, b) => {
            // Sort by position first, then alphabetically
            if (a.position !== undefined && b.position !== undefined) {
              return a.position - b.position;
            }
            const aName = a.name || a.id;
            const bName = b.name || b.id;
            return aName.localeCompare(bName);
          })
          .map(channel => ({
            value: channel.id,
            label: channel.name,
            type: channel.type,
            position: channel.position,
          }));
      } catch (error: any) {
        logger.error('❌ [Discord] Error loading channels for guild', guildId, ':', error);

        if (error.message?.includes('authentication') || error.message?.includes('expired')) {
          logger.debug('🔄 [Discord] Authentication error detected');
        }

        return [];
      } finally {
        // Clear the promise after a short delay to allow cache to be used
        setTimeout(() => {
          DiscordOptionsLoader.channelLoadingPromises.delete(guildId);
        }, 2000); // 2 second cache for channels
      }
    })();

    // Store the pending promise
    DiscordOptionsLoader.channelLoadingPromises.set(guildId, loadPromise);

    return loadPromise;
  }

  private async loadMessages(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { dependsOnValue: channelId, integrationId, signal, nodeType, extraOptions } = params;

    if (!channelId || !integrationId) {
      logger.debug('🔍 [Discord] Cannot load messages without channelId and integrationId');
      return [];
    }

    // Get the action type from node type or extra options
    const actionType = nodeType || extraOptions?.actionType;

    try {
      const response = await fetch('/api/integrations/discord/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          dataType: 'discord_messages',
          options: { channelId, actionType }
        }),
        signal
      });

      if (!response.ok) {
        throw new Error(`Failed to load messages: ${response.status}`);
      }

      const result = await response.json();
      const messages = result.data || [];

      return messages.map((msg: any) => {
        // Use the formatted name from the backend which includes author, date, and preview
        let label = msg.name || msg.label;
        
        // If no formatted name from backend, fall back to creating one
        if (!label) {
          label = msg.content || 
            `Message by ${msg.author?.username || 'Unknown'} (${msg.timestamp ? new Date(msg.timestamp).toLocaleString() : 'Unknown time'})`;
        }
        
        // Add reaction count if there are reactions
        const reactions = msg.reactions || [];
        if (reactions.length > 0) {
          const reactionCount = reactions.reduce((total: number, r: any) => total + r.count, 0);
          label = `${label} [${reactionCount} reactions]`;
        }
        
        return {
          id: msg.id,
          value: msg.id,
          label,
          content: msg.content,
          author: msg.author,
          timestamp: msg.timestamp,
          type: msg.type,
          reactions
        };
      });
    } catch (error) {
      logger.error('❌ [Discord] Error loading messages:', error);
      return [];
    }
  }

  private async loadMembers(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { dependsOnValue: guildId, integrationId, signal } = params;
    
    if (!guildId || !integrationId) {
      logger.debug('🔍 [Discord] Cannot load members without guildId and integrationId');
      return [];
    }

    try {
      const response = await fetch('/api/integrations/discord/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          dataType: 'discord_members',
          options: { guildId }
        }),
        signal
      });

      if (!response.ok) {
        throw new Error(`Failed to load members: ${response.status}`);
      }

      const result = await response.json();
      const members = result.data || [];

      const options = members.map((member: any) => ({
        value: member.id || member.value,
        label: member.username || member.name || member.label || member.id,
      }));

      // For assign role action, include a friendly shortcut for the trigger member
      if (params.nodeType === 'discord_action_assign_role') {
        const triggerMemberOption: FormattedOption = {
          value: '{{User Joined Server.Member ID}}',
          label: 'User Joined Server (Trigger Member)',
        };

        const hasExisting = options.some((option) => option.value === triggerMemberOption.value);
        return hasExisting ? options : [triggerMemberOption, ...options];
      }

      return options;
    } catch (error) {
      logger.error('❌ [Discord] Error loading members:', error);
      return [];
    }
  }

  private async loadRoles(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { dependsOnValue: guildId, integrationId, signal } = params;
    
    if (!guildId || !integrationId) {
      logger.debug('🔍 [Discord] Cannot load roles without guildId and integrationId');
      return [];
    }

    try {
      const response = await fetch('/api/integrations/discord/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          dataType: 'discord_roles',
          options: { guildId }
        }),
        signal
      });

      if (!response.ok) {
        throw new Error(`Failed to load roles: ${response.status}`);
      }

      const result = await response.json();
      const roles = result.data || [];

      return roles.map((role: any) => ({
        value: role.id,
        label: role.name || role.id,
        color: role.color,
        position: role.position
      }));
    } catch (error) {
      logger.error('❌ [Discord] Error loading roles:', error);
      return [];
    }
  }

  private async loadCategories(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { dependsOnValue: guildId, integrationId, signal } = params;
    
    if (!guildId || !integrationId) {
      logger.debug('🔍 [Discord] Cannot load categories without guildId and integrationId');
      return [];
    }

    try {
      const response = await fetch('/api/integrations/discord/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          dataType: 'discord_categories',
          options: { guildId }
        }),
        signal
      });

      if (!response.ok) {
        throw new Error(`Failed to load categories: ${response.status}`);
      }

      const result = await response.json();
      const categories = result.data || [];

      return categories.map((category: any) => ({
        value: category.id,
        label: category.name || category.id,
        position: category.position
      }));
    } catch (error) {
      logger.error('❌ [Discord] Error loading categories:', error);
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

    const cacheStore = useConfigCacheStore.getState();
    cacheStore.invalidateProvider('discord');

    logger.debug('🧹 [Discord] Cache cleared');
  }

  getFieldDependencies(fieldName: string): string[] {
    switch (fieldName) {
      case 'channelId':
      case 'channelFilter': // Channel filter depends on guild
      case 'filterAuthor':
      case 'userId':
      case 'userIds': // Plural version
      case 'roleId':
      case 'roleFilter':
      case 'parentId':
      case 'categoryId':
      case 'parentCategory':
      case 'allowedUsers':
      case 'allowedRoles':
        return ['guildId'];

      case 'messageId':
      case 'messageIds': // Plural version
        return ['channelId'];

      default:
        return [];
    }
  }
}
