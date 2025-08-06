"use client"

import { useState, useCallback, useRef, useEffect } from 'react';
import { useIntegrationStore } from "@/stores/integrationStore";
import { loadDiscordGuildsOnce } from '@/stores/discordGuildsCacheStore'
import { loadDiscordChannelsOnce } from '@/stores/discordChannelsCacheStore'
import { DynamicOptionsState } from '../utils/types';

interface UseDynamicOptionsProps {
  nodeType?: string;
  providerId?: string;
}

interface DynamicOption {
  value: string
  label: string
  fields?: any[]
  isExisting?: boolean
}

/**
 * Custom hook for managing dynamic field options
 */
export const useDynamicOptions = ({ nodeType, providerId }: UseDynamicOptionsProps) => {
  // State
  const [dynamicOptions, setDynamicOptions] = useState<DynamicOptionsState>({});
  const [loading, setLoading] = useState<boolean>(false);
  
  // Integration store methods
  const { getIntegrationByProvider, loadIntegrationData } = useIntegrationStore();
  
  // Refs for tracking loading state and request cache
  const activeLoadingTasks = useRef<Set<string>>(new Set());
  const requestCache = useRef<Map<string, Promise<any>>>(new Map());
  const fetchingDependentData = useRef<Set<string>>(new Set());
  const discordLoadAttemptTimestamp = useRef<number>(0);
  
  // Cache key generator
  const generateCacheKey = useCallback((fieldName: string, dependentValues?: Record<string, any>) => {
    const dependentStr = dependentValues ? JSON.stringify(dependentValues) : '';
    return `${nodeType}-${fieldName}-${dependentStr}`;
  }, [nodeType]);

  // Reset options for a field
  const resetOptions = useCallback((fieldName: string) => {
    setDynamicOptions(prev => ({
      ...prev,
      [fieldName]: []
    }));
  }, []);
  
  // Load options for a dynamic field
  const loadOptions = useCallback(async (fieldName: string, dependsOn?: string, dependsOnValue?: any) => {
    if (!nodeType || !providerId) return;

    console.log(`🔍 loadOptions called for ${fieldName} in ${nodeType}/${providerId}`, { dependsOn, dependsOnValue });

    // If it's Discord guilds, check if we've attempted a load recently (rate limit protection)
    if (fieldName === 'guildId' && providerId === 'discord') {
      const now = Date.now();
      // If we've tried loading Discord guilds in the last 5 seconds, don't try again
      if (now - discordLoadAttemptTimestamp.current < 5000) {
        console.log('⏱️ Skipping Discord guilds load - rate limit protection (5s cooldown)');
        return;
      }
      discordLoadAttemptTimestamp.current = now;
    }

    // Prevent concurrent requests for the same field
    const cacheKey = generateCacheKey(fieldName, { [dependsOn || '']: dependsOnValue });
    if (activeLoadingTasks.current.has(cacheKey)) {
      console.log(`🔄 Already loading options for ${fieldName}, skipping duplicate request`);
      return;
    }
    
    activeLoadingTasks.current.add(cacheKey);
    setLoading(true);

    try {
      // Special handling for Discord guilds
      if (fieldName === 'guildId' && providerId === 'discord') {
        console.log('🔍 Special handling for Discord guilds activated');
        try {
          // If we already have options, show them while we're loading new ones
          const existingOptions = dynamicOptions[fieldName];
          if (existingOptions && existingOptions.length > 0) {
            console.log('🔍 Using existing Discord guild options while refreshing');
            // We're keeping the existing options, just refreshing in background
          }
          
          console.log('🔍 Calling loadDiscordGuildsOnce with forceRefresh=true...');
          const guilds = await loadDiscordGuildsOnce(true);
          console.log('🔍 Discord guilds loaded:', JSON.stringify(guilds));
          
          if (!guilds || guilds.length === 0) {
            console.warn('⚠️ No Discord guilds found or guilds array is empty');
            // Only clear options if we don't already have any
            if (!existingOptions || existingOptions.length === 0) {
              setDynamicOptions(prev => ({
                ...prev,
                [fieldName]: []
              }));
            }
            return;
          }
          
          const formattedOptions = guilds.map(guild => ({
            value: guild.id,
            label: guild.name,
          }));
          console.log('🔍 Formatted guild options:', JSON.stringify(formattedOptions));
          
          // Set options immediately without setTimeout
          setDynamicOptions(prev => {
            const updatedOptions = {
              ...prev,
              [fieldName]: formattedOptions
            };
            console.log('🔍 Updated dynamic options state:', JSON.stringify(updatedOptions));
            return updatedOptions;
          });
        } catch (error) {
          console.error('❌ Error loading Discord guilds:', error);
          // Don't clear existing options on error
        } finally {
          setLoading(false);
          activeLoadingTasks.current.delete(cacheKey);
        }
        return;
      }
      
      // Special handling for Discord channels
      if (fieldName === 'channelId' && providerId === 'discord' && dependsOn === 'guildId' && dependsOnValue) {
        console.log('🔍 Special handling for Discord channels activated');
        try {
          // If we already have options, show them while we're loading new ones
          const existingOptions = dynamicOptions[fieldName];
          if (existingOptions && existingOptions.length > 0) {
            console.log('🔍 Using existing Discord channel options while refreshing');
            // We're keeping the existing options, just refreshing in background
          }
          
          console.log(`🔍 Loading Discord channels for guild ${dependsOnValue}...`);
          const channels = await loadDiscordChannelsOnce(dependsOnValue, false);
          console.log('🔍 Discord channels loaded:', channels.length);
          
          if (!channels || channels.length === 0) {
            console.warn('⚠️ No Discord channels found or channels array is empty');
            // Only clear options if we don't already have any
            if (!existingOptions || existingOptions.length === 0) {
              setDynamicOptions(prev => ({
                ...prev,
                [fieldName]: []
              }));
            }
            setLoading(false);
            activeLoadingTasks.current.delete(cacheKey);
            return;
          }
          
          const formattedOptions = channels.map(channel => ({
            value: channel.id,
            label: channel.name,
          }));
          
          // Set options immediately 
          setDynamicOptions(prev => {
            const updatedOptions = {
              ...prev,
              [fieldName]: formattedOptions
            };
            return updatedOptions;
          });
        } catch (error) {
          console.error('❌ Error loading Discord channels:', error);
          // Don't clear existing options on error
        } finally {
          setLoading(false);
          activeLoadingTasks.current.delete(cacheKey);
        }
        return;
      }

      // Get integration for other providers
      const integration = getIntegrationByProvider(providerId);
      if (!integration) {
        console.warn(`No integration found for provider: ${providerId}`);
        setLoading(false);
        activeLoadingTasks.current.delete(cacheKey);
        return;
      }

      // Determine data to load based on field name
      const resourceType = getResourceTypeForField(fieldName, nodeType);
      if (!resourceType) {
        console.warn(`No resource type found for field: ${fieldName} in node: ${nodeType}`);
        setLoading(false);
        activeLoadingTasks.current.delete(cacheKey);
        return;
      }

      // Load integration data
      const result = await loadIntegrationData(resourceType, integration.id, { [dependsOn || '']: dependsOnValue });
      
      // Format the results
      const formattedOptions = formatOptionsForField(fieldName, result);
      
      // Update dynamic options
      setDynamicOptions(prev => ({
        ...prev,
        [fieldName]: formattedOptions
      }));
      
    } catch (error) {
      console.error(`Failed to load options for ${fieldName}:`, error);
      // Don't clear existing options on error
    } finally {
      setLoading(false);
      activeLoadingTasks.current.delete(cacheKey);
    }
  }, [nodeType, providerId, getIntegrationByProvider, loadIntegrationData, generateCacheKey, dynamicOptions]);
  
  // Clear all options when node type changes
  useEffect(() => {
    setDynamicOptions({});
    fetchingDependentData.current.clear();
    activeLoadingTasks.current.clear();
    requestCache.current.clear();
    discordLoadAttemptTimestamp.current = 0;
    setLoading(false);
  }, [nodeType, providerId]);
  
  return {
    dynamicOptions,
    loading,
    loadOptions,
    resetOptions
  };
};

/**
 * Helper function to determine resource type based on field name and node type
 */
function getResourceTypeForField(fieldName: string, nodeType: string): string | null {
  // Map field names to resource types
  const fieldToResourceMap: Record<string, Record<string, string>> = {
    // Gmail fields
    gmail_trigger_new_email: {
      from: "gmail-recent-recipients",
      to: "gmail-recent-recipients",
      labelIds: "gmail_labels",
    },
    gmail_trigger_new_attachment: {
      from: "gmail-recent-recipients",
      to: "gmail-recent-recipients",
    },
    gmail_action_send_email: {
      messageId: "gmail-recent-recipients",
      labelIds: "gmail_labels",
    },
    // Discord fields
    discord_action_send_message: {
      channelId: "discord_channels",
      guildId: "discord_guilds",
    },
    discord_action_add_reaction: {
      channelId: "discord_channels",
      messageId: "discord_messages",
    },
    // Slack fields
    slack_action_create_channel: {
      workspaceId: "slack_workspaces",
    },
    // Trello fields
    trello_action_create_card: {
      boardId: "trello_boards",
      listId: "trello_lists",
    },
    // Default case for unmapped fields
    default: {
      boardId: "boards",
      channelId: "channels",
      folderId: "folders",
      fileId: "files",
      documentId: "documents",
      databaseId: "databases",
      from: "gmail-recent-recipients",
      to: "gmail-recent-recipients",
      labelIds: "gmail_labels",
    }
  };
  
  // First check node-specific mapping
  const nodeMapping = fieldToResourceMap[nodeType];
  if (nodeMapping && nodeMapping[fieldName]) {
    return nodeMapping[fieldName];
  }
  
  // Fall back to default mapping
  if (fieldToResourceMap.default[fieldName]) {
    return fieldToResourceMap.default[fieldName];
  }
  
  // If no mapping found
  return null;
}

/**
 * Helper function to format API response into options
 */
function formatOptionsForField(fieldName: string, data: any): { value: string; label: string; fields?: any[] }[] {
  if (!data || !Array.isArray(data)) {
    return [];
  }
  
  // Format based on field name
  switch (fieldName) {
    case "from":
    case "to":
    case "messageId":
      return data.map((item: any) => ({
        value: item.email || item.id || item,
        label: item.name || item.email || item.id || item,
      }));
      
    case "labelIds":
      return data.map((item: any) => ({
        value: item.id || item,
        label: item.name || item.id || item,
      }));
      
    case "channelId":
      return data.map((item: any) => ({
        value: item.id,
        label: item.name || item.id,
      }));
      
    case "messageId":
      return data.map((item: any) => ({
        value: item.id,
        label: truncateMessage(item.content || "Message") || `Message ${item.id}`,
      }));
      
    case "boardId":
      return data.map((item: any) => ({
        value: item.id,
        label: item.name || item.id,
      }));
      
    case "listId":
      return data.map((item: any) => ({
        value: item.id,
        label: item.name || item.id,
      }));
      
    case "databaseId":
      return data.map((item: any) => ({
        value: item.id,
        label: item.title || item.name || item.id,
        fields: item.fields || item.properties,
        isExisting: true,
      }));
      
    // Default format for other fields
    default:
      return data.map((item: any) => ({
        value: item.id,
        label: item.name || item.title || item.id,
      }));
  }
}

/**
 * Helper to truncate long messages
 */
function truncateMessage(message: string, maxLength = 30): string {
  if (!message) return "";
  return message.length > maxLength
    ? `${message.substring(0, maxLength)}...`
    : message;
}