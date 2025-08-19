"use client"

import { useState, useCallback, useRef, useEffect } from 'react';
import { useIntegrationStore } from "@/stores/integrationStore";
import { loadDiscordGuildsOnce } from '@/stores/discordGuildsCacheStore'
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
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(false);
  
  // Integration store methods
  const { getIntegrationByProvider, loadIntegrationData } = useIntegrationStore();
  
  // Simple loading prevention
  const loadingFields = useRef<Set<string>>(new Set());
  
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
  const loadOptions = useCallback(async (fieldName: string, dependsOn?: string, dependsOnValue?: any, forceRefresh?: boolean) => {
    if (!nodeType || !providerId) return;
    
    // Prevent duplicate calls for the same field (unless forcing refresh)
    if (!forceRefresh && loadingFields.current.has(fieldName)) {
      return;
    }
    
    loadingFields.current.add(fieldName);
    setLoading(true);

    try {
      // Special handling for Discord guilds
      if (fieldName === 'guildId' && providerId === 'discord') {
        try {
          const guilds = await loadDiscordGuildsOnce(false);
          
          if (!guilds || guilds.length === 0) {
            setDynamicOptions(prev => ({
              ...prev,
              [fieldName]: []
            }));
            return;
          }
          
          const formattedOptions = guilds.map(guild => ({
            value: guild.id,
            label: guild.name,
          }));
          
          setDynamicOptions(prev => ({
            ...prev,
            [fieldName]: formattedOptions
          }));
        } catch (error) {
          console.error('Error loading Discord guilds:', error);
          setDynamicOptions(prev => ({
            ...prev,
            [fieldName]: []
          }));
        } finally {
          loadingFields.current.delete(fieldName);
          setLoading(false);
        }
        return;
      }

      // Get integration for other providers
      const integration = getIntegrationByProvider(providerId);
      if (!integration) {
        console.warn(`No integration found for provider: ${providerId}`);
        setLoading(false);
        return;
      }

      // Determine data to load based on field name
      const resourceType = getResourceTypeForField(fieldName, nodeType);
      
      if (!resourceType) {
        console.warn(`No resource type found for field: ${fieldName} in node: ${nodeType}`);
        setLoading(false);
        return;
      }

      // Load integration data
      const result = await loadIntegrationData(resourceType, integration.id, { [dependsOn || '']: dependsOnValue }, forceRefresh);
      
      // Format the results
      const formattedOptions = formatOptionsForField(fieldName, result);
      
      // Update dynamic options
      setDynamicOptions(prev => ({
        ...prev,
        [fieldName]: formattedOptions
      }));
      
    } catch (error) {
      console.error(`Failed to load options for ${fieldName}:`, error);
      setDynamicOptions(prev => ({
        ...prev,
        [fieldName]: []
      }));
    } finally {
      loadingFields.current.delete(fieldName);
      setLoading(false);
    }
  }, [nodeType, providerId, getIntegrationByProvider, loadIntegrationData]);
  
  // Clear all options when node type changes
  useEffect(() => {
    setDynamicOptions({});
    loadingFields.current.clear();
    setLoading(false);
  }, [nodeType, providerId]);

  // Preload independent fields when modal opens
  useEffect(() => {
    if (!nodeType || !providerId) return;

    // Set initial loading state for Airtable
    if (providerId === 'airtable') {
      setIsInitialLoading(true);
    }

    // Preload fields that don't depend on other fields
    const independentFields = ['baseId', 'guildId', 'workspaceId', 'boardId'];
    
    let loadingPromises: Promise<void>[] = [];
    
    independentFields.forEach(fieldName => {
      // Check if this field exists for this node type
      const resourceType = getResourceTypeForField(fieldName, nodeType);
      if (resourceType) {
        const promise = loadOptions(fieldName);
        loadingPromises.push(promise);
      }
    });
    
    // Wait for all preloading to complete for Airtable
    if (providerId === 'airtable' && loadingPromises.length > 0) {
      Promise.all(loadingPromises).finally(() => {
        setIsInitialLoading(false);
      });
    }
  }, [nodeType, providerId, loadOptions]);
  
  return {
    dynamicOptions,
    loading,
    isInitialLoading,
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
      to: "gmail-enhanced-recipients",
      cc: "gmail-enhanced-recipients", 
      bcc: "gmail-enhanced-recipients",
      messageId: "gmail-recent-recipients",
      labelIds: "gmail_labels",
    },
    gmail_action_add_label: {
      email: "gmail-recent-recipients",
      labelIds: "gmail_labels",
    },
    // Discord fields
    discord_trigger_new_message: {
      channelId: "discord_channels",
      guildId: "discord_guilds",
      authorFilter: "discord_users",
    },
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
    trello_trigger_new_card: {
      boardId: "trello_boards",
      listId: "trello_lists",
    },
    trello_trigger_card_updated: {
      boardId: "trello_boards",
      listId: "trello_lists",
    },
    trello_trigger_card_moved: {
      boardId: "trello_boards",
    },
    trello_trigger_comment_added: {
      boardId: "trello_boards",
    },
    trello_trigger_member_changed: {
      boardId: "trello_boards",
    },
    trello_action_create_card: {
      boardId: "trello_boards",
      listId: "trello_lists",
      template: "trello-card-templates",
    },
    trello_action_create_list: {
      boardId: "trello_boards",
    },
    trello_action_move_card: {
      boardId: "trello_boards",
      cardId: "trello_cards",
      listId: "trello_lists",
    },
    // Airtable fields
    airtable_action_create_record: {
      baseId: "airtable_bases",
      tableName: "airtable_tables",
    },
    airtable_action_update_record: {
      baseId: "airtable_bases",
      tableName: "airtable_tables",
    },
    airtable_action_list_records: {
      baseId: "airtable_bases",
      tableName: "airtable_tables",
    },
    // Default case for unmapped fields
    default: {
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
    case "cc":
    case "bcc":
    case "email":
    case "messageId":
      return data.map((item: any) => ({
        value: item.email || item.value || item.id || item,
        label: item.label || (item.name ? `${item.name} <${item.email || item.value}>` : item.email || item.value || item.id || item),
        email: item.email || item.value,
        name: item.name,
        type: item.type,
        isGroup: item.isGroup,
        groupId: item.groupId,
        members: item.members
      }));
      
    case "labelIds":
      return data.map((item: any) => ({
        value: item.id || item,
        label: item.name || item.id || item,
      }));
      
    case "channelId":
      return data.map((item: any) => ({
        value: item.id || item.value,
        label: item.name || item.label || item.id,
      }));
      
    case "authorFilter":
      return data.map((item: any) => ({
        value: item.id || item.value,
        label: item.username || item.name || item.label || item.id,
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
      
    case "baseId":
      return data.map((item: any) => ({
        value: item.value || item.id,
        label: item.label || item.name || item.id,
        description: item.description || item.permissionLevel,
      }));
      
    case "tableName":
      return data.map((item: any) => ({
        value: item.value || item.name || item.id,
        label: item.label || item.name || item.id,
        fields: item.fields,
        description: item.description
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