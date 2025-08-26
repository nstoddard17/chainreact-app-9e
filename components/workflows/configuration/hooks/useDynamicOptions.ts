"use client"

import { useState, useCallback, useRef, useEffect } from 'react';
import { useIntegrationStore } from "@/stores/integrationStore";
import { loadDiscordGuildsOnce } from '@/stores/discordGuildsCacheStore'
import { DynamicOptionsState } from '../utils/types';

interface UseDynamicOptionsProps {
  nodeType?: string;
  providerId?: string;
  onLoadingChange?: (fieldName: string, isLoading: boolean) => void;
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
export const useDynamicOptions = ({ nodeType, providerId, onLoadingChange }: UseDynamicOptionsProps) => {
  // Store callback in ref to avoid dependency issues
  const onLoadingChangeRef = useRef(onLoadingChange);
  onLoadingChangeRef.current = onLoadingChange;
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
    // Add specific logging for troubleshooting
    if (fieldName === 'filterAuthor' || fieldName === 'channelId') {
      console.log(`🔄 [loadOptions] ${fieldName} called:`, { fieldName, nodeType, providerId, dependsOn, dependsOnValue, forceRefresh, timestamp: new Date().toISOString() });
    }
    
    if (!nodeType || !providerId) return;
    
    // Auto-detect dependencies for certain fields
    if (fieldName === 'messageId' && !dependsOn) {
      dependsOn = 'channelId';
      // Note: dependsOnValue will be handled below by looking at current form values
    }
    
    // Create a cache key that includes dependencies
    const cacheKey = `${fieldName}-${dependsOn || 'none'}-${dependsOnValue || 'none'}`;
    
    // Prevent duplicate calls for the same field (unless forcing refresh)
    if (!forceRefresh && loadingFields.current.has(cacheKey)) {
      // Only log for Discord fields to avoid spam
      if (fieldName === 'filterAuthor' || (fieldName === 'guildId' && providerId === 'discord')) {
        console.log('🚫 [loadOptions] Skipping Discord field - already loading:', { 
          fieldName, 
          cacheKey, 
          isLoading: loadingFields.current.has(cacheKey)
        });
      }
      return;
    }
    
    // For filterAuthor, only skip if we have data for the specific guild
    if (!forceRefresh && fieldName === 'filterAuthor' && dependsOn === 'guildId' && dependsOnValue) {
      const guildSpecificData = dynamicOptions[`${fieldName}_${dependsOnValue}`];
      if (guildSpecificData && guildSpecificData.length > 0) {
        console.log('🚫 [loadOptions] Skipping filterAuthor - already have data for this guild:', { 
          fieldName, 
          guildId: dependsOnValue,
          dataCount: guildSpecificData.length
        });
        return;
      }
    }
    
    // For other fields, use simple data check
    if (!forceRefresh && fieldName !== 'filterAuthor' && dynamicOptions[fieldName] && dynamicOptions[fieldName].length > 0) {
      console.log('🚫 [loadOptions] Skipping field - already has data:', { 
        fieldName, 
        dataCount: dynamicOptions[fieldName].length
      });
      return;
    }
    loadingFields.current.add(cacheKey);
    setLoading(true);
    
    // Enhanced logging for channelId loading state
    if (fieldName === 'channelId') {
      console.log('🔄 [loadOptions] Setting channelId loading to TRUE:', { cacheKey, timestamp: new Date().toISOString() });
    }
    
    onLoadingChangeRef.current?.(fieldName, true);

    try {
      // Special handling for Discord guilds
      if (fieldName === 'guildId' && providerId === 'discord') {
        try {
          const guilds = await loadDiscordGuildsOnce(forceRefresh || false);
          
          if (!guilds || guilds.length === 0) {
            // Check if we have a Discord integration - if not, this is expected
            const discordIntegration = getIntegrationByProvider('discord');
            
            if (!discordIntegration) {
              console.log('🔍 No Discord integration found - empty guild list expected');
            } else {
              console.warn('⚠️ Discord integration exists but no guilds returned - may need reconnection');
            }
            
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
        } catch (error: any) {
          console.error('Error loading Discord guilds:', error);
          
          // If this is an authentication error, we might need to refresh integration state
          if (error.message?.includes('authentication') || error.message?.includes('expired')) {
            console.log('🔄 Discord authentication error detected, refreshing integration state');
            try {
              const { useIntegrationStore } = await import('@/stores/integrationStore');
              useIntegrationStore.getState().fetchIntegrations(true);
            } catch (refreshError) {
              console.warn('Failed to refresh integration state:', refreshError);
            }
          }
          
          setDynamicOptions(prev => ({
            ...prev,
            [fieldName]: []
          }));
        } finally {
          loadingFields.current.delete(cacheKey);
          setLoading(false);
        }
        return;
      }

      // Get integration for other providers
      const integration = getIntegrationByProvider(providerId);
      if (!integration) {
        console.warn(`No integration found for provider: ${providerId}`);
        loadingFields.current.delete(cacheKey);
        setLoading(false);
        return;
      }

      // Determine data to load based on field name
      const resourceType = getResourceTypeForField(fieldName, nodeType);
      
      console.log(`🔍 [useDynamicOptions] Mapping debug:`, {
        fieldName,
        nodeType,
        resourceType,
        integration: integration.provider
      });
      
      if (!resourceType) {
        console.warn(`No resource type found for field: ${fieldName} in node: ${nodeType}`);
        loadingFields.current.delete(cacheKey);
        setLoading(false);
        return;
      }

      // Load integration data with proper options
      const options = dependsOn && dependsOnValue ? { [dependsOn]: dependsOnValue } : {};
      
      // For Google Sheets sheets, don't call API without spreadsheetId
      if (fieldName === 'sheetName' && resourceType === 'google-sheets_sheets' && !dependsOnValue) {
        console.log('🔍 [useDynamicOptions] Skipping sheets load - no spreadsheet selected');
        return;
      }
      const result = await loadIntegrationData(resourceType, integration.id, options, forceRefresh);
      
      // Format the results - extract data array from response object if needed
      const dataArray = result.data || result;
      const formattedOptions = formatOptionsForField(fieldName, dataArray);
      
      // Special handling for Discord channels - if empty and we have a guildId, it likely means bot is not in server
      if (fieldName === 'channelId' && resourceType === 'discord_channels' && 
          formattedOptions.length === 0 && dependsOnValue) {
        throw new Error('Bot not added to server - no channels available');
      }
      
      // Update dynamic options - store both general and dependency-specific data
      const updateObject: any = { [fieldName]: formattedOptions };
      
      // For dependent fields, also store with dependency-specific key for better caching
      if (dependsOn && dependsOnValue) {
        updateObject[`${fieldName}_${dependsOnValue}`] = formattedOptions;
      }
      
      setDynamicOptions(prev => ({
        ...prev,
        ...updateObject
      }));
      
    } catch (error) {
      console.error(`Failed to load options for ${fieldName}:`, error);
      setDynamicOptions(prev => ({
        ...prev,
        [fieldName]: []
      }));
    } finally {
      loadingFields.current.delete(cacheKey);
      setLoading(false);
      
      // Enhanced logging for channelId loading state
      if (fieldName === 'channelId') {
        console.log('🔄 [loadOptions] Setting channelId loading to FALSE:', { cacheKey, timestamp: new Date().toISOString() });
      }
      
      onLoadingChangeRef.current?.(fieldName, false);
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
    // Note: Exclude email fields (like 'email') since they should load on-demand only
    // Also exclude dependent fields like messageId (depends on channelId), channelId (depends on guildId), etc.
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
  }, [nodeType, providerId]); // Removed loadOptions from dependencies to prevent loops
  
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
  console.log(`🔍 [getResourceTypeForField] Called with:`, { fieldName, nodeType });
  
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
      to: "gmail-recent-recipients",
      cc: "gmail-recent-recipients", 
      bcc: "gmail-recent-recipients",
      messageId: "gmail-recent-recipients",
      labelIds: "gmail_labels",
    },
    gmail_action_add_label: {
      email: "gmail-recent-recipients",
      labelIds: "gmail_labels",
    },
    gmail_action_search_email: {
      labels: "gmail_labels",
      labelFilters: "gmail_labels",
      emailAddress: "gmail-recent-recipients",
    },
    // Discord fields
    discord_trigger_new_message: {
      channelId: "discord_channels",
      guildId: "discord_guilds",
      filterAuthor: "discord_members",
    },
    discord_action_send_message: {
      channelId: "discord_channels",
      guildId: "discord_guilds",
    },
    discord_action_add_reaction: {
      channelId: "discord_channels",
      messageId: "discord_messages",
    },
    discord_action_edit_message: {
      channelId: "discord_channels",
      guildId: "discord_guilds",
      messageId: "discord_messages",
    },
    discord_action_delete_message: {
      channelId: "discord_channels",
      guildId: "discord_guilds",
      messageId: "discord_messages",
    },
    discord_action_create_channel: {
      guildId: "discord_guilds",
    },
    discord_action_create_category: {
      guildId: "discord_guilds",
    },
    discord_action_fetch_messages: {
      channelId: "discord_channels",
      guildId: "discord_guilds",
      filterAuthor: "discord_members",
    },
    discord_action_remove_reaction: {
      channelId: "discord_channels", 
      guildId: "discord_guilds",
      messageId: "discord_messages",
    },
    discord_action_update_channel: {
      channelId: "discord_channels",
      guildId: "discord_guilds",
      parentId: "discord_categories",
    },
    discord_action_delete_channel: {
      channelId: "discord_channels",
      guildId: "discord_guilds",
      parentCategory: "discord_categories",
    },
    discord_action_delete_category: {
      guildId: "discord_guilds",
      categoryId: "discord_categories",
    },
    discord_action_fetch_guild_members: {
      guildId: "discord_guilds",
      roleFilter: "discord_roles",
    },
    discord_action_assign_role: {
      guildId: "discord_guilds",
      userId: "discord_members",
      roleId: "discord_roles",
    },
    discord_action_remove_role: {
      guildId: "discord_guilds",
      userId: "discord_members",
      roleId: "discord_roles",
    },
    discord_action_kick_member: {
      guildId: "discord_guilds",
      userId: "discord_members",
    },
    discord_action_ban_member: {
      guildId: "discord_guilds",
      userId: "discord_members",
    },
    discord_action_unban_member: {
      guildId: "discord_guilds",
      userId: "discord_banned_users",
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
    // Google Calendar fields
    google_calendar_action_create_event: {
      calendarId: "google-calendars",
      attendees: "gmail-recent-recipients",
    },
    // Google Sheets fields
    google_sheets_unified_action: {
      spreadsheetId: "google-sheets_spreadsheets",
      sheetName: "google-sheets_sheets",
    },
    // Google Drive fields
    "google-drive:new_file_in_folder": {
      folderId: "google-drive-folders",
    },
    "google-drive:new_folder_in_folder": {
      folderId: "google-drive-folders",
      parentFolderId: "google-drive-folders",
    },
    "google-drive:upload_file": {
      folderId: "google-drive-folders",
    },
    "google-drive:create_folder": {
      parentFolderId: "google-drive-folders",
    },
    "google-drive:create_file": {
      folderId: "google-drive-folders",
    },
    "google-drive:file_updated": {
      folderId: "google-drive-folders",
    },
    google_drive_action_upload_file: {
      folderId: "google-drive-folders",
    },
    // Google Docs fields
    google_docs_action_create_document: {
      folderId: "google-drive-folders",
      templateId: "google-docs_templates",
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
    // Microsoft Outlook fields
    "microsoft-outlook_action_send_email": {
      to: "outlook-enhanced-recipients",
      cc: "outlook-enhanced-recipients", 
      bcc: "outlook-enhanced-recipients",
    },
    "microsoft-outlook_action_forward_email": {
      to: "outlook-enhanced-recipients",
      cc: "outlook-enhanced-recipients", 
      bcc: "outlook-enhanced-recipients",
      messageId: "outlook_messages",
    },
    "microsoft-outlook_action_create_meeting": {
      attendees: "outlook-enhanced-recipients",
    },
    "microsoft-outlook_action_create_calendar_event": {
      attendees: "outlook-enhanced-recipients",
    },
    "microsoft-teams_action_add_team_member": {
      userEmail: "outlook-enhanced-recipients",
      teamId: "teams_teams",
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
      attendees: "gmail-recent-recipients",
      labelIds: "gmail_labels",
    }
  };
  
  // First check node-specific mapping
  const nodeMapping = fieldToResourceMap[nodeType];
  console.log(`🔍 [getResourceTypeForField] Node mapping for '${nodeType}':`, nodeMapping);
  
  if (nodeMapping && nodeMapping[fieldName]) {
    const result = nodeMapping[fieldName];
    console.log(`🔍 [getResourceTypeForField] Found node-specific mapping: '${fieldName}' -> '${result}'`);
    return result;
  }
  
  // Fall back to default mapping
  if (fieldToResourceMap.default[fieldName]) {
    const result = fieldToResourceMap.default[fieldName];
    console.log(`🔍 [getResourceTypeForField] Using default mapping: '${fieldName}' -> '${result}'`);
    return result;
  }
  
  // If no mapping found
  console.log(`🔍 [getResourceTypeForField] No mapping found for '${fieldName}' in node '${nodeType}'`);
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
    case "attendees":
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
      
    case "filterAuthor":
      return data.map((item: any) => ({
        value: item.id || item.value,
        label: item.username || item.name || item.label || item.id,
      }));
      
    case "messageId":
      return data.map((item: any) => {
        const baseLabel = item.content || `Message by ${item.author?.username || 'Unknown'} (${item.timestamp ? new Date(item.timestamp).toLocaleString() : 'Unknown time'})`;
        const reactions = item.reactions || [];
        const hasReactions = reactions.length > 0;
        const reactionCount = hasReactions ? reactions.reduce((total: number, reaction: any) => total + reaction.count, 0) : 0;
        const label = hasReactions ? `${baseLabel} [${reactionCount} reactions]` : baseLabel;
        
        return {
          id: item.id,
          value: item.id,
          label,
          content: item.content,
          author: item.author,
          timestamp: item.timestamp,
          type: item.type,
          reactions: reactions
        };
      });
      
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
      
    case "sheetName":
      return data.map((item: any) => ({
        value: item.value || item.name || item.id,
        label: item.name || item.label || item.value || item.id,
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