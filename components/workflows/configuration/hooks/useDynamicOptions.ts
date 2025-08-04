"use client"

import { useState, useCallback, useRef, useEffect } from 'react';
import { useIntegrationStore } from "@/stores/integrationStore";
import { DynamicOptionsState } from '../utils/types';

interface UseDynamicOptionsProps {
  nodeType?: string;
  providerId?: string;
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
  const loadOptions = useCallback(async (
    fieldName: string, 
    dependentValues?: Record<string, any>
  ) => {
    if (!nodeType || !providerId) return;
    
    // Skip if already loading this data
    const taskKey = generateCacheKey(fieldName, dependentValues);
    if (fetchingDependentData.current.has(taskKey)) {
      return;
    }
    
    // Check cache
    if (requestCache.current.has(taskKey)) {
      return requestCache.current.get(taskKey);
    }
    
    // Start loading
    fetchingDependentData.current.add(taskKey);
    activeLoadingTasks.current.add(taskKey);
    setLoading(true);
    
    // Get integration
    const integration = getIntegrationByProvider(providerId);
    if (!integration) {
      console.warn(`No integration found for provider: ${providerId}`);
      fetchingDependentData.current.delete(taskKey);
      activeLoadingTasks.current.delete(taskKey);
      setLoading(activeLoadingTasks.current.size > 0);
      return;
    }
    
    try {
      // Create promise and add to cache
      const loadPromise = new Promise<void>(async (resolve, reject) => {
        try {
          // Determine data to load based on field name
          const resourceType = getResourceTypeForField(fieldName, nodeType);
          if (!resourceType) {
            console.warn(`No resource type found for field: ${fieldName} in node: ${nodeType}`);
            resolve();
            return;
          }
          
          // Load integration data
          const result = await loadIntegrationData(resourceType, integration.id, dependentValues);
          
          // Format the results
          const formattedOptions = formatOptionsForField(fieldName, result);
          
          // Update dynamic options
          setDynamicOptions(prev => ({
            ...prev,
            [fieldName]: formattedOptions
          }));
          
          resolve();
        } catch (error) {
          console.error(`Failed to load dynamic options for ${fieldName}:`, error);
          // Don't reject, just resolve with empty options to prevent modal crash
          setDynamicOptions(prev => ({
            ...prev,
            [fieldName]: []
          }));
          resolve();
        }
      });
      
      requestCache.current.set(taskKey, loadPromise);
      await loadPromise;
      
    } catch (error) {
      console.error(`Failed to load options for ${fieldName}:`, error);
      // Set empty options to prevent modal crash
      setDynamicOptions(prev => ({
        ...prev,
        [fieldName]: []
      }));
    } finally {
      fetchingDependentData.current.delete(taskKey);
      activeLoadingTasks.current.delete(taskKey);
      setLoading(activeLoadingTasks.current.size > 0);
    }
  }, [nodeType, providerId, getIntegrationByProvider, loadIntegrationData, generateCacheKey]);
  
  // Clear all options when node type changes
  useEffect(() => {
    setDynamicOptions({});
    fetchingDependentData.current.clear();
    activeLoadingTasks.current.clear();
    requestCache.current.clear();
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