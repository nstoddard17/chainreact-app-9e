/**
 * Discord Options Loader
 * Handles loading dynamic options for Discord-specific fields
 */

import { ProviderOptionsLoader, LoadOptionsParams, FormattedOption } from '../types';
import { loadDiscordGuildsOnce } from '@/stores/discordGuildsCacheStore';
import { loadDiscordChannelsOnce } from '@/stores/discordChannelsCacheStore';

export class DiscordOptionsLoader implements ProviderOptionsLoader {
  private supportedFields = [
    'guildId',
    'channelId',
    'messageId',
    'filterAuthor',
    'userId',
    'roleId',
    'parentId',
    'categoryId',
    'parentCategory',
    'roleFilter'
  ];

  canHandle(fieldName: string, providerId: string): boolean {
    return providerId === 'discord' && this.supportedFields.includes(fieldName);
  }

  async loadOptions(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { fieldName, dependsOnValue, forceRefresh, signal } = params;

    switch (fieldName) {
      case 'guildId':
        return this.loadGuilds(forceRefresh);
      
      case 'channelId':
        return this.loadChannels(dependsOnValue, forceRefresh);
      
      case 'messageId':
        return this.loadMessages(params);
      
      case 'filterAuthor':
      case 'userId':
        return this.loadMembers(params);
      
      case 'roleId':
      case 'roleFilter':
        return this.loadRoles(params);
      
      case 'parentId':
      case 'categoryId':
      case 'parentCategory':
        return this.loadCategories(params);
      
      default:
        return [];
    }
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
    const { dependsOnValue: channelId, integrationId, signal } = params;
    
    if (!channelId || !integrationId) {
      console.log('🔍 [Discord] Cannot load messages without channelId and integrationId');
      return [];
    }

    try {
      const response = await fetch('/api/integrations/discord/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          dataType: 'discord_messages',
          options: { channelId }
        }),
        signal
      });

      if (!response.ok) {
        throw new Error(`Failed to load messages: ${response.status}`);
      }

      const result = await response.json();
      const messages = result.data || [];

      return messages.map((msg: any) => {
        const baseLabel = msg.content || 
          `Message by ${msg.author?.username || 'Unknown'} (${msg.timestamp ? new Date(msg.timestamp).toLocaleString() : 'Unknown time'})`;
        
        const reactions = msg.reactions || [];
        const reactionCount = reactions.reduce((total: number, r: any) => total + r.count, 0);
        const label = reactions.length > 0 ? `${baseLabel} [${reactionCount} reactions]` : baseLabel;
        
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
      case 'roleId':
      case 'roleFilter':
      case 'parentId':
      case 'categoryId':
      case 'parentCategory':
        return ['guildId'];
      
      case 'messageId':
        return ['channelId'];
      
      default:
        return [];
    }
  }
}