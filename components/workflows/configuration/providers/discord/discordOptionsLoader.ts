/**
 * Discord Options Loader
 * Handles loading dynamic options for Discord-specific fields
 */

import { ProviderOptionsLoader, LoadOptionsParams, FormattedOption } from '../types';
import { loadDiscordGuildsOnce } from '@/stores/discordGuildsCacheStore';
import { loadDiscordChannelsOnce } from '@/stores/discordChannelsCacheStore';

// Debounce map to prevent rapid consecutive calls
const debounceTimers = new Map<string, NodeJS.Timeout>();
const pendingPromises = new Map<string, Promise<FormattedOption[]>>();

export class DiscordOptionsLoader implements ProviderOptionsLoader {
  private supportedFields = [
    'guildId',
    'channelId',
    'messageId',
    'messageIds',  // Support plural for multi-select
    'filterAuthor',
    'userId',
    'userIds',     // Support plural for multi-select
    'roleId',
    'parentId',
    'categoryId',
    'parentCategory',
    'roleFilter',
    'allowedUsers',
    'allowedRoles'
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
      console.log(`🔄 [Discord] Reusing pending request for ${fieldName}`);
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
              result = await this.loadChannels(dependsOnValue, forceRefresh);
              break;
            
            case 'messageId':
            case 'messageIds':  // Handle both singular and plural
              result = await this.loadMessages(params);
              break;
            
            case 'filterAuthor':
            case 'userId':
            case 'userIds':     // Handle plural
            case 'allowedUsers':
              result = await this.loadMembers(params);
              break;
            
            case 'roleId':
            case 'roleFilter':
            case 'allowedRoles':
              result = await this.loadRoles(params);
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
          console.error(`❌ [Discord] Error loading ${fieldName}:`, error);
          resolve([]);
        } finally {
          // Clean up the pending promise
          pendingPromises.delete(requestKey);
        }
      }, 100); // 100ms debounce delay
      
      debounceTimers.set(fieldName, timer);
    });
    
    // Store the pending promise
    pendingPromises.set(requestKey, loadPromise);
    
    return loadPromise;
  }

  private async loadGuilds(forceRefresh?: boolean): Promise<FormattedOption[]> {
    try {
      const guilds = await loadDiscordGuildsOnce(forceRefresh || false);
      
      if (!guilds || guilds.length === 0) {
        console.log('🔍 [Discord] No guilds found - bot may not be in any servers');
        return [];
      }
      
      return guilds.map(guild => ({
        value: guild.id,
        label: guild.name,
      }));
    } catch (error: any) {
      console.error('❌ [Discord] Error loading guilds:', error);
      
      // Handle authentication errors
      if (error.message?.includes('authentication') || error.message?.includes('expired')) {
        console.log('🔄 [Discord] Authentication error detected, may need to refresh integration');
        // Could trigger integration refresh here if needed
      }
      
      return [];
    }
  }

  private async loadChannels(guildId: string | undefined, forceRefresh?: boolean): Promise<FormattedOption[]> {
    if (!guildId) {
      console.log('🔍 [Discord] Cannot load channels without guildId');
      return [];
    }

    try {
      // Add a small delay to prevent rapid consecutive calls
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const channels = await loadDiscordChannelsOnce(guildId, forceRefresh || false);
      
      if (!channels || channels.length === 0) {
        console.warn('⚠️ [Discord] No channels found for guild:', guildId);
        return [];
      }
      
      return channels
        .filter(channel => channel && channel.id)
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
      console.error('❌ [Discord] Error loading channels for guild', guildId, ':', error);
      
      if (error.message?.includes('authentication') || error.message?.includes('expired')) {
        console.log('🔄 [Discord] Authentication error detected');
      }
      
      return [];
    }
  }

  private async loadMessages(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { dependsOnValue: channelId, integrationId, signal, nodeType, extraOptions } = params;

    if (!channelId || !integrationId) {
      console.log('🔍 [Discord] Cannot load messages without channelId and integrationId');
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
      console.error('❌ [Discord] Error loading messages:', error);
      return [];
    }
  }

  private async loadMembers(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { dependsOnValue: guildId, integrationId, signal } = params;
    
    if (!guildId || !integrationId) {
      console.log('🔍 [Discord] Cannot load members without guildId and integrationId');
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

      return members.map((member: any) => ({
        value: member.id || member.value,
        label: member.username || member.name || member.label || member.id,
      }));
    } catch (error) {
      console.error('❌ [Discord] Error loading members:', error);
      return [];
    }
  }

  private async loadRoles(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { dependsOnValue: guildId, integrationId, signal } = params;
    
    if (!guildId || !integrationId) {
      console.log('🔍 [Discord] Cannot load roles without guildId and integrationId');
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
      console.error('❌ [Discord] Error loading roles:', error);
      return [];
    }
  }

  private async loadCategories(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { dependsOnValue: guildId, integrationId, signal } = params;
    
    if (!guildId || !integrationId) {
      console.log('🔍 [Discord] Cannot load categories without guildId and integrationId');
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
      console.error('❌ [Discord] Error loading categories:', error);
      return [];
    }
  }

  getFieldDependencies(fieldName: string): string[] {
    switch (fieldName) {
      case 'channelId':
      case 'filterAuthor':
      case 'userId':
      case 'userIds':      // Plural version
      case 'roleId':
      case 'roleFilter':
      case 'parentId':
      case 'categoryId':
      case 'parentCategory':
      case 'allowedUsers':
      case 'allowedRoles':
        return ['guildId'];

      case 'messageId':
      case 'messageIds':   // Plural version
        return ['channelId'];
      
      default:
        return [];
    }
  }
}