"use client"

import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Play, TestTube, Save, Settings, Zap, Link, X, Eye, Database } from "lucide-react";
import { FieldRenderer } from "./fields/FieldRenderer";
import { AIFieldWrapper } from "./fields/AIFieldWrapper";
import { DiscordReactionRemover } from "./fields/discord/DiscordReactionRemover";
import { DiscordReactionSelector } from "./fields/discord/DiscordReactionSelector";
import { useFormState } from "./hooks/useFormState";
import { useDynamicOptions } from "./hooks/useDynamicOptions";
import { NodeComponent } from "@/lib/workflows/availableNodes";
import { ConfigFormProps } from "./utils/types";
import { shouldHideField } from "./utils/validation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConfigurationLoadingScreen } from "@/components/ui/loading-screen";
import { useWorkflowTestStore } from "@/stores/workflowTestStore";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import DiscordBotStatus from "../DiscordBotStatus";
import { useIntegrationStore } from "@/stores/integrationStore";
import { useWorkflowStore } from '@/stores/workflowStore';
import { useAuthStore } from '@/stores/authStore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadNodeConfig, saveNodeConfig } from "@/lib/workflows/configPersistence";

/**
 * Helper function to map Airtable field types to form field types
 */
function getAirtableFieldType(airtableType: string): string {
  switch (airtableType) {
    case 'singleLineText':
    case 'multilineText':
    case 'richText':
    case 'email':
    case 'phoneNumber':
    case 'url':
      return 'text';
    case 'number':
    case 'rating':
    case 'percent':
    case 'currency':
    case 'duration':
      return 'number';
    case 'checkbox':
      return 'checkbox';
    case 'singleSelect':
    case 'multipleSelects':
    case 'singleCollaborator':
    case 'multipleCollaborators':
      return 'select';
    case 'date':
    case 'dateTime':
      return 'date';
    case 'attachment':
    case 'multipleAttachments':
      return 'file';
    default:
      return 'text';
  }
}

/**
 * Helper function to map Airtable field types from schema to form field types
 */
function getAirtableFieldTypeFromSchema(field: any): string {
  const { type } = field;
  
  // If field has predefined choices, it's a select
  if (field.choices && field.choices.length > 0) {
    return 'select';
  }
  
  switch (type) {
    case 'singleLineText':
    case 'multilineText':
    case 'richText':
      return 'textarea';
    case 'email':
      return 'email';
    case 'url':
      return 'url';
    case 'phoneNumber':
      return 'tel';
    case 'number':
    case 'currency':
    case 'percent':
    case 'duration':
      return 'number';
    case 'rating':
      return 'select'; // Will show as dropdown with rating options
    case 'checkbox':
      return 'checkbox';
    case 'singleSelect':
    case 'multipleSelects':
      return 'select';
    case 'singleCollaborator':
    case 'multipleCollaborators':
      return 'select';
    case 'date':
    case 'dateTime':
    case 'createdTime':
    case 'lastModifiedTime':
      return 'date';
    case 'attachment':
    case 'multipleAttachments':
      return 'file';
    case 'multipleRecordLinks':
    case 'singleRecordLink':
      return 'select'; // Will need special handling for linked records
    case 'formula':
    case 'rollup':
    case 'count':
    case 'lookup':
    case 'autoNumber':
    case 'button':
    case 'createdBy':
    case 'lastModifiedBy':
      return 'readonly'; // These are computed/system fields
    default:
      return 'text';
  }
}

/**
 * Component to render the configuration form based on node schema
 */
export default function ConfigurationForm({
  nodeInfo,
  initialData,
  onSubmit,
  onCancel,
  workflowData,
  currentNodeId,
  integrationName,
}: ConfigFormProps) {
  const [hasInitialized, setHasInitialized] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");
  const [isLoading, setIsLoading] = useState(false);
  const [isTestLoading, setIsTestLoading] = useState(false);
  const [botStatus, setBotStatus] = useState<{ isInGuild: boolean; hasPermissions: boolean } | null>(null);
  const [isBotStatusChecking, setIsBotStatusChecking] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [airtableRecords, setAirtableRecords] = useState<any[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [aiFields, setAiFields] = useState<Set<string>>(new Set());
  const [showPreviewData, setShowPreviewData] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingFields, setLoadingFields] = useState<Set<string>>(new Set());
  const [scrollProgress, setScrollProgress] = useState(0);
  const [channelBotStatus, setChannelBotStatus] = useState<{ 
    isInChannel: boolean; 
    canSendMessages: boolean; 
    hasPermissions: boolean; 
    userCanInviteBot: boolean; 
    error?: string 
  } | null>(null);
  const [isChannelBotStatusChecking, setIsChannelBotStatusChecking] = useState(false);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [channelLoadingError, setChannelLoadingError] = useState<string | null>(null);
  const [isDiscordBotConfigured, setIsDiscordBotConfigured] = useState<boolean | null>(null);
  const [discordClientId, setDiscordClientId] = useState<string | null>(null);
  const [isBotConnectionInProgress, setIsBotConnectionInProgress] = useState(false);
  const [selectedEmojiReactions, setSelectedEmojiReactions] = useState<any[]>([]);
  const [isLoadingInitialConfig, setIsLoadingInitialConfig] = useState(false);
  const [airtableTableSchema, setAirtableTableSchema] = useState<any>(null);
  const [isLoadingTableSchema, setIsLoadingTableSchema] = useState(false);
  
  // Form state management
  const {
    values,
    errors,
    touched,
    isDirty,
    isValid,
    setValue,
    setValues,
    resetForm,
    validate,
    handleSubmit
  } = useFormState(initialData || {}, nodeInfo);

  // Check if this is an update record action
  const isUpdateRecord = nodeInfo?.providerId === 'airtable' && nodeInfo?.type === 'airtable_action_update_record';

  // Handle field loading state changes from the hook
  const handleLoadingChange = useCallback((fieldName: string, isLoading: boolean) => {
    if (fieldName === 'filterAuthor' || fieldName === 'channelId') {
      console.log(`🔍 [ConfigurationForm] Loading state change for ${fieldName}:`, { fieldName, isLoading });
    }
    
    setLoadingFields(prev => {
      const newSet = new Set(prev);
      if (isLoading) {
        newSet.add(fieldName);
      } else {
        newSet.delete(fieldName);
      }
      
      if (fieldName === 'filterAuthor' || fieldName === 'channelId') {
        console.log(`🔍 [ConfigurationForm] Updated loadingFields for ${fieldName}:`, Array.from(newSet));
      }
      
      return newSet;
    });
  }, []);

  // Dynamic options management
  const {
    dynamicOptions,
    loading: loadingDynamic,
    isInitialLoading,
    loadOptions,
    resetOptions
  } = useDynamicOptions({ 
    nodeType: nodeInfo?.type, 
    providerId: nodeInfo?.providerId,
    onLoadingChange: handleLoadingChange,
    getFormValues: () => values
  });

  // Discord integration check
  const { getIntegrationByProvider, connectIntegration, getConnectedProviders, loadIntegrationData, integrations } = useIntegrationStore();
  const { updateNode, saveWorkflow, currentWorkflow } = useWorkflowStore();
  const discordIntegration = getIntegrationByProvider('discord');
  const needsDiscordConnection = nodeInfo?.providerId === 'discord' && !discordIntegration;

  // Function to get the current workflow ID from the workflow store
  const getWorkflowId = useCallback(() => {
    return currentWorkflow?.id || "";
  }, [currentWorkflow?.id]);

  // Function to check Discord bot status in server
  const checkBotStatus = useCallback(async (guildId: string) => {
    if (!guildId || !discordIntegration) return;
    
    try {
      setIsBotStatusChecking(true);
      // Clear any previous channel loading errors when checking bot status
      setChannelLoadingError(null);
      const response = await fetch(`/api/discord/bot-status?guildId=${guildId}`);
      const data = await response.json();
      
      const newBotStatus = {
        isInGuild: data.isInGuild,
        hasPermissions: data.hasPermissions
      };
      
      setBotStatus(newBotStatus);
      
      // If bot is now connected with permissions, automatically load channels
      if (newBotStatus.isInGuild && newBotStatus.hasPermissions) {
        console.log('🔍 Bot connected with permissions, loading channels for guild:', guildId);
        // Let the useDynamicOptions hook handle all loading state management
        loadOptions('channelId', 'guildId', guildId)
          .then(() => {
            console.log('✅ Channels loaded successfully after bot connection');
          })
          .catch((channelError) => {
            console.error('Failed to load channels after bot connection:', channelError);
            setChannelLoadingError('Failed to load channels after bot connection');
          });
      }
    } catch (error) {
      console.error("Error checking Discord bot status:", error);
      setBotStatus({
        isInGuild: false,
        hasPermissions: false
      });
    } finally {
      setIsBotStatusChecking(false);
    }
  }, [discordIntegration, loadOptions]);

  // Function to load Discord reactions for a specific message
  const loadReactionsForMessage = useCallback(async (channelId: string, messageId: string) => {
    if (!channelId || !messageId || !discordIntegration) {
      console.warn('Missing required parameters for loading reactions:', { channelId, messageId, hasIntegration: !!discordIntegration });
      return;
    }

    try {
      console.log('🔍 Loading reactions for message:', messageId, 'in channel:', channelId);
      
      // Set loading state manually for selectedEmoji field
      setLoadingFields(prev => new Set(prev).add('selectedEmoji'));
      
      // Load reactions using the integration service directly
      const reactionsData = await loadIntegrationData('discord_reactions', discordIntegration.id, {
        channelId,
        messageId
      });
      
      // Format the reactions data
      const formattedReactions = (reactionsData.data || reactionsData || []).map((reaction: any) => ({
        value: reaction.value || reaction.id || reaction.emoji,
        label: reaction.name || `${reaction.emoji} (${reaction.count || 0} reactions)`,
        emoji: reaction.emoji,
        count: reaction.count || 0,
        ...reaction
      }));
      
      // Update selected emoji reactions state
      setSelectedEmojiReactions(formattedReactions);
      
      console.log('✅ Loaded', formattedReactions.length, 'reactions for message');
    } catch (error: any) {
      console.error('Failed to load reactions:', error);
      setSelectedEmojiReactions([]);
    } finally {
      // Clear loading state
      setLoadingFields(prev => {
        const newSet = new Set(prev);
        newSet.delete('selectedEmoji');
        return newSet;
      });
    }
  }, [discordIntegration, loadIntegrationData]);

  // Unified dynamic load handler that handles special cases
  const handleDynamicLoad = useCallback(async (fieldName: string, dependsOn?: string, dependsOnValue?: any) => {
    console.log('🔍 handleDynamicLoad called:', { fieldName, dependsOn, dependsOnValue });
    
    // No special emoji field handling needed since it was removed
    
    // Special handling for messageId field - it always depends on channelId
    if (fieldName === 'messageId' && values.channelId) {
      await loadOptions(fieldName, 'channelId', values.channelId);
      return;
    }
    
    // Default handling
    if (dependsOn && values[dependsOn]) {
      await loadOptions(fieldName, dependsOn, values[dependsOn]);
    } else {
      await loadOptions(fieldName);
    }
  }, [values, nodeInfo?.providerId, loadReactionsForMessage, loadOptions]);

  // Function to check Discord bot status in specific channel
  const checkChannelBotStatus = useCallback(async (channelId: string, guildId: string) => {
    if (!channelId || !guildId || !discordIntegration) return;
    
    try {
      setIsChannelBotStatusChecking(true);
      const response = await fetch(`/api/discord/channel-bot-status?channelId=${channelId}&guildId=${guildId}`);
      const data = await response.json();
      
      setChannelBotStatus({
        isInChannel: data.isInChannel,
        canSendMessages: data.canSendMessages,
        hasPermissions: data.hasPermissions,
        userCanInviteBot: data.userCanInviteBot,
        error: data.error
      });
    } catch (error) {
      console.error("Error checking Discord channel bot status:", error);
      setChannelBotStatus({
        isInChannel: false,
        canSendMessages: false,
        hasPermissions: false,
        userCanInviteBot: false,
        error: 'Failed to check bot status'
      });
    } finally {
      setIsChannelBotStatusChecking(false);
    }
  }, [discordIntegration]);

  // Function to check if Discord bot is in server (quick check before loading channels)
  const checkBotInServer = useCallback(async (guildId: string): Promise<boolean> => {
    if (!guildId || !discordIntegration) return false;
    
    try {
      const response = await fetch(`/api/discord/bot-status?guildId=${guildId}`);
      const data = await response.json();
      
      if (!response.ok) {
        console.log('🔍 Bot status check failed:', data.error);
        return false;
      }
      
      console.log('🔍 Bot status check result:', data);
      return data.isInGuild === true;
    } catch (error) {
      console.error("Error checking if bot is in server:", error);
      return false;
    }
  }, [discordIntegration]);

  // Function to fetch Airtable table schema using existing integration system
  const fetchAirtableTableSchema = useCallback(async (baseId: string, tableName: string) => {
    const airtableIntegration = getIntegrationByProvider('airtable');
    if (!baseId || !tableName || !airtableIntegration) {
      console.log('🔍 Missing required params for fetching table schema:', { baseId, tableName, hasIntegration: !!airtableIntegration });
      setIsLoadingTableSchema(false);
      return;
    }
    
    // Set loading state immediately when called
    setIsLoadingTableSchema(true);
    
    try {
      console.log('🔍 Fetching Airtable table schema for:', { baseId, tableName });
      
      // Use a sample records request to infer field types from actual data
      const response = await fetch('/api/integrations/airtable/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId: airtableIntegration.id,
          dataType: 'airtable_records',
          options: {
            baseId,
            tableName,
            maxRecords: 20 // Fetch sample records to infer field structure
          }
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        console.error('Failed to fetch table data:', error);
        setAirtableTableSchema(null);
        setIsLoadingTableSchema(false);
        return;
      }
      
      const result = await response.json();
      const records = result.data || [];
      
      if (records.length === 0) {
        console.log('🔍 No records found to infer schema');
        setAirtableTableSchema(null);
        setIsLoadingTableSchema(false);
        return;
      }
      
      // Infer fields from the records
      const fieldMap = new Map<string, any>();
      const linkedRecordFields = new Set<string>(); // Track fields that contain linked records
      
      records.forEach((record: any) => {
        if (record.fields) {
          Object.entries(record.fields).forEach(([fieldName, value]) => {
            if (!fieldMap.has(fieldName)) {
              // Infer field type from value
              const fieldInfo = {
                id: fieldName.replace(/[^a-zA-Z0-9]/g, '_'),
                name: fieldName,
                type: inferFieldType(value),
                values: new Set(),
                isLinkedRecord: false
              };
              fieldMap.set(fieldName, fieldInfo);
            }
            
            // Collect unique values for potential dropdown
            const fieldInfo = fieldMap.get(fieldName);
            if (fieldInfo && value !== null && value !== undefined) {
              if (Array.isArray(value)) {
                // Check if this is an array of record IDs (linked records)
                const hasRecordIds = value.some(v => typeof v === 'string' && v.startsWith('rec'));
                if (hasRecordIds) {
                  fieldInfo.isLinkedRecord = true;
                  linkedRecordFields.add(fieldName);
                  // Collect the record IDs so we can fetch their names
                  value.forEach(v => {
                    if (typeof v === 'string' && v.startsWith('rec')) {
                      fieldInfo.values.add(v);
                    }
                  });
                } else {
                  value.forEach(v => fieldInfo.values.add(v));
                }
              } else if (typeof value === 'string' && value.startsWith('rec')) {
                // Single linked record
                fieldInfo.isLinkedRecord = true;
                linkedRecordFields.add(fieldName);
                // Collect the record ID
                fieldInfo.values.add(value);
              } else {
                fieldInfo.values.add(value);
              }
            }
          });
        }
      });
      
      // For linked record fields, try to fetch the actual record names
      const linkedRecordOptions: Record<string, any[]> = {};
      
      for (const linkedFieldName of linkedRecordFields) {
        const fieldInfo = fieldMap.get(linkedFieldName);
        if (!fieldInfo || !fieldInfo.values.size) continue;
        
        // Get the unique record IDs we need to fetch
        const recordIds = Array.from(fieldInfo.values);
        
        // Try to guess the linked table name from the field name
        let linkedTableName = linkedFieldName;
        
        // Handle common patterns
        if (linkedFieldName.toLowerCase().includes('project')) {
          linkedTableName = 'Projects';
        } else if (linkedFieldName.toLowerCase().includes('task')) {
          linkedTableName = 'Tasks';
        } else if (linkedFieldName.toLowerCase().includes('feedback')) {
          linkedTableName = 'Feedback';
        } else if (linkedFieldName.toLowerCase().includes('user') || linkedFieldName.toLowerCase().includes('assignee')) {
          linkedTableName = 'Users';
        } else if (linkedFieldName.toLowerCase().includes('customer') || linkedFieldName.toLowerCase().includes('client')) {
          linkedTableName = 'Customers';
        } else {
          // Default: try plural form
          linkedTableName = linkedFieldName.replace(/s?$/, 's');
        }
        
        try {
          // Try to fetch records from the linked table
          const linkedResponse = await fetch('/api/integrations/airtable/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              integrationId: airtableIntegration.id,
              dataType: 'airtable_records',
              options: {
                baseId,
                tableName: linkedTableName,
                maxRecords: 100
              }
            })
          });
          
          if (linkedResponse.ok) {
            const linkedResult = await linkedResponse.json();
            const linkedRecords = linkedResult.data || [];
            
            console.log(`📊 Fetched ${linkedRecords.length} records from ${linkedTableName} table for field ${linkedFieldName}`);
            
            // Create a map of record ID to name
            const recordMap = new Map<string, string>();
            
            // Analyze the first record to determine the best field to use for display
            let displayField: string | null = null;
            if (linkedRecords.length > 0) {
              const sampleFields = Object.keys(linkedRecords[0].fields || {});
              console.log(`🔍 Available fields in ${linkedTableName}:`, sampleFields);
              
              // Priority order for finding display field:
              // 1. Fields containing 'name' or 'title'
              // 2. Fields containing 'id' (but not created/modified timestamps)
              // 3. First text/number field
              displayField = sampleFields.find(field => 
                field.toLowerCase().includes('name') || 
                field.toLowerCase().includes('title')
              ) || sampleFields.find(field => 
                field.toLowerCase().includes('id') && 
                !field.toLowerCase().includes('modified') && 
                !field.toLowerCase().includes('created')
              ) || sampleFields.find(field => {
                const value = linkedRecords[0].fields[field];
                return value && (typeof value === 'string' || typeof value === 'number') && 
                       !Array.isArray(value);
              });
              
              console.log(`📊 Using field "${displayField}" as display field for ${linkedTableName}`);
            }
            
            linkedRecords.forEach((rec: any) => {
              let name;
              
              if (displayField && rec.fields?.[displayField]) {
                name = rec.fields[displayField];
                // Truncate if too long
                if (typeof name === 'string' && name.length > 50) {
                  name = name.substring(0, 50) + '...';
                }
              } else {
                // Fallback to record ID
                name = rec.id;
              }
              
              recordMap.set(rec.id, name);
            });
            
            // Create options only for the record IDs we actually found in the data
            linkedRecordOptions[linkedFieldName] = recordIds
              .filter(id => recordMap.has(id))
              .map(id => ({
                value: id, // Use the ID as the value (for API calls)
                label: recordMap.get(id)!, // Use the name as the label (for display)
                id: id // Keep the original ID
              }));
            
            // Add any records we found that weren't in our original list (for completeness)
            const existingIds = new Set(recordIds);
            linkedRecords.forEach((rec: any) => {
              if (!existingIds.has(rec.id)) {
                let name;
                
                if (displayField && rec.fields?.[displayField]) {
                  name = rec.fields[displayField];
                  // Truncate if too long
                  if (typeof name === 'string' && name.length > 50) {
                    name = name.substring(0, 50) + '...';
                  }
                } else {
                  // Fallback to record ID
                  name = rec.id;
                }
                
                linkedRecordOptions[linkedFieldName].push({
                  value: rec.id, // Use the ID as the value (for API calls)
                  label: name, // Use the name as the label (for display)
                  id: rec.id
                });
              }
            });
            
            console.log(`🔍 Mapped ${linkedRecordOptions[linkedFieldName].length} linked records for field ${linkedFieldName}`);
          }
        } catch (error) {
          console.log(`Could not fetch linked records for ${linkedFieldName}:`, error);
          // Fall back to using the IDs if we can't fetch the names
          linkedRecordOptions[linkedFieldName] = recordIds.map(id => ({
            value: id,
            label: `Record ${id}`,
            id: id
          }));
        }
      }
      
      // Convert to array and process values
      const fields = Array.from(fieldMap.values()).map(field => {
        const uniqueValues = Array.from(field.values);
        
        // Determine if this should be a dropdown
        let choices = null;
        
        if (field.isLinkedRecord && linkedRecordOptions[field.name]) {
          // Use the fetched linked record options
          choices = linkedRecordOptions[field.name];
        } else if (uniqueValues.length <= 20 && uniqueValues.length > 0) {
          // Check if all values are strings/numbers (not objects)
          const areSimpleValues = uniqueValues.every(v => 
            typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
          );
          
          if (areSimpleValues) {
            choices = uniqueValues.map(v => ({
              value: v,
              label: String(v),
              id: String(v)
            }));
          }
        }
        
        return {
          ...field,
          choices,
          values: undefined, // Remove the Set
          isLinkedRecord: undefined // Remove internal flag
        };
      });
      
      const schemaData = {
        table: {
          name: tableName,
          id: tableName
        },
        fields,
        sampleValues: {}
      };
      
      console.log('🔍 Inferred table schema:', schemaData);
      setAirtableTableSchema(schemaData);
      
      // Set dynamicOptions for linked fields immediately
      const linkedFieldOptions: Record<string, any[]> = {};
      fields.forEach((field: any) => {
        if ((field.isLinkedRecord || field.type === 'multipleRecordLinks' || field.type === 'singleRecordLink') && field.choices && field.choices.length > 0) {
          const fieldName = `airtable_field_${field.id}`;
          linkedFieldOptions[fieldName] = field.choices;
          console.log(`🔍 Setting dynamic options for linked field ${field.name} (${fieldName}):`, field.choices.length, 'options');
        }
      });
      
      if (Object.keys(linkedFieldOptions).length > 0) {
        setDynamicOptions(prev => ({
          ...prev,
          ...linkedFieldOptions
        }));
        console.log('🔍 Updated dynamicOptions with linked field choices');
      }
      
      // Only clear dynamic field values if this is the initial load or table changed
      // Don't clear if we're just updating the schema for the same table
      const currentTableName = values.tableName;
      if (!airtableTableSchema || airtableTableSchema.table?.name !== tableName) {
        console.log('🔍 Clearing dynamic fields due to table change');
        Object.keys(values).forEach(key => {
          if (key.startsWith('airtable_field_')) {
            setValue(key, '');
          }
        });
      }
      
    } catch (error) {
      console.error('Error fetching Airtable table schema:', error);
      setAirtableTableSchema(null);
    } finally {
      setIsLoadingTableSchema(false);
    }
  }, [setValue, values, getIntegrationByProvider]);
  
  // Helper function to infer field type from value
  const inferFieldType = (value: any): string => {
    if (value === null || value === undefined) return 'singleLineText';
    if (typeof value === 'boolean') return 'checkbox';
    if (typeof value === 'number') return 'number';
    if (Array.isArray(value)) {
      if (value.length > 0 && typeof value[0] === 'object' && value[0].url) {
        return 'multipleAttachments';
      }
      return 'multipleSelects';
    }
    if (typeof value === 'string') {
      // Check for common patterns
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
      if (/^https?:\/\//.test(value)) return 'url';
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'email';
      if (value.includes('\n')) return 'multilineText';
      return 'singleLineText';
    }
    return 'singleLineText';
  };

  // Function to invite bot to Discord server
  const handleInviteBot = useCallback((guildId?: string) => {
    console.log('🔍 Discord invite bot called:', { 
      discordClientId: discordClientId ? 'Present' : 'Missing',
      isDiscordBotConfigured,
      guildId 
    });
    
    if (!discordClientId) {
      console.error('Discord client ID not available - cannot open OAuth flow');
      return;
    }
    
    // Discord permissions needed for sending messages:
    // VIEW_CHANNEL (0x400) + SEND_MESSAGES (0x800) + EMBED_LINKS (0x4000) + ATTACH_FILES (0x8000) + USE_EXTERNAL_EMOJIS (0x40000) + ADD_REACTIONS (0x40)
    const permissions = '77888'; // Combined permissions
    let inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${discordClientId}&permissions=${permissions}&scope=bot%20applications.commands`;
    
    // If we have a specific guild ID, add it to the URL to pre-select the server
    if (guildId) {
      inviteUrl += `&guild_id=${guildId}`;
    }
    
    console.log('🔍 Opening Discord OAuth popup with URL:', inviteUrl);
    
    // Set loading state
    setIsBotConnectionInProgress(true);
    
    // Open popup window for Discord OAuth
    const popup = window.open(
      inviteUrl, 
      'discord-bot-auth',
      'width=500,height=700,scrollbars=yes,resizable=yes,status=yes,location=yes,toolbar=no,menubar=no'
    );
    
    if (!popup) {
      setIsBotConnectionInProgress(false);
      alert('Popup blocked! Please allow popups for this site and try again.');
      return;
    }
    
    // Track if we detected a success page for auto-close timing
    let successPageDetectedAt = null;
    
    // Monitor the popup for completion
    const checkPopup = setInterval(async () => {
      try {
        // Try to access popup URL to detect Discord success page
        let successDetected = false;
        
        try {
          if (popup.location && popup.location.href) {
            const url = popup.location.href;
            console.log('🔍 Popup URL:', url);
            
            // Enhanced success detection patterns
            if (url.includes('discord.com')) {
              // Check for exact success patterns
              const isAuthorized = url.includes('/oauth2/authorized') || url.includes('oauth2/authorized');
              const hasSuccess = url.toLowerCase().includes('success');
              const hasPermissions = url.includes('permissions=');
              const hasGuildId = url.includes('guild_id');
              const hasCode = url.includes('code=');
              
              console.log('🔍 Discord URL analysis:', {
                url,
                isAuthorized,
                hasSuccess,
                hasPermissions,
                hasGuildId,
                hasCode
              });
              
              if (isAuthorized || hasSuccess || hasPermissions || hasGuildId || hasCode) {
                console.log('✅ Discord OAuth success detected, auto-closing popup...');
                successDetected = true;
                popup.close();
                return; // Let the closed handler take over
              }
            }
          }
        } catch (crossOriginError) {
          // Cross-origin restriction - try alternative detection methods
          console.log('🔍 Cross-origin blocked, trying alternative detection methods...');
          
          try {
            // Check if popup title changed (sometimes accessible even with CORS)
            if (popup.document && popup.document.title) {
              const title = popup.document.title.toLowerCase();
              console.log('🔍 Popup title:', title);
              if (title.includes('success') || title.includes('authorized') || title.includes('complete') || title.includes('discord')) {
                console.log('✅ Discord OAuth success detected via title, auto-closing popup...');
                successDetected = true;
                popup.close();
                return;
              }
            }
          } catch (titleError) {
            console.log('🔍 Title check also blocked by CORS');
          }
          
          try {
            // Try to detect if popup content contains success indicators
            if (popup.document && popup.document.body) {
              const bodyText = popup.document.body.innerText.toLowerCase();
              console.log('🔍 Popup body text (first 200 chars):', bodyText.substring(0, 200));
              if (bodyText.includes('success') || bodyText.includes('authorized') || bodyText.includes('you may now close')) {
                console.log('✅ Discord OAuth success detected via content, auto-closing popup...');
                successDetected = true;
                popup.close();
                return;
              }
            }
          } catch (contentError) {
            console.log('🔍 Content check also blocked by CORS');
          }
        }
        
        // Fallback: Auto-close after detecting success page for a few seconds
        try {
          if (popup.location && popup.location.href && popup.location.href.includes('oauth2/authorized')) {
            if (!successPageDetectedAt) {
              successPageDetectedAt = Date.now();
              console.log('🔍 Success page detected, will auto-close in 3 seconds if still open...');
            } else if (Date.now() - successPageDetectedAt > 3000) {
              // Auto-close after 3 seconds on success page
              console.log('✅ Auto-closing popup after 3 seconds on success page');
              popup.close();
              return;
            }
          }
        } catch (e) {
          // Ignore cross-origin errors
        }
        
        // Check if popup is closed (user finished or cancelled)
        if (popup.closed) {
          console.log('🔍 Discord OAuth popup closed');
          clearInterval(checkPopup);
          setIsBotConnectionInProgress(false);
          
          if (guildId) {
            console.log('🔍 Popup closed for guild:', guildId, '- starting immediate bot status check...');
            
            // Immediately show loading state by clearing bot status
            setBotStatus(null);
            
            // Start checking immediately with shorter initial delay
            setTimeout(async () => {
              try {
                console.log('🔍 First bot status check after popup close...');
                await checkBotStatus(guildId);
                console.log('🔍 Initial bot status check completed');
                
                // Quick retry if still not detected (Discord can be slow)
                setTimeout(async () => {
                  // Only retry if we haven't detected the bot yet
                  if (!botStatus?.isInGuild) {
                    console.log('🔍 Bot still not detected, trying second check...');
                    await checkBotStatus(guildId);
                    console.log('🔍 Second bot status check completed');
                    
                    // Final retry with longer delay
                    setTimeout(async () => {
                      if (!botStatus?.isInGuild) {
                        console.log('🔍 Bot still not detected, trying final check...');
                        await checkBotStatus(guildId);
                        console.log('🔍 Final bot status check completed');
                      }
                    }, 8000); // 8 second final retry
                  }
                }, 3000); // 3 second quick retry
              } catch (error) {
                console.error('Error checking bot status after OAuth:', error);
              }
            }, 1000); // Only wait 1 second initially for faster feedback
          } else {
            console.log('🔍 No guildId available for bot status check');
          }
        }
      } catch (error) {
        console.error('Error in popup monitoring:', error);
      }
    }, 300); // Check more frequently (every 300ms) for better responsiveness
    
    // Safety cleanup after 5 minutes
    setTimeout(() => {
      clearInterval(checkPopup);
      if (!popup.closed) {
        popup.close();
      }
    }, 300000);
    
  }, [discordClientId, isDiscordBotConfigured, checkBotInServer, loadOptions]);

  // Check Discord configuration on mount only for Discord nodes
  useEffect(() => {
    if (nodeInfo?.providerId !== 'discord') return;
    
    const fetchDiscordConfig = async () => {
      try {
        const response = await fetch('/api/discord/config');
        const data = await response.json();
        
        console.log('🔍 Discord configuration check on mount:', data);
        
        if (data.configured && data.clientId) {
          setIsDiscordBotConfigured(true);
          setDiscordClientId(data.clientId);
        } else {
          setIsDiscordBotConfigured(false);
          setDiscordClientId(null);
        }
      } catch (error) {
        console.error('Error fetching Discord config:', error);
        setIsDiscordBotConfigured(false);
        setDiscordClientId(null);
      }
    };

    fetchDiscordConfig();
  }, [nodeInfo?.providerId]);

  // Load initial values when component mounts or nodeInfo changes
  useEffect(() => {
    if (!nodeInfo?.configSchema) return;

    console.log('🔍 [ConfigForm] Debug - Loading config for node:', {
      currentNodeId,
      nodeType: nodeInfo?.type,
      hasInitialData: !!initialData,
      initialDataKeys: initialData ? Object.keys(initialData) : [],
      initialDataValues: initialData
    });
    
    // Async function to load configuration
    const loadConfiguration = async () => {
      console.log('🔄 [ConfigForm] Starting loadConfiguration function');
      setIsLoadingInitialConfig(true); // Prevent field change handlers during load
      
      let configLoaded = false;
      let configToUse = {};
      
      console.log('🔍 [ConfigForm] Checking conditions for persistence loading:', {
        hasCurrentNodeId: !!currentNodeId,
        hasNodeInfoType: !!nodeInfo?.type,
        currentNodeId,
        nodeType: nodeInfo?.type
      });
      
      // First, try to load from persistence system (Supabase)
      if (currentNodeId && nodeInfo?.type) {
        const workflowId = getWorkflowId();
        console.log('🔍 [ConfigForm] Got workflowId:', workflowId);
        
        if (workflowId) {
          console.log('🔍 [ConfigForm] Calling loadNodeConfig with:', {
            workflowId,
            nodeId: currentNodeId,
            nodeType: nodeInfo.type
          });
          
          try {
            // Try persistence system (async)
            const savedNodeData = await loadNodeConfig(workflowId, currentNodeId, nodeInfo.type);
            console.log('🔍 [ConfigForm] loadNodeConfig returned:', savedNodeData);
            
            if (savedNodeData) {
              console.log('📋 [ConfigForm] Loading configuration from persistence system:', savedNodeData);
              configLoaded = true;
              configToUse = savedNodeData.config || {};
              
              // Apply saved configuration to form values
              Object.entries(configToUse).forEach(([key, value]) => {
                if (value !== undefined) {
                  setValue(key, value);
                }
              });
              
              console.log('✅ [ConfigForm] Configuration loaded from persistence system');
              
              // If we have saved dynamic options, restore them
              if (savedNodeData.dynamicOptions) {
                console.log('📋 [ConfigForm] Found saved dynamic options for node');
              }
            } else {
              console.log('🔍 [ConfigForm] No saved configuration found in persistence system');
            }
          } catch (error) {
            console.error('❌ [ConfigForm] Error loading from persistence system:', error);
          }
        } else {
          console.log('⚠️ [ConfigForm] No workflowId available');
        }
      } else {
        console.log('⚠️ [ConfigForm] Missing required data for persistence loading');
      }
      
      // Fallback to initialData if no saved configuration was found
      if (!configLoaded && initialData && Object.keys(initialData).length > 0) {
        console.log('📋 Loading configuration from initialData (fallback):', initialData);
        configLoaded = true;
        configToUse = initialData;
        
        // Apply initialData to form values
        Object.entries(initialData).forEach(([key, value]) => {
          if (value !== undefined) {
            setValue(key, value);
          }
        });
        
        console.log('✅ Configuration loaded from initialData (fallback)');
      }
      
      // If no configuration was loaded at all, log it
      if (!configLoaded) {
        console.log('⚠️ No configuration loaded - neither from persistence nor initialData');
      }
      
      // Load dependent options for Discord actions if we loaded any config (silently in background)
      if (configLoaded && nodeInfo?.providerId === 'discord') {
        // Use setTimeout to ensure the form values have been set before loading dependent options
        setTimeout(async () => {
          try {
            const config = configToUse as Record<string, any>;
            
            // Load channels silently if we have a guildId
            if (config.guildId) {
              console.log('🔄 Loading channels silently for saved guildId:', config.guildId);
              await loadOptions('channelId', 'guildId', config.guildId, false, true); // silent=true
            }
            
            // Load messages silently if we have both guildId and channelId
            if (config.guildId && config.channelId) {
              console.log('🔄 Loading messages silently for saved channelId:', config.channelId);
              await loadOptions('messageId', 'channelId', config.channelId, false, true); // silent=true
            }
          } catch (error) {
            console.error('Failed to load dependent options for saved config:', error);
          }
        }, 100);
      }
      
      // Clear the loading flag after everything is done
      setTimeout(() => {
        setIsLoadingInitialConfig(false);
        console.log('🔕 [ConfigForm] Initial configuration loading completed');
      }, 200); // Small delay to ensure all setValue calls are processed
    };
    
    // Execute the async loading function with error handling
    loadConfiguration().catch(error => {
      console.error('❌ [ConfigForm] Error in loadConfiguration:', error);
    });

    // Initialize form values from config schema for any missing values
    nodeInfo.configSchema.forEach(field => {
      if (field.defaultValue !== undefined && !values[field.name]) {
        setValue(field.name, field.defaultValue);
      }
    });

    // Initialize form values only once
    if (!hasInitialized) {
      setHasInitialized(true);
    }
    
    // Set default Discord bot status for better UX (only once)
    if (nodeInfo.providerId === 'discord' && !botStatus && hasInitialized) {
      setBotStatus({
        isInGuild: true,
        hasPermissions: true
      });
    }
  }, [nodeInfo?.configSchema, nodeInfo?.providerId, hasInitialized, currentWorkflow, currentNodeId, initialData, loadOptions]);

  /**
   * Handle Discord connection
   */
  const handleConnectDiscord = useCallback(async () => {
    try {
      await connectIntegration('discord');
    } catch (error) {
      console.error('Failed to connect Discord:', error);
    }
  }, [connectIntegration]);

  /**
   * Progressive field disclosure for Discord actions
   */
  const renderDiscordProgressiveConfig = () => {
    const guildField = nodeInfo?.configSchema?.find(field => field.name === 'guildId');
    const channelField = nodeInfo?.configSchema?.find(field => field.name === 'channelId');
    
    // Step 1: Show connection prompt if Discord is not connected
    if (!discordIntegration) {
      return (
        <ScrollArea className="h-[calc(90vh-180px)] pr-4">
          <div className="space-y-4 p-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-blue-800">Connect Discord</h3>
              <p className="text-sm text-blue-700 mt-1">
                Connect your Discord account to configure this action and access your servers.
              </p>
              <Button
                variant="default"
                className="mt-3 text-sm bg-[#5865F2] hover:bg-[#4752C4] text-white"
                onClick={handleConnectDiscord}
                disabled={loadingDynamic}
              >
                {loadingDynamic ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    Connecting...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0190 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1568 2.4189Z"/>
                    </svg>
                    Connect Discord
                  </div>
                )}
              </Button>
            </div>
          </div>
        </ScrollArea>
      );
    }

    // Step 2: Show only server field initially
    if (guildField && !values.guildId) {
      return (
        <ScrollArea className="h-[calc(90vh-180px)] pr-4">
          <div className="space-y-6 p-4">
            <FieldRenderer
              field={guildField}
              value={values.guildId || ""}
              onChange={(value) => handleFieldChange('guildId', value)}
              error={errors.guildId}
              dynamicOptions={dynamicOptions}
              loadingDynamic={loadingFields.has('guildId')}
              onDynamicLoad={handleDynamicLoad}
              nodeInfo={nodeInfo}
            />
          </div>
        </ScrollArea>
      );
    }

    // For actions without channel field (like create category, fetch members), show remaining fields after server selection
    if (!channelField && values.guildId && botStatus?.isInGuild && botStatus?.hasPermissions) {
      // Get all fields except guildId (already shown)
      const remainingFields = nodeInfo?.configSchema?.filter(field => 
        field.name !== 'guildId' && 
        !shouldHideField(field, values)
      ) || [];

      return (
        <ScrollArea className="h-[calc(90vh-180px)] pr-4">
          <div className="space-y-6 p-4">
            <FieldRenderer
              field={guildField}
              value={values.guildId || ""}
              onChange={(value) => handleFieldChange('guildId', value)}
              error={errors.guildId}
              dynamicOptions={dynamicOptions}
              loadingDynamic={loadingFields.has('guildId')}
              onDynamicLoad={handleDynamicLoad}
              nodeInfo={nodeInfo}
            />
            

            {/* Show remaining fields */}
            {remainingFields.map((field: any) => (
              <FieldRenderer
                key={field.name}
                field={field}
                value={values[field.name]}
                onChange={(value) => handleFieldChange(field.name, value)}
                error={errors[field.name]}
                workflowData={workflowData}
                currentNodeId={currentNodeId}
                dynamicOptions={dynamicOptions}
                loadingDynamic={loadingFields.has(field.name)}
                nodeInfo={nodeInfo}
                onDynamicLoad={handleDynamicLoad}
              />
            ))}
          </div>
        </ScrollArea>
      );
    }

    // Step 3: Server selected - check bot connection status
    if (values.guildId && (!botStatus || isBotStatusChecking)) {
      // Bot status checking or not started yet
      return (
        <ScrollArea className="h-[calc(90vh-180px)] pr-4">
          <div className="space-y-6 p-4">
            <FieldRenderer
              field={guildField}
              value={values.guildId || ""}
              onChange={(value) => handleFieldChange('guildId', value)}
              error={errors.guildId}
              dynamicOptions={dynamicOptions}
              loadingDynamic={loadingFields.has('guildId')}
              onDynamicLoad={handleDynamicLoad}
              nodeInfo={nodeInfo}
            />
            
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-transparent"></div>
                <span className="text-sm text-gray-700">Checking bot connection status...</span>
              </div>
            </div>
          </div>
        </ScrollArea>
      );
    }

    // For actions without channel field, handle bot status checking states
    if (!channelField && values.guildId && (!botStatus || isBotStatusChecking)) {
      // Bot status checking or not started yet for non-channel actions
      return (
        <ScrollArea className="h-[calc(90vh-180px)] pr-4">
          <div className="space-y-6 p-4">
            <FieldRenderer
              field={guildField}
              value={values.guildId || ""}
              onChange={(value) => handleFieldChange('guildId', value)}
              error={errors.guildId}
              dynamicOptions={dynamicOptions}
              loadingDynamic={loadingFields.has('guildId')}
              onDynamicLoad={handleDynamicLoad}
              nodeInfo={nodeInfo}
            />
            
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-transparent"></div>
                <span className="text-sm text-gray-700">Checking bot connection status...</span>
              </div>
            </div>
          </div>
        </ScrollArea>
      );
    }

    if (!channelField && values.guildId && botStatus && !botStatus.isInGuild) {
      return (
        <ScrollArea className="h-[calc(90vh-180px)] pr-4">
          <div className="space-y-6 p-4">
            <FieldRenderer
              field={guildField}
              value={values.guildId || ""}
              onChange={(value) => handleFieldChange('guildId', value)}
              error={errors.guildId}
              dynamicOptions={dynamicOptions}
              loadingDynamic={loadingFields.has('guildId')}
              onDynamicLoad={handleDynamicLoad}
              nodeInfo={nodeInfo}
            />
            
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-orange-800">Bot Connection Required</h3>
              <p className="text-sm text-orange-700 mt-1">
                The Discord bot needs to be added to this server to use Discord actions. Click the button below to add the bot.
              </p>
              
              <Button
                type="button"
                variant="default"
                size="sm"
                className="mt-3 bg-[#5865F2] hover:bg-[#4752C4] text-white"
                onClick={() => handleAddBotToServer(values.guildId)}
                disabled={isBotConnectionInProgress}
              >
                {isBotConnectionInProgress ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    Adding Bot...
                  </div>
                ) : (
                  'Add Bot to Server'
                )}
              </Button>
            </div>
          </div>
        </ScrollArea>
      );
    }

    if (!channelField && values.guildId && botStatus?.isInGuild && !botStatus.hasPermissions) {
      return (
        <ScrollArea className="h-[calc(90vh-180px)] pr-4">
          <div className="space-y-6 p-4">
            <FieldRenderer
              field={guildField}
              value={values.guildId || ""}
              onChange={(value) => handleFieldChange('guildId', value)}
              error={errors.guildId}
              dynamicOptions={dynamicOptions}
              loadingDynamic={loadingFields.has('guildId')}
              onDynamicLoad={handleDynamicLoad}
              nodeInfo={nodeInfo}
            />
            
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-yellow-800">Bot Needs Additional Permissions</h3>
              <p className="text-sm text-yellow-700 mt-1">
                The Discord bot is connected to this server but needs additional permissions. Click the button below to update bot permissions.
              </p>
              
              <Button
                type="button"
                variant="default"
                size="sm"
                className="mt-3 bg-[#5865F2] hover:bg-[#4752C4] text-white"
                onClick={() => handleAddBotToServer(values.guildId)}
                disabled={isBotConnectionInProgress}
              >
                {isBotConnectionInProgress ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    Updating Permissions...
                  </div>
                ) : (
                  'Update Bot Permissions'
                )}
              </Button>
            </div>
          </div>
        </ScrollArea>
      );
    }

    // Step 4: Bot not connected - show connect button (for channel-based actions)
    if (channelField && values.guildId && botStatus && !botStatus.isInGuild) {
      return (
        <ScrollArea className="h-[calc(90vh-180px)] pr-4">
          <div className="space-y-6 p-4">
            <FieldRenderer
              field={guildField}
              value={values.guildId || ""}
              onChange={(value) => handleFieldChange('guildId', value)}
              error={errors.guildId}
              dynamicOptions={dynamicOptions}
              loadingDynamic={loadingFields.has('guildId')}
              onDynamicLoad={handleDynamicLoad}
              nodeInfo={nodeInfo}
            />
            
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-orange-800">Bot Connection Required</h3>
              <p className="text-sm text-orange-700 mt-1">
                The Discord bot needs to be added to this server to use Discord actions. Click the button below to add the bot.
              </p>
              
              <Button
                type="button"
                variant="default"
                className="mt-3 text-sm bg-orange-600 hover:bg-orange-700 text-white"
                onClick={() => handleInviteBot(values.guildId)}
                disabled={isBotConnectionInProgress}
              >
                {isBotConnectionInProgress ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    Connecting Bot...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0190 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1568 2.4189Z"/>
                    </svg>
                    Connect Bot to Server
                  </div>
                )}
              </Button>
            </div>
          </div>
        </ScrollArea>
      );
    }

    // Step 4.5: Bot connected but lacks permissions - show reconnect button
    if (values.guildId && botStatus?.isInGuild && !botStatus.hasPermissions) {
      return (
        <ScrollArea className="h-[calc(90vh-180px)] pr-4">
          <div className="space-y-6 p-4">
            <FieldRenderer
              field={guildField}
              value={values.guildId || ""}
              onChange={(value) => handleFieldChange('guildId', value)}
              error={errors.guildId}
              dynamicOptions={dynamicOptions}
              loadingDynamic={loadingFields.has('guildId')}
              onDynamicLoad={handleDynamicLoad}
              nodeInfo={nodeInfo}
            />
            
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-yellow-800">Bot Needs Additional Permissions</h3>
              <p className="text-sm text-yellow-700 mt-1">
                The Discord bot is connected to this server but needs additional permissions to view channels. Click the button below to update bot permissions.
              </p>
              
              <Button
                type="button"
                variant="default"
                className="mt-3 text-sm bg-yellow-600 hover:bg-yellow-700 text-white"
                onClick={() => handleInviteBot(values.guildId)}
                disabled={isBotConnectionInProgress}
              >
                {isBotConnectionInProgress ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    Updating Permissions...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
                    </svg>
                    Update Bot Permissions
                  </div>
                )}
              </Button>
            </div>
          </div>
        </ScrollArea>
      );
    }

    // Step 5: Bot connected with permissions, show server and channel fields
    if (values.guildId && botStatus?.isInGuild && botStatus?.hasPermissions && channelField && !values.channelId) {
      // Check if channels are currently loading
      const channelsLoading = loadingFields.has('channelId');
      const hasChannelOptions = dynamicOptions.channelId && dynamicOptions.channelId.length > 0;
      
      return (
        <ScrollArea className="h-[calc(90vh-180px)] pr-4">
          <div className="space-y-6 p-4">
            <FieldRenderer
              field={guildField}
              value={values.guildId || ""}
              onChange={(value) => handleFieldChange('guildId', value)}
              error={errors.guildId}
              dynamicOptions={dynamicOptions}
              loadingDynamic={loadingFields.has('guildId')}
              onDynamicLoad={handleDynamicLoad}
              nodeInfo={nodeInfo}
            />
            
            
            
            {/* Always show channel field - it will handle its own loading state */}
            <FieldRenderer
              field={channelField}
              value={values.channelId || ""}
              onChange={(value) => handleFieldChange('channelId', value)}
              error={errors.channelId}
              dynamicOptions={dynamicOptions}
              loadingDynamic={loadingFields.has('channelId')}
              onDynamicLoad={handleDynamicLoad}
              nodeInfo={nodeInfo}
            />
          </div>
        </ScrollArea>
      );
    }

    // Step 6: Channel selected, show all remaining fields
    if (values.guildId && values.channelId) {
      // Get all fields except guildId and channelId (already shown)
      // For remove reaction actions, also exclude emoji field as it will be handled by DiscordReactionSelector
      const remainingFields = nodeInfo?.configSchema?.filter(field => 
        field.name !== 'guildId' && 
        field.name !== 'channelId' && 
        !(nodeInfo?.type === 'discord_action_remove_reaction' && field.name === 'emoji')
      ) || [];
      
      return (
        <ScrollArea className="h-[calc(90vh-180px)] pr-4">
          <div className="space-y-6 p-4">
            <FieldRenderer
              field={guildField}
              value={values.guildId || ""}
              onChange={(value) => handleFieldChange('guildId', value)}
              error={errors.guildId}
              dynamicOptions={dynamicOptions}
              loadingDynamic={loadingFields.has('guildId')}
              onDynamicLoad={handleDynamicLoad}
              nodeInfo={nodeInfo}
            />
            
            <FieldRenderer
              field={channelField}
              value={values.channelId || ""}
              onChange={(value) => handleFieldChange('channelId', value)}
              error={errors.channelId}
              dynamicOptions={dynamicOptions}
              loadingDynamic={loadingFields.has('channelId')}
              onDynamicLoad={handleDynamicLoad}
              nodeInfo={nodeInfo}
            />
            
            
            {/* Render remaining fields */}
            {remainingFields.map((field, index) => (
              <React.Fragment key={`discord-field-${field.name}-${index}`}>
                <FieldRenderer
                  field={field}
                  value={values[field.name]}
                  onChange={(value) => handleFieldChange(field.name, value)}
                  error={errors[field.name]}
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  dynamicOptions={dynamicOptions}
                  loadingDynamic={loadingFields.has(field.name)}
                  nodeInfo={nodeInfo}
                  onDynamicLoad={handleDynamicLoad}
                />
                
                {/* Show Discord Reaction Selector after messageId field for remove reaction actions */}
                {field.name === 'messageId' && nodeInfo?.type === 'discord_action_remove_reaction' && values.messageId && values.channelId && (
                  <DiscordReactionSelector
                    channelId={values.channelId}
                    messageId={values.messageId}
                    selectedEmoji={values.emoji}
                    onSelect={(emojiValue) => handleFieldChange('emoji', emojiValue)}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </ScrollArea>
      );
    }

    // Fallback - shouldn't reach here but show basic fields if we do
    return (
      <div className="space-y-6 p-4">
        {nodeInfo?.configSchema?.map((field, index) => (
          <FieldRenderer
            key={`fallback-field-${field.name}-${index}`}
            field={field}
            value={values[field.name]}
            onChange={(value) => handleFieldChange(field.name, value)}
            error={errors[field.name]}
            workflowData={workflowData}
            currentNodeId={currentNodeId}
            dynamicOptions={dynamicOptions}
            loadingDynamic={loadingFields.has(field.name)}
            nodeInfo={nodeInfo}
            allValues={values}
            onDynamicLoad={loadOptions}
          />
        )) || []}
      </div>
    );
  };

  /**
   * Load Airtable records for the selected table
   */
  const loadAirtableRecords = useCallback(async (baseId: string, tableName: string) => {
    try {
      setLoadingRecords(true);
      
      const integration = getIntegrationByProvider('airtable');
      if (!integration) {
        console.warn('No Airtable integration found');
        return;
      }

      console.log('🔍 Loading Airtable records:', { baseId, tableName });
      
      // Call the Airtable-specific data API endpoint
      const response = await fetch('/api/integrations/airtable/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          integrationId: integration.id,
          dataType: 'airtable_records',
          options: {
            baseId,
            tableName,
            maxRecords: 50 // Limit for selection
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to load records: ${response.status}`);
      }

      const result = await response.json();
      const records = result.data || [];
      
      console.log('🔍 Loaded records:', records);
      console.log('🔍 Record count:', records?.length || 0);
      setAirtableRecords(records || []);
      
    } catch (error) {
      console.error('Error loading Airtable records:', error);
      setAirtableRecords([]);
    } finally {
      setLoadingRecords(false);
    }
  }, [getIntegrationByProvider]);

  /**
   * Load preview data for list records
   */
  const loadPreviewData = useCallback(async (baseId: string, tableName: string) => {
    try {
      setLoadingPreview(true);
      const integration = getIntegrationByProvider('airtable');
      if (!integration) {
        console.warn('No Airtable integration found');
        return;
      }

      // Get current form values to apply filters
      const {
        filterField,
        filterValue,
        dateFilter,
        customDateRange,
        recordLimit,
        maxRecords
      } = values;

      console.log('🔍 Loading filtered records for preview:', { 
        baseId, 
        tableName, 
        filterField, 
        filterValue, 
        dateFilter, 
        recordLimit,
        hasCustomRange: !!customDateRange
      });
      
      // Build options object with filters
      const options: any = {
        baseId,
        tableName,
        maxRecords: 100 // Base limit for preview
      };

      // Apply record limit filter
      if (recordLimit === 'custom_amount' && maxRecords) {
        options.maxRecords = Math.min(parseInt(maxRecords) || 100, 100); // Cap at 100 for preview
      }

      // Apply field filter
      if (filterField && filterValue) {
        options.filterByFormula = `{${filterField}} = "${filterValue}"`;
        console.log('🔍 Applying field filter:', options.filterByFormula);
      }

      // Apply date filter
      if (dateFilter && dateFilter !== 'all_time') {
        if (dateFilter === 'custom_date_range' && customDateRange) {
          const startDate = customDateRange.startDate;
          const endDate = customDateRange.endDate;
          if (startDate && endDate) {
            // Find a date field to filter on (common date field names)
            const dateFieldCandidates = ['Created Time', 'Modified Time', 'Date', 'Created', 'Updated'];
            const dateFieldToUse = dateFieldCandidates[0]; // Use first as fallback
            const dateFormula = `AND(IS_AFTER({${dateFieldToUse}}, "${startDate}"), IS_BEFORE({${dateFieldToUse}}, "${endDate}"))`;
            
            if (options.filterByFormula) {
              options.filterByFormula = `AND(${options.filterByFormula}, ${dateFormula})`;
            } else {
              options.filterByFormula = dateFormula;
            }
            console.log('🔍 Applying custom date filter:', dateFormula);
          }
        } else {
          // Apply predefined date filters
          const dateFieldToUse = 'Created Time'; // Default date field
          let dateFormula = '';
          
          const now = new Date();
          switch (dateFilter) {
            case 'last_24_hours':
              const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
              dateFormula = `IS_AFTER({${dateFieldToUse}}, "${yesterday.toISOString()}")`;
              break;
            case 'last_week':
              const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
              dateFormula = `IS_AFTER({${dateFieldToUse}}, "${weekAgo.toISOString()}")`;
              break;
            case 'last_month':
              const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
              dateFormula = `IS_AFTER({${dateFieldToUse}}, "${monthAgo.toISOString()}")`;
              break;
          }
          
          if (dateFormula) {
            if (options.filterByFormula) {
              options.filterByFormula = `AND(${options.filterByFormula}, ${dateFormula})`;
            } else {
              options.filterByFormula = dateFormula;
            }
            console.log('🔍 Applying date filter:', dateFormula);
          }
        }
      }
      
      // Call the Airtable-specific data API endpoint
      const response = await fetch('/api/integrations/airtable/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          integrationId: integration.id,
          dataType: 'airtable_records',
          options
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to load preview data: ${response.status}`);
      }

      const result = await response.json();
      const records = result.data || [];

      console.log('🔍 Filtered records loaded for preview:', records);
      console.log('🔍 Total filtered record count:', records?.length || 0);
      setPreviewData(records || []);
      setShowPreviewData(true);
    } catch (error) {
      console.error('Error loading preview data:', error);
      setPreviewData([]);
      setShowPreviewData(true); // Still show preview area to display error message
    } finally {
      setLoadingPreview(false);
    }
  }, [getIntegrationByProvider, values]);

  /**
   * Test configuration handler
   */
  const handleTest = useCallback(async () => {
    if (!nodeInfo) return;
    
    setIsTestLoading(true);
    
    try {
      // Prepare test data
      const testData = {
        nodeType: nodeInfo.type,
        config: values,
        nodeId: currentNodeId || "test"
      };
      
      // Call test API
      const response = await fetch("/api/workflows/test-node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testData)
      });
      
      const result = await response.json();
      
    } catch (error) {
      console.error("Test error:", error);
    } finally {
      setIsTestLoading(false);
    }
  }, [nodeInfo, values, currentNodeId]);

  /**
   * Handle field value changes
   */
  const handleFieldChange = useCallback(async (fieldName: string, value: any) => {
    console.log('🔍 handleFieldChange called:', { fieldName, value, currentValues: values, isLoadingInitialConfig });
    console.log('🔍 Node info:', { type: nodeInfo?.type, providerId: nodeInfo?.providerId });
    
    // Update the form value
    setValue(fieldName, value);
    
    // Special handling for Google Docs preview
    if (nodeInfo?.type === 'google_docs_action_update_document' || 
        nodeInfo?.type === 'google_docs_action_share_document') {
      // When preview toggle is enabled or document changes while preview is on
      if ((fieldName === 'previewDocument' && value === 'true') || 
          (fieldName === 'documentId' && values.previewDocument === 'true')) {
        
        const docId = fieldName === 'documentId' ? value : values.documentId;
        
        if (docId) {
          console.log('📄 Fetching Google Docs preview for document:', docId);
          setValue('documentPreview', 'Loading document preview...');
          
          try {
            // Get the Google integration
            const integration = integrations.find(i => i.provider === 'google-docs' || i.provider === 'google');
            
            if (!integration) {
              setValue('documentPreview', '(No Google Docs integration found)');
              return;
            }
            
            // Fetch document preview using the Google API
            const response = await fetch('/api/integrations/google/data', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                integrationId: integration.id,
                dataType: 'google-docs-content',
                options: {
                  documentId: docId,
                  previewOnly: true
                }
              })
            });
            
            if (response.ok) {
              const result = await response.json();
              const preview = result.data?.preview || result.preview || '(Unable to load preview)';
              const hasMore = result.data?.hasMore || result.hasMore;
              
              if (hasMore) {
                setValue('documentPreview', preview + '\n\n... (document continues)');
              } else {
                setValue('documentPreview', preview);
              }
            } else {
              setValue('documentPreview', '(Unable to load document preview)');
            }
          } catch (error) {
            console.error('Error fetching document preview:', error);
            setValue('documentPreview', '(Error loading preview)');
          }
        } else {
          setValue('documentPreview', '(Select a document to preview)');
        }
      }
      
      // Clear preview when toggled off
      if (fieldName === 'previewDocument' && value === 'false') {
        setValue('documentPreview', '');
      }
    }
    
    // Skip Discord logic if we're currently loading initial configuration
    if (isLoadingInitialConfig) {
      console.log('🔕 Skipping Discord logic - loading initial configuration');
      return;
    }
    
    // Special handling for Discord trigger fields
    if (nodeInfo?.providerId === 'discord') {
      if (fieldName === 'guildId') {
        console.log('🔍 Handling Discord guildId change:', { fieldName, value });
        
        // For Discord triggers, only load the channels without other side effects
        if (nodeInfo.type === 'discord_trigger_new_message') {
          // Load all related data when guild is selected
          if (value) {
            console.log('🔍 Loading all Discord data for trigger with guildId:', value);
            
            // Load dependent options once per selection (non-blocking)
            loadOptions('channelId', 'guildId', value);
            loadOptions('filterAuthor', 'guildId', value);
          } else {
            console.log('🔍 Clearing dependent fields as guildId is empty');
            setValue('channelId', '');
            setValue('filterAuthor', '');
            setValue('contentFilter', '');
          }
        } 
        // For Discord actions, check bot status first then load channels
        else if (nodeInfo?.type?.startsWith('discord_action_')) {
          // Always clear all Discord-related states when server field changes
          setValue('channelId', '');
          setChannelBotStatus(null);
          setChannelLoadingError(null);
          setIsBotStatusChecking(true); // Start checking immediately without clearing bot status
          
          if (value && value.trim() !== '' && discordIntegration) {
            console.log('🔍 Server selected, checking bot status for Discord action with guildId:', value);
            
            // Load dependent options for Discord actions
            console.log('🔍 Loading dependent fields for Discord action with guildId:', value);
            loadOptions('channelId', 'guildId', value);
            loadOptions('filterAuthor', 'guildId', value);
            
            // Start bot status check which will trigger loading state in progressive disclosure UI
            checkBotStatus(value);
          } else {
            console.log('🔍 Server cleared or Discord not connected, keeping bot status null');
            // Keep botStatus as null - this will show just the server field in progressive disclosure
          }
        }
      }
      
      // Check channel bot status for Discord actions when channelId changes
      if (fieldName === 'channelId' && nodeInfo?.type?.startsWith('discord_action_')) {
        console.log('🔍 Handling Discord channelId change:', { fieldName, value });
        
        // Clear previous channel bot status
        setChannelBotStatus(null);
        
        if (value && values.guildId) {
          console.log('🔍 Checking bot status for channel:', value, 'in guild:', values.guildId);
          
          // Load messages for this channel if the action needs them
          const nodeFields = nodeInfo.configSchema || [];
          const hasMessageField = nodeFields.some(field => field.name === 'messageId');
          if (hasMessageField) {
            console.log('🔍 Loading messages for Discord action with channelId:', value);
            loadOptions('messageId', 'channelId', value);
          }
          
          checkChannelBotStatus(value, values.guildId);
        }
      }
      
      // Handle messageId changes for Discord actions - clear emoji field and trigger reaction loading
      if (fieldName === 'messageId' && nodeInfo?.type?.startsWith('discord_action_')) {
        console.log('🔍 Handling Discord messageId change:', { fieldName, value });
        
        // Clear the emoji field when message changes for remove reaction actions
        if (nodeInfo?.type === 'discord_action_remove_reaction') {
          setValue('emoji', '');
          console.log('🔍 Cleared emoji field for new message selection');
        }
        
        if (value && values.channelId && nodeInfo?.type === 'discord_action_remove_reaction') {
          console.log('🔍 Message selected for remove reaction action:', value, 'in channel:', values.channelId);
          // Reaction loading will be handled by the DiscordReactionSelector component
        }
      }
    }
    
    // Handle spreadsheetId changes for Google Sheets
    if (fieldName === 'spreadsheetId' && nodeInfo?.providerId === 'google-sheets') {
      console.log('🔍 Google Sheets spreadsheetId changed to:', value);
      
      // Clear dependent fields when spreadsheetId changes
      if (nodeInfo.configSchema) {
        nodeInfo.configSchema.forEach(field => {
          if (field.dependsOn === 'spreadsheetId') {
            console.log('🔍 Clearing dependent field:', field.name);
            setValue(field.name, '');
            if (value) {
              console.log('🔍 Loading options for:', field.name, 'with spreadsheetId:', value);
              // Set loading state for this field
              setLoadingFields(prev => new Set(prev).add(field.name));
              loadOptions(field.name, 'spreadsheetId', value, true).finally(() => {
                // Clear loading state when done
                setLoadingFields(prev => {
                  const newSet = new Set(prev);
                  newSet.delete(field.name);
                  return newSet;
                });
              });
            }
          }
        });
      }
    }
    
    // Handle baseId changes for Airtable
    if (fieldName === 'baseId' && nodeInfo?.providerId === 'airtable') {
      console.log('🔍 Airtable baseId changed to:', value);
      
      // Always set loading state first, even before clearing the value (exact filterField pattern)
      console.log('🔄 Setting loading state for tableName');
      setLoadingFields(prev => {
        const newSet = new Set(prev);
        newSet.add('tableName');
        console.log('🔄 Loading fields updated:', Array.from(newSet));
        return newSet;
      });
      
      // Clear tableName when baseId changes
      setValue('tableName', '');
      
      // Reset cached table options to ensure fresh load
      resetOptions('tableName');
      
      // Clear preview data when base changes for list records
      if (nodeInfo.type === 'airtable_action_list_records') {
        setShowPreviewData(false);
        setPreviewData([]);
      }
      
      // Force a small delay to ensure loading state is visible
      setTimeout(() => {
        // Load tableName options if a base is selected
        if (value) {
          console.log('🔍 Loading tableName options for baseId:', value);
          loadOptions('tableName', 'baseId', value, true).finally(() => {
            setLoadingFields(prev => {
              const newSet = new Set(prev);
              newSet.delete('tableName');
              return newSet;
            });
          });
        } else {
          // If no base is selected, clear the loading state
          setLoadingFields(prev => {
            const newSet = new Set(prev);
            newSet.delete('tableName');
            return newSet;
          });
        }
      }, 10); // 10ms delay to ensure loading state is visible (same as filterField)
      
      // For update/create/move record actions, clear records and dynamic fields
      if (nodeInfo.type === 'airtable_action_update_record' || 
          nodeInfo.type === 'airtable_action_create_record' || 
          nodeInfo.type === 'airtable_action_move_record') {
        setSelectedRecord(null);
        setAirtableRecords([]);
        setLoadingRecords(false);
        // Clear table schema and dynamic fields
        setAirtableTableSchema(null);
        // Clear all dynamic fields
        Object.keys(values).forEach(key => {
          if (key.startsWith('airtable_field_')) {
            setValue(key, '');
          }
        });
        
        // If a table is already selected when base changes, reload its schema for both create and update
        if ((nodeInfo.type === 'airtable_action_create_record' || nodeInfo.type === 'airtable_action_update_record') && values.tableName && value) {
          setIsLoadingTableSchema(true);
          // Small delay to ensure the table dropdown has updated
          setTimeout(() => {
            fetchAirtableTableSchema(value, values.tableName);
          }, 100);
        }
      }
    }
    
    // Handle tableName changes for Airtable
    if (fieldName === 'tableName' && nodeInfo?.providerId === 'airtable') {
      console.log('🔍 Airtable tableName changed to:', value);
      
      // For list records, clear any existing preview data when table changes
      if (nodeInfo.type === 'airtable_action_list_records') {
        setShowPreviewData(false);
        setPreviewData([]);
        
        // Load dependent fields for list records (like filterField)
        if (nodeInfo.configSchema && value) {
          nodeInfo.configSchema.forEach(field => {
            if (field.dependsOn === 'tableName') {
              console.log('🔍 Loading dependent field for list records:', field.name);
              setValue(field.name, ''); // Clear dependent field
              setLoadingFields(prev => new Set(prev).add(field.name));
              // For filterField, we need to pass baseId explicitly since form values are stale
              if (field.name === 'filterField') {
                console.log('🔍 Loading filterField with explicit baseId:', values.baseId);
                // Pass baseId explicitly in the options parameter
                loadOptions(field.name, 'tableName', value, true, false, { baseId: values.baseId }).finally(() => {
                  setLoadingFields(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(field.name);
                    return newSet;
                  });
                });
              } else {
                loadOptions(field.name, 'tableName', value, true).finally(() => {
                  setLoadingFields(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(field.name);
                    return newSet;
                  });
                });
              }
            }
          });
        }
      }
      
      // Clear record selection and dynamic fields when table changes for update/create/move records
      if (nodeInfo.type === 'airtable_action_update_record' || 
          nodeInfo.type === 'airtable_action_create_record' || 
          nodeInfo.type === 'airtable_action_move_record') {
        setSelectedRecord(null);
        setAirtableRecords([]);
        setLoadingRecords(false);
        
        // Clear table schema immediately to hide old fields
        setAirtableTableSchema(null);
        
        // Clear all dynamic fields
        Object.keys(values).forEach(key => {
          if (key.startsWith('airtable_field_')) {
            setValue(key, '');
          }
        });
        
        // Load records for the new table (only for update record)
        if (nodeInfo.type === 'airtable_action_update_record' && value && values.baseId) {
          loadAirtableRecords(values.baseId, value);
          // Also fetch table schema for update record to get proper field options
          setIsLoadingTableSchema(true);
          fetchAirtableTableSchema(values.baseId, value);
        }
        
        // Fetch table schema for create record to show dynamic fields
        if (nodeInfo.type === 'airtable_action_create_record' && value && values.baseId) {
          // Set loading state before fetching
          setIsLoadingTableSchema(true);
          fetchAirtableTableSchema(values.baseId, value);
        }
      }
    }
    
    // Handle filterField changes for Airtable - load filterValue options
    if (fieldName === 'filterField' && nodeInfo?.providerId === 'airtable' && nodeInfo?.type === 'airtable_action_list_records') {
      console.log('🔍 Airtable filterField changed to:', value);
      
      // Always set loading state first, even before clearing the value
      console.log('🔄 Setting loading state for filterValue');
      setLoadingFields(prev => {
        const newSet = new Set(prev);
        newSet.add('filterValue');
        console.log('🔄 Loading fields updated:', Array.from(newSet));
        return newSet;
      });
      
      // Clear filterValue when filterField changes
      setValue('filterValue', '');
      
      // Force a small delay to ensure loading state is visible
      setTimeout(() => {
      
        // Load filterValue options if a field is selected
        if (value && values.baseId && values.tableName) {
          console.log('🔍 Loading filterValue options for field:', value);
          console.log('🔍 Using explicit baseId and tableName:', { baseId: values.baseId, tableName: values.tableName });
          // Pass baseId and tableName explicitly in extraOptions to avoid stale form values
          loadOptions('filterValue', 'filterField', value, true, false, { 
            baseId: values.baseId, 
            tableName: values.tableName 
          }).finally(() => {
            setLoadingFields(prev => {
              const newSet = new Set(prev);
              newSet.delete('filterValue');
              return newSet;
            });
          });
        } else {
          // If no field is selected, clear the loading state
          setLoadingFields(prev => {
            const newSet = new Set(prev);
            newSet.delete('filterValue');
            return newSet;
          });
        }
      }, 10); // 10ms delay to ensure loading state is visible
    }
    
    // Don't auto-save configuration changes - let user save manually when they click Save or Listen
  }, [nodeInfo, setValue, loadOptions, values, discordIntegration, checkBotStatus, checkChannelBotStatus, checkBotInServer, currentNodeId, getWorkflowId, dynamicOptions, setShowPreviewData, setPreviewData, setSelectedRecord, setAirtableRecords, setLoadingRecords, loadAirtableRecords, isLoadingInitialConfig]);
  
  /**
   * Handle record selection from the Airtable records table
   */
  const handleRecordSelect = useCallback((record: any) => {
    console.log('🔍 Record selected:', record);
    setSelectedRecord(record);
    
    // Set the recordId value for the form (this is the hidden field)
    setValue('recordId', record.id);
    
    // First try to use the fetched table schema (preferred as it has better field info)
    let tableFields = airtableTableSchema?.fields;
    
    // Fall back to dynamicOptions if no schema available
    if (!tableFields) {
      const selectedTable = dynamicOptions?.tableName?.find((table: any) => 
        table.value === values.tableName
      );
      tableFields = selectedTable?.fields;
    }
    
    if (tableFields && record.fields) {
      console.log('🔍 Populating fields from record data:', record.fields);
      console.log('🔍 Available table fields:', tableFields);
      
      // Pre-populate dynamic fields with selected record data
      tableFields.forEach((tableField: any) => {
        const fieldName = `airtable_field_${tableField.id}`;
        const existingValue = record.fields[tableField.name];
        
        // Get field choices from schema if available
        let fieldChoices = tableField.choices;
        
        // If not in the current tableField, try to find in the airtableTableSchema
        if (!fieldChoices && airtableTableSchema?.fields) {
          const schemaField = airtableTableSchema.fields.find((f: any) => 
            f.id === tableField.id || f.name === tableField.name
          );
          if (schemaField) {
            fieldChoices = schemaField.choices;
            console.log(`🔍 Found choices for ${tableField.name} in schema:`, fieldChoices?.length || 0, 'options');
          }
        }
        
        // Determine field type
        let fieldType;
        if (airtableTableSchema?.fields) {
          // Use schema-based type detection if available
          fieldType = getAirtableFieldTypeFromSchema(tableField);
        } else {
          fieldType = getAirtableFieldType(tableField.type, isUpdateRecord);
        }
        
        // Skip file fields as they cannot be programmatically set due to security restrictions
        if (fieldType === 'file') {
          console.log(`🔍 Skipping file field ${tableField.name} (cannot pre-populate file inputs)`);
          return;
        }
        
        if (existingValue !== undefined && existingValue !== null) {
          // Handle different value types
          let valueToSet = existingValue;
          
          if (Array.isArray(existingValue)) {
            // For linked records (array of record IDs)
            if (tableField.type === 'multipleRecordLinks' || tableField.isLinkedRecord) {
              // Keep as IDs - the select component will handle display
              valueToSet = existingValue;
              console.log(`🔍 Linked record field ${tableField.name} with IDs:`, existingValue);
              
              // Log available choices for debugging
              if (fieldChoices && fieldChoices.length > 0) {
                console.log(`🔍 Available choices for ${tableField.name}:`, fieldChoices.map((c: any) => ({ value: c.value, label: c.label })));
              } else {
                console.log(`🔍 No choices available yet for ${tableField.name}`);
              }
            } 
            // For multiple select fields
            else if (tableField.type === 'multipleSelects' || fieldType === 'select') {
              // Keep as array for multi-select fields
              valueToSet = existingValue;
              console.log(`🔍 Multi-select field ${tableField.name} with values:`, existingValue);
            }
            // For other array types
            else {
              valueToSet = existingValue;
              console.log(`🔍 Array field ${tableField.name} with values:`, existingValue);
            }
          }
          // Handle single linked record
          else if (tableField.type === 'singleRecordLink' && typeof existingValue === 'string') {
            // Keep as ID - the select component will handle display
            valueToSet = existingValue;
            console.log(`🔍 Single linked record field ${tableField.name} with ID:`, existingValue);
            
            // Log available choices for debugging
            if (fieldChoices && fieldChoices.length > 0) {
              console.log(`🔍 Available choices for ${tableField.name}:`, fieldChoices.map((c: any) => ({ value: c.value, label: c.label })));
            } else {
              console.log(`🔍 No choices available yet for ${tableField.name}`);
            }
          }
          // Handle checkbox (boolean)
          else if (tableField.type === 'checkbox') {
            valueToSet = existingValue === true || existingValue === 1;
            console.log(`🔍 Checkbox field ${tableField.name} with value:`, valueToSet);
          }
          // Handle date fields
          else if (tableField.type === 'date' || tableField.type === 'dateTime') {
            // Ensure proper date format
            valueToSet = existingValue;
            console.log(`🔍 Date field ${tableField.name} with value:`, valueToSet);
          }
          // Handle number fields
          else if (tableField.type === 'number' || tableField.type === 'currency' || tableField.type === 'percent') {
            valueToSet = existingValue;
            console.log(`🔍 Number field ${tableField.name} with value:`, valueToSet);
          }
          // Default handling for text and other fields
          else {
            valueToSet = existingValue;
            console.log(`🔍 Field ${tableField.name} (${tableField.type}) with value:`, valueToSet);
          }
          
          console.log(`🔍 Setting field ${fieldName} to:`, valueToSet);
          
          // Use setTimeout to ensure the field is rendered and dynamicOptions are available
          setTimeout(() => {
            try {
              setValue(fieldName, valueToSet);
              
              // Trigger change event to ensure UI updates
              const event = new Event('change', { bubbles: true });
              const fieldElement = document.querySelector(`[name="${fieldName}"]`);
              if (fieldElement) {
                fieldElement.dispatchEvent(event);
              }
            } catch (error) {
              console.warn(`🔍 Failed to pre-populate field ${tableField.name}:`, error);
            }
          }, 200);
        } else {
          // Clear the field if no value in the record
          console.log(`🔍 Clearing field ${tableField.name} (no value in record)`);
          setTimeout(() => {
            setValue(fieldName, '');
          }, 200);
        }
      });
    } else {
      console.warn('🔍 No table fields or record fields available for population');
    }
  }, [dynamicOptions, values.tableName, setValue, airtableTableSchema, isUpdateRecord]);
  
  // Load linked record options for update record modal
  const [linkedFieldsLoaded, setLinkedFieldsLoaded] = useState<Set<string>>(new Set());
  const [lastLoadedTable, setLastLoadedTable] = useState<string>('');
  
  useEffect(() => {
    if (isUpdateRecord && values.tableName && dynamicOptions?.tableName) {
      // Clear loaded fields if table changed
      if (lastLoadedTable !== values.tableName) {
        setLinkedFieldsLoaded(new Set());
        setLastLoadedTable(values.tableName);
      }
      
      const selectedTable = dynamicOptions.tableName.find((table: any) => 
        table.value === values.tableName
      );
      
      if (selectedTable?.fields) {
        // Find all linked record fields and trigger loading for them
        selectedTable.fields.forEach((field: any) => {
          if (field.type === 'multipleRecordLinks' || field.type === 'singleRecordLink') {
            const fieldName = `airtable_field_${field.id}`;
            
            // Only load if not already loaded for this table
            const loadKey = `${values.tableName}-${fieldName}`;
            if (!linkedFieldsLoaded.has(loadKey)) {
              console.log('🔍 Triggering load for linked field:', fieldName, field.name);
              
              // Mark as loaded
              setLinkedFieldsLoaded(prev => new Set(prev).add(loadKey));
              
              // Trigger the load for this field with silent mode
              if (loadOptions) {
                loadOptions(fieldName, null, null, true, true);
              }
            }
          }
        });
      }
    }
  }, [isUpdateRecord, values.tableName, dynamicOptions?.tableName, loadOptions]);
  
  // Helper function to map Airtable field types to form field types
  const getAirtableFieldType = (airtableType: string, isUpdate: boolean = false): string => {
    switch (airtableType) {
      case 'singleLineText':
      case 'email':
      case 'url':
      case 'phoneNumber':
        return 'text';
      case 'multilineText':
      case 'richText':
        return 'textarea';
      case 'number':
      case 'currency':
      case 'percent':
      case 'duration':
      case 'rating':
        return 'number';
      case 'singleSelect':
        return 'select';
      case 'multipleSelects':
        return 'select'; // Will be handled with multiple: true
      case 'checkbox':
        return 'boolean';
      case 'date':
      case 'dateTime':
        return 'date';
      case 'multipleRecordLinks':
      case 'singleRecordLink':
        // For update record, return select to show as dropdown
        return isUpdate ? 'select' : 'airtable-linked-record';
      case 'multipleAttachments':
        return 'file';
      default:
        return 'text';
    }
  };
  
  /**
   * Get visible fields based on current values and dependencies
   */
  const getVisibleFields = () => {
    if (!nodeInfo?.configSchema) return [];
    
    // Start with the base schema fields and filter out hidden ones
    let visibleFields = [...nodeInfo.configSchema].filter(field => !shouldHideField(field, values));
    
    // Special handling for Airtable list records - show fields with filtering capabilities
    if (nodeInfo.providerId === 'airtable' && nodeInfo.type === 'airtable_action_list_records') {
      // Always show baseId field
      const baseField = visibleFields.find(field => field.name === 'baseId');
      let result = [baseField];
      
      // Show tableName field if baseId is selected
      if (values.baseId) {
        const tableField = visibleFields.find(field => field.name === 'tableName');
        result.push(tableField);
        
        // Show filtering fields if both base and table are selected
        if (values.tableName) {
          const filterFields = visibleFields.filter(field => 
            ['keywordSearch', 'filterField', 'filterValue', 'sortOrder', 'dateFilter', 'customDateRange', 'recordLimit', 'maxRecords', 'filterByFormula'].includes(field.name)
          );
          
          // Apply conditional visibility (showWhen) logic to each field
          const conditionallyVisibleFields = filterFields.filter(field => {
            // Handle conditional visibility with showWhen
            if ((field as any).showWhen) {
              const showWhen = (field as any).showWhen;
              for (const [conditionField, conditionValues] of Object.entries(showWhen)) {
                const currentValue = values[conditionField];
                
                // Handle special cases
                if (conditionValues === "!empty") {
                  // Field should show only when the condition field has a non-empty value
                  if (!currentValue || currentValue === '') {
                    return false;
                  }
                } else {
                  // Normal condition matching
                  const allowedValues = Array.isArray(conditionValues) ? conditionValues : [conditionValues];
                  if (!allowedValues.includes(currentValue)) {
                    return false;
                  }
                }
              }
            }
            return true;
          });
          
          result.push(...conditionallyVisibleFields);
        }
      }
      
      // Filter out null/undefined and add unique identifiers
      return result.filter(Boolean).map((field, index) => ({
        ...field,
        uniqueId: `list_records_${field.name}_${index}`
      }));
    }
    
    // Special handling for Airtable create record - add dynamic fields from fetched table schema
    if (nodeInfo.providerId === 'airtable' && 
        nodeInfo.type === 'airtable_action_create_record' && 
        values.tableName && 
        airtableTableSchema?.fields) {
      
      console.log('🔍 Generating dynamic fields from table schema for:', values.tableName);
      console.log('🔍 Table schema fields:', airtableTableSchema.fields);
      
      // Create dynamic fields for each Airtable table field
      const airtableFields = airtableTableSchema.fields.map((tableField: any, fieldIndex: number) => {
        // Debug log for linked record fields
        if (tableField.choices && (tableField.name.includes('Project') || tableField.name.includes('Feedback') || tableField.name.includes('Task'))) {
          console.log(`🔍 Choices for ${tableField.name}:`, tableField.choices);
        }
        
        return {
          name: `airtable_field_${tableField.id}`,
          label: tableField.name,
          type: getAirtableFieldTypeFromSchema(tableField),
          required: false, // Let user decide which fields to fill
          description: tableField.description || `${tableField.type} field`,
          placeholder: `Enter ${tableField.name}`,
          // Store the original Airtable field data for the renderer
          airtableField: tableField,
          // Include choices/options if available
          options: tableField.choices?.map((choice: any) => ({
            value: choice.value,
            label: choice.label,
            color: choice.color
          })) || airtableTableSchema.sampleValues?.[tableField.id]?.map((val: any) => ({
            value: val,
            label: String(val)
          })),
          // Add field-specific properties
          ...(tableField.type === 'rating' && { max: tableField.max }),
          ...(tableField.type === 'currency' && { symbol: tableField.symbol, precision: tableField.precision }),
          ...(tableField.type === 'percent' && { precision: tableField.precision }),
          // Add a unique identifier to help with React keys
          uniqueId: `${values.tableName}-${tableField.id}-${fieldIndex}`
        };
      });
      
      console.log('🔍 Generated airtableFields:', airtableFields);
      
      // Add the dynamic fields after the existing schema fields
      visibleFields = [...visibleFields, ...airtableFields as any];
    }
    
    // Special handling for Airtable update record - use table schema if available, otherwise fall back to dynamicOptions
    if (nodeInfo.providerId === 'airtable' && 
        nodeInfo.type === 'airtable_action_update_record' && 
        values.tableName) {
      
      console.log('🔍 Attempting to generate dynamic fields for update record:', values.tableName);
      
      // First try to use the fetched table schema (same as create record)
      if (airtableTableSchema?.fields) {
        console.log('🔍 Using fetched table schema for update record:', airtableTableSchema.fields);
        
        // Create dynamic fields from table schema
        const airtableFields = airtableTableSchema.fields.map((tableField: any, fieldIndex: number) => {
          // Debug log for linked record fields
          if (tableField.choices && (tableField.name.includes('Project') || tableField.name.includes('Feedback') || tableField.name.includes('Task'))) {
            console.log(`🔍 Choices for ${tableField.name}:`, tableField.choices);
          }
          
          const fieldName = `airtable_field_${tableField.id}`;
          const isLinkedField = tableField.type === 'multipleRecordLinks' || 
                                 tableField.type === 'singleRecordLink' || 
                                 tableField.isLinkedRecord;
          
          return {
            name: fieldName,
            label: tableField.name,
            type: getAirtableFieldTypeFromSchema(tableField),
            required: false, // Let user decide which fields to fill
            description: tableField.description || `${tableField.type} field`,
            placeholder: `Enter ${tableField.name}`,
            // Store the original Airtable field data for the renderer
            airtableField: tableField,
            // For non-linked fields, include static options
            options: (!isLinkedField && tableField.choices) ? tableField.choices.map((choice: any) => ({
              value: choice.value,
              label: choice.label,
              color: choice.color
            })) : airtableTableSchema.sampleValues?.[tableField.id]?.map((val: any) => ({
              value: val,
              label: String(val)
            })),
            // Mark linked fields as dynamic so FieldRenderer uses dynamicOptions
            dynamic: isLinkedField ? true : undefined,
            // Add a unique identifier to help with React keys
            uniqueId: `${values.tableName}-${tableField.id}-${fieldIndex}`
          };
        });
        
        console.log('🔍 Generated airtableFields from schema:', airtableFields);
        
        // Add the dynamic fields after the existing schema fields
        visibleFields = [...visibleFields, ...airtableFields as any];
      }
      // Fall back to using dynamicOptions if no table schema
      else {
        console.log('🔍 No table schema available, trying dynamicOptions');
        console.log('🔍 Available dynamicOptions.tableName:', dynamicOptions?.tableName);
        
        // Find the selected table data which contains the fields schema
        const selectedTable = dynamicOptions?.tableName?.find((table: any) => 
          table.value === values.tableName
        );
        
        console.log('🔍 Found selectedTable:', selectedTable);
        
        if (selectedTable?.fields) {
          console.log('🔍 Creating dynamic fields from table fields:', selectedTable.fields);
          
          // Create dynamic fields for each Airtable table field
          const airtableFields = selectedTable.fields.map((tableField: any, fieldIndex: number) => {
            // For linked record fields, set them as dynamic to load options
            const isLinkedField = tableField.type === 'multipleRecordLinks' || tableField.type === 'singleRecordLink';
            
            return {
              name: `airtable_field_${tableField.id}`,
              label: tableField.name,
              type: getAirtableFieldType(tableField.type, isUpdateRecord),
              required: tableField.required || false,
              description: tableField.description,
              placeholder: `Enter ${tableField.name}`,
              // Store the original Airtable field data for the renderer
              airtableField: tableField,
              // Mark linked fields as dynamic so they load options
              dynamic: isLinkedField,
              // Include the linked table information
              ...(isLinkedField && tableField.options && {
                linkedTableId: tableField.options.linkedTableId,
                linkedTableName: tableField.options.inverseLinkFieldId
              }),
              // Add a unique identifier to help with React keys
              uniqueId: `${values.tableName}-${tableField.id}-${fieldIndex}`
            };
          });
          
          console.log('🔍 Generated airtableFields from dynamicOptions:', airtableFields);
          
          // Add the dynamic fields after the existing schema fields
          visibleFields = [...visibleFields, ...airtableFields as any];
        } else {
          console.log('🔍 No fields found in selectedTable');
        }
      }
    }
    
    // Filter fields based on conditions
    // Special handling for Discord triggers
    if (nodeInfo.providerId === 'discord' && nodeInfo.type === 'discord_trigger_new_message') {
      // For Discord triggers, show fields conditionally
      return visibleFields.filter(field => {
        // Always show guildId (server field)
        if (field.name === 'guildId') return true;
        
        // Show channelId only if guildId is selected
        if (field.name === 'channelId') {
          return !!values.guildId;
        }
        
        // Show content filter if channelId is selected
        if (field.name === 'contentFilter') {
          return !!values.channelId;
        }
        
        // Show author filter if guildId is selected (members are guild-wide)
        if (field.name === 'filterAuthor') {
          return !!values.guildId;
        }
        
        return true;
      });
    }
    
    // Special handling for Discord actions
    if (nodeInfo.providerId === 'discord' && nodeInfo.type?.includes('discord_action')) {
      // For Discord actions, show fields conditionally
      const fields = visibleFields.filter(field => {
        // Always show guildId (server field)
        if (field.name === 'guildId') return true;
        
        // Show channelId field only if:
        // 1. A server is selected
        // 2. Discord integration is connected
        // 3. Bot is in the guild and has permissions
        if (field.name === 'channelId') {
          const hasServerSelected = values.guildId && values.guildId !== '';
          const hasDiscordConnected = !!discordIntegration;
          const hasBotAccess = botStatus?.isInGuild && botStatus?.hasPermissions;
          
          return hasServerSelected && hasDiscordConnected && hasBotAccess;
        }
        
        // Show messageId field only if channelId is selected
        if (field.name === 'messageId' && field.dependsOn === 'channelId') {
          return values.channelId && values.channelId !== '';
        }

        // No special handling needed since emoji field was removed

        // Show other fields that depend on guildId only if guildId is selected
        if (field.dependsOn === 'guildId') {
          return values.guildId && values.guildId !== '';
        }

        // Show other fields that depend on baseId only if baseId is selected (for Airtable)
        if (field.dependsOn === 'baseId') {
          return values.baseId && values.baseId !== '';
        }
        
        // Show fields that don't have dependencies
        if (!field.dependsOn) return true;
        
        // Hide fields that depend on other unselected fields
        return values[field.dependsOn] !== undefined && values[field.dependsOn] !== null && values[field.dependsOn] !== '';
      });
      
      return fields;
    }
    
    // Default field visibility logic 
    return visibleFields.filter(field => {
      // For Airtable, show dynamic fields when table is selected
      if (field.name?.startsWith('airtable_field_') && nodeInfo.providerId === 'airtable') {
        return !!values.tableName;
      }
      
      // Handle conditional visibility with showWhen
      if ((field as any).showWhen) {
        const showWhen = (field as any).showWhen;
        for (const [conditionField, conditionValues] of Object.entries(showWhen)) {
          const currentValue = values[conditionField];
          
          // Handle special cases
          if (conditionValues === "!empty") {
            // Field should show only when the condition field has a non-empty value
            if (!currentValue || currentValue === '') {
              return false;
            }
          } else {
            // Normal condition matching
            const allowedValues = Array.isArray(conditionValues) ? conditionValues : [conditionValues];
            if (!allowedValues.includes(currentValue)) {
              return false;
            }
          }
        }
      }
      
      // Handle regular dependencies
      if (!field.dependsOn) return true;
      return values[field.dependsOn] !== undefined && values[field.dependsOn] !== null && values[field.dependsOn] !== '';
    });
  };
  
  /**
   * Split fields into basic and advanced tabs, handling records table for update record
   */
  const splitFields = () => {
    const visibleFields = getVisibleFields();
    
    // For Airtable list records, ensure no dynamic fields are created
    if (nodeInfo?.providerId === 'airtable' && nodeInfo?.type === 'airtable_action_list_records') {
      return {
        basicFields: visibleFields.filter(field => !(field as any).advanced),
        advancedFields: visibleFields.filter(field => (field as any).advanced),
        dynamicFields: [], // Explicitly empty for list records
        dynamicAdvancedFields: [] // Explicitly empty for list records
      };
    }
    
    // For Airtable update record, separate base fields from dynamic fields
    if (nodeInfo?.providerId === 'airtable' && nodeInfo?.type === 'airtable_action_update_record') {
      const baseFields = visibleFields.filter(field => !field.name?.startsWith('airtable_field_'));
      const dynamicFields = visibleFields.filter(field => field.name?.startsWith('airtable_field_'));
      
      return {
        basicFields: baseFields.filter(field => !(field as any).advanced),
        advancedFields: baseFields.filter(field => (field as any).advanced),
        dynamicFields: dynamicFields.filter(field => !(field as any).advanced),
        dynamicAdvancedFields: dynamicFields.filter(field => (field as any).advanced)
      };
    }
    
    return {
      basicFields: visibleFields.filter(field => !(field as any).advanced),
      advancedFields: visibleFields.filter(field => (field as any).advanced),
      dynamicFields: [],
      dynamicAdvancedFields: []
    };
  };

  const { basicFields, advancedFields, dynamicFields, dynamicAdvancedFields } = splitFields();

  /**
   * Render fields with optional records table for update record
   */
  const renderFieldsWithTable = (fields: any[], isDynamic: boolean = false) => {
    const isListRecord = nodeInfo?.providerId === 'airtable' && nodeInfo?.type === 'airtable_action_list_records';
    const isCreateRecord = nodeInfo?.providerId === 'airtable' && nodeInfo?.type === 'airtable_action_create_record';
    const showRecordsTable = isUpdateRecord && !isDynamic && values.tableName && values.baseId;
    const showDynamicFields = (isUpdateRecord && isDynamic && values.tableName) || (isCreateRecord && values.tableName);
    
    return (
      <>
        {/* Render fields - base fields or dynamic fields based on isDynamic flag */}
        {fields.map((field, index) => {
          const fieldKey = `${isDynamic ? 'dynamic' : 'basic'}-field-${(field as any).uniqueId || field.name}-${field.type}-${index}-${nodeInfo?.type || 'unknown'}`;
          const shouldUseAIWrapper = isUpdateRecord && (field.name === 'recordId' || isDynamic);
          
          // Skip rendering if it's a dynamic section but we shouldn't show dynamic fields
          if (isDynamic && !showDynamicFields) return null;
          
          return (
          <React.Fragment key={fieldKey}>
            {shouldUseAIWrapper ? (
              <AIFieldWrapper
                field={field}
                value={values[field.name]}
                onChange={(value) => handleFieldChange(field.name, value)}
                error={errors[field.name]}
                workflowData={workflowData}
                currentNodeId={currentNodeId}
                dynamicOptions={dynamicOptions}
                loadingDynamic={loadingFields.has(field.name) || (loadingDynamic && field.name !== 'baseId')}
                nodeInfo={nodeInfo}
                onDynamicLoad={handleDynamicLoad}
                isAIEnabled={aiFields.has(field.name)}
                onAIToggle={(fieldName, enabled) => {
                  setAiFields(prev => {
                    const newSet = new Set(prev);
                    if (enabled) {
                      newSet.add(fieldName);
                    } else {
                      newSet.delete(fieldName);
                    }
                    return newSet;
                  });
                }}
                isReadOnly={field.name === 'recordId'}
                isNonEditable={field.computed || field.autoNumber || field.formula}
              />
            ) : (
              <FieldRenderer
                field={field}
                value={values[field.name]}
                onChange={(value) => handleFieldChange(field.name, value)}
                error={errors[field.name]}
                workflowData={workflowData}
                currentNodeId={currentNodeId}
                dynamicOptions={dynamicOptions}
                loadingDynamic={loadingFields.has(field.name) || (loadingDynamic && field.name !== 'baseId')}
                nodeInfo={nodeInfo}
                onDynamicLoad={handleDynamicLoad}
              />
            )}
            
            {/* Show reaction remover component after messageId field for remove reaction actions */}
            {field.name === 'messageId' && nodeInfo?.type === 'discord_action_remove_reaction' && values.messageId && values.channelId && (
              <DiscordReactionRemover
                messageId={values.messageId}
                channelId={values.channelId}
                onReactionSelect={(emoji) => {
                  // Store the selected emoji in a temporary field for the action execution
                  setValue('selectedEmoji', emoji);
                }}
                selectedReaction={values.selectedEmoji}
                dynamicOptions={{...dynamicOptions, selectedEmoji: selectedEmojiReactions}}
                onLoadReactions={() => {
                  loadReactionsForMessage(values.channelId, values.messageId);
                }}
                isLoading={loadingFields.has('selectedEmoji')}
              />
            )}
            
            {/* Preview button will be moved to after all fields - removing from here */}
            {false && isListRecord && field.name === 'tableName' && values.tableName && values.baseId && (
              <div className="mt-4 space-y-4">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <p className="text-sm text-slate-600 mb-3">
                    Preview the data that will be retrieved from the selected table. This shows all records that would be returned when the workflow runs.
                  </p>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        if (showPreviewData) {
                          setShowPreviewData(false);
                          setPreviewData([]);
                        } else {
                          loadPreviewData(values.baseId, values.tableName);
                        }
                      }}
                      disabled={loadingPreview}
                      className="flex items-center gap-2"
                    >
                      {loadingPreview ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent"></div>
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                      {loadingPreview ? 'Loading...' : showPreviewData ? 'Hide Preview' : 'Preview Records'}
                    </Button>
                    {showPreviewData && previewData.length > 0 && (
                      <div className="text-sm text-slate-600">
                        Showing {previewData.length} record{previewData.length !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Inline Preview Data Table from main branch design */}
                {showPreviewData && (
                  <div className="border border-slate-200 rounded-lg bg-white shadow-sm">
                    <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 rounded-t-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-medium text-slate-900">
                            Preview: {values.tableName}
                            {(values.filterField || values.dateFilter !== 'all_time') && (
                              <span className="text-xs text-blue-600 ml-1">(Filtered)</span>
                            )}
                          </h3>
                          <p className="text-xs text-slate-600">
                            {previewData.length > 0 ? (
                              `${previewData.length} record${previewData.length !== 1 ? 's' : ''} match${previewData.length === 1 ? 'es' : ''} your filters • Data available in workflow`
                            ) : (
                              'No records match your current filters • Try adjusting your filter criteria'
                            )}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setShowPreviewData(false);
                            setPreviewData([]);
                          }}
                          className="h-6 w-6 p-0 hover:bg-red-50 hover:text-red-600"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    
                    <div>
                      {previewData.length > 0 ? (
                        <>
                          <style jsx>{`
                            .preview-table-container {
                              overflow: scroll !important;
                              overflow-x: scroll !important;
                              overflow-y: scroll !important;
                            }
                            .preview-table-container::-webkit-scrollbar {
                              width: 16px !important;
                              height: 16px !important;
                              background-color: #e2e8f0 !important;
                              display: block !important;
                            }
                            .preview-table-container::-webkit-scrollbar-track {
                              background: #f1f5f9 !important;
                              border-radius: 8px !important;
                              border: 1px solid #cbd5e1 !important;
                            }
                            .preview-table-container::-webkit-scrollbar-thumb {
                              background: #475569 !important;
                              border-radius: 8px !important;
                              border: 2px solid #e2e8f0 !important;
                              min-height: 20px !important;
                              min-width: 20px !important;
                            }
                            .preview-table-container::-webkit-scrollbar-thumb:hover {
                              background: #334155 !important;
                            }
                            .preview-table-container::-webkit-scrollbar-corner {
                              background: #f1f5f9 !important;
                              border: 1px solid #cbd5e1 !important;
                            }
                            .preview-table-container {
                              scrollbar-width: auto !important;
                              scrollbar-color: #475569 #f1f5f9 !important;
                              scrollbar-gutter: stable !important;
                            }
                          `}</style>
                          <div className="relative">
                            {/* Sticky ID column positioned absolutely */}
                            {/* Single table with sticky ID column */}
                            <div 
                              className="max-h-[300px] preview-table-container overflow-auto"
                              style={{ 
                                maxWidth: (() => {
                                  // Calculate max width accounting for dynamic ID column - more restrictive
                                  let idWidth = Math.max('ID'.length * 10 + 40, 80);
                                  previewData.slice(0, 8).forEach(record => {
                                    const idValue = record.value || record.id || '';
                                    const calcWidth = String(idValue).length * 9 + 24;
                                    idWidth = Math.max(idWidth, calcWidth);
                                  });
                                  idWidth = Math.min(idWidth, 250);
                                  return `calc(100vw - ${idWidth}px - 380px - 140px)`; // Even more space for Variables panel
                                })(), // Account for ID column + Variables panel + more padding
                                overflow: 'scroll',
                                overflowX: 'scroll',
                                overflowY: 'scroll',
                                scrollbarWidth: 'auto',
                                scrollbarColor: '#475569 #f1f5f9',
                                WebkitOverflowScrolling: 'touch'
                              }}
                              onScroll={(e) => {
                                const target = e.target as HTMLDivElement;
                                const scrollLeft = target.scrollLeft;
                                const scrollWidth = target.scrollWidth;
                                const clientWidth = target.clientWidth;
                                const maxScroll = scrollWidth - clientWidth;
                                const progress = maxScroll > 0 ? (scrollLeft / maxScroll) * 100 : 0;
                                setScrollProgress(progress);
                                console.log('📏 SCROLL DEBUG:', {
                                  scrollLeft,
                                  scrollWidth, 
                                  clientWidth,
                                  maxScroll,
                                  progress: Math.round(progress),
                                  containerWidth: target.offsetWidth
                                });
                              }}
                            >
                            <table 
                              className="text-sm" 
                              style={{ 
                                borderSpacing: 0,
                                width: (() => {
                                  // Calculate dynamic width based on content
                                  const fields = Object.keys(previewData[0]?.fields || {});
                                  if (fields.length === 0) return '800px';
                                  
                                  // Calculate dynamic ID column width
                                  let idColumnWidth = Math.max('ID'.length * 10 + 40, 80);
                                  previewData.slice(0, 8).forEach(record => {
                                    const idValue = record.value || record.id || '';
                                    const idWidth = String(idValue).length * 9 + 24;
                                    idColumnWidth = Math.max(idColumnWidth, idWidth);
                                  });
                                  idColumnWidth = Math.min(idColumnWidth, 250);
                                  
                                  // Calculate width for each column based on content
                                  let totalWidth = 0;
                                  fields.forEach(fieldName => {
                                    // Calculate header width
                                    let maxWidth = Math.max(fieldName.length * 8 + 32, 100); // 8px per char + padding
                                    
                                    // Check data width for this field
                                    previewData.slice(0, 8).forEach(record => {
                                      const value = record.fields?.[fieldName];
                                      
                                      // Check if this is an attachment field
                                      const isAttachment = Array.isArray(value) && 
                                        value.length > 0 && 
                                        value[0] && 
                                        typeof value[0] === 'object' && 
                                        value[0].url && 
                                        value[0].filename;
                                      
                                      if (isAttachment) {
                                        // For attachment fields, calculate width based on thumbnail count
                                        const thumbnailCount = Math.min(value.length, 3);
                                        const hasMoreIndicator = value.length > 3;
                                        const attachmentWidth = (thumbnailCount * 32) + ((thumbnailCount - 1) * 4) + (hasMoreIndicator ? 36 : 0) + 32; // 32px per thumbnail + 4px gap + more indicator + padding
                                        maxWidth = Math.max(maxWidth, attachmentWidth);
                                      } else {
                                        // Regular text width calculation
                                        const valueStr = Array.isArray(value) 
                                          ? value.join(', ') 
                                          : String(value || '');
                                        const valueWidth = Math.min(valueStr.length * 7 + 16, 300); // Cap at 300px
                                        maxWidth = Math.max(maxWidth, valueWidth);
                                      }
                                    });
                                    
                                    totalWidth += maxWidth;
                                  });
                                  
                                  // Add dynamic ID column width to make last column align perfectly
                                  const finalWidth = totalWidth + idColumnWidth;
                                  
                                  return `${finalWidth}px`;
                                })(),
                                tableLayout: 'fixed'
                              }}
                            >
                            <thead className="bg-slate-50/50 sticky top-0 z-10">
                              <tr className="h-10">
                                {/* ID column as first column */}
                                <th 
                                  className="font-medium text-slate-700 p-2 text-center sticky left-0 z-20 bg-slate-50/50"
                                  style={{ 
                                    width: (() => {
                                      let maxWidth = Math.max('ID'.length * 10 + 40, 80);
                                      previewData.slice(0, 8).forEach(record => {
                                        const idValue = record.value || record.id || '';
                                        const idWidth = String(idValue).length * 9 + 24;
                                        maxWidth = Math.max(maxWidth, idWidth);
                                      });
                                      return `${Math.min(maxWidth, 250)}px`;
                                    })(),
                                    minWidth: (() => {
                                      let maxWidth = Math.max('ID'.length * 10 + 40, 80);
                                      previewData.slice(0, 8).forEach(record => {
                                        const idValue = record.value || record.id || '';
                                        const idWidth = String(idValue).length * 9 + 24;
                                        maxWidth = Math.max(maxWidth, idWidth);
                                      });
                                      return `${Math.min(maxWidth, 250)}px`;
                                    })()
                                  }}
                                >
                                  ID
                                </th>
                                {/* Show all fields with horizontal scrolling */}
                                {Object.keys(previewData[0]?.fields || {}).map((fieldName, index, fields) => {
                                  // Calculate column width
                                  let columnWidth = Math.max(fieldName.length * 8 + 32, 100);
                                  previewData.slice(0, 8).forEach(record => {
                                    const value = record.fields?.[fieldName];
                                    
                                    // Check if this is an attachment field
                                    const isAttachment = Array.isArray(value) && 
                                      value.length > 0 && 
                                      value[0] && 
                                      typeof value[0] === 'object' && 
                                      value[0].url && 
                                      value[0].filename;
                                    
                                    if (isAttachment) {
                                      // For attachment fields, calculate width based on thumbnail count
                                      const thumbnailCount = Math.min(value.length, 3);
                                      const hasMoreIndicator = value.length > 3;
                                      const attachmentWidth = (thumbnailCount * 32) + ((thumbnailCount - 1) * 4) + (hasMoreIndicator ? 36 : 0) + 32; // 32px per thumbnail + 4px gap + more indicator + padding
                                      columnWidth = Math.max(columnWidth, attachmentWidth);
                                    } else {
                                      // Regular text width calculation
                                      const valueStr = Array.isArray(value) 
                                        ? value.join(', ') 
                                        : String(value || '');
                                      const valueWidth = Math.min(valueStr.length * 7 + 16, 300);
                                      columnWidth = Math.max(columnWidth, valueWidth);
                                    }
                                  });
                                  
                                  // For the last column, add dynamic ID column width for perfect alignment
                                  if (index === fields.length - 1) {
                                    let idColumnWidth = Math.max('ID'.length * 10 + 40, 80);
                                    previewData.slice(0, 8).forEach(record => {
                                      const idValue = record.value || record.id || '';
                                      const idWidth = String(idValue).length * 9 + 24;
                                      idColumnWidth = Math.max(idColumnWidth, idWidth);
                                    });
                                    idColumnWidth = Math.min(idColumnWidth, 250);
                                    columnWidth += idColumnWidth; // Add dynamic ID column width for perfect alignment
                                  }
                                  
                                  return (
                                    <th 
                                      key={fieldName} 
                                      className="font-medium text-slate-700 last:border-r-0 p-2 whitespace-nowrap text-center" 
                                      style={{ width: `${columnWidth}px`, minWidth: `${columnWidth}px` }}
                                    >
                                      <div title={fieldName} className="text-center">
                                        {fieldName}
                                      </div>
                                    </th>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody>
                              {previewData.slice(0, 8).map((record: any, index: number) => (
                                <tr key={record.value || record.id || index} className="hover:bg-slate-50/50 h-12">
                                  {/* ID cell as first column */}
                                  <td 
                                    className="font-mono text-xs text-slate-500 bg-slate-50/30 p-2 text-center align-middle overflow-hidden sticky left-0 z-10"
                                    style={{ 
                                      width: (() => {
                                        let maxWidth = Math.max('ID'.length * 10 + 40, 80);
                                        previewData.slice(0, 8).forEach(rec => {
                                          const idValue = rec.value || rec.id || '';
                                          const idWidth = String(idValue).length * 9 + 24;
                                          maxWidth = Math.max(maxWidth, idWidth);
                                        });
                                        return `${Math.min(maxWidth, 250)}px`;
                                      })(),
                                      minWidth: (() => {
                                        let maxWidth = Math.max('ID'.length * 10 + 40, 80);
                                        previewData.slice(0, 8).forEach(rec => {
                                          const idValue = rec.value || rec.id || '';
                                          const idWidth = String(idValue).length * 9 + 24;
                                          maxWidth = Math.max(maxWidth, idWidth);
                                        });
                                        return `${Math.min(maxWidth, 250)}px`;
                                      })(),
                                      boxSizing: 'border-box'
                                    }}
                                  >
                                    <div className="flex items-center justify-center h-12 overflow-hidden">
                                      <span className="text-center" style={{ lineHeight: '1.2' }} title={record.value || record.id || ''}>
                                        {record.value || record.id || ''}
                                      </span>
                                    </div>
                                  </td>
                                  {/* Field data cells */}
                                  {Object.entries(record.fields || {}).map(([fieldName, fieldValue]: [string, any], fieldIndex: number) => {
                                    const fieldNames = Object.keys(record.fields || {});
                                    const isLastColumn = fieldIndex === fieldNames.length - 1;
                                    
                                    // Calculate column width (same logic as header)
                                    let columnWidth = Math.max(fieldName.length * 8 + 32, 100);
                                    previewData.slice(0, 8).forEach(rec => {
                                      const value = rec.fields?.[fieldName];
                                      
                                      // Check if this is an attachment field
                                      const isAttachment = Array.isArray(value) && 
                                        value.length > 0 && 
                                        value[0] && 
                                        typeof value[0] === 'object' && 
                                        value[0].url && 
                                        value[0].filename;
                                      
                                      if (isAttachment) {
                                        // For attachment fields, calculate width based on thumbnail count
                                        const thumbnailCount = Math.min(value.length, 3);
                                        const hasMoreIndicator = value.length > 3;
                                        const attachmentWidth = (thumbnailCount * 32) + ((thumbnailCount - 1) * 4) + (hasMoreIndicator ? 36 : 0) + 32; // 32px per thumbnail + 4px gap + more indicator + padding
                                        columnWidth = Math.max(columnWidth, attachmentWidth);
                                      } else {
                                        // Regular text width calculation
                                        const valueStr = Array.isArray(value) 
                                          ? value.join(', ') 
                                          : String(value || '');
                                        const valueWidth = Math.min(valueStr.length * 7 + 16, 300);
                                        columnWidth = Math.max(columnWidth, valueWidth);
                                      }
                                    });
                                    
                                    // Add dynamic ID column width to last column for alignment
                                    if (isLastColumn) {
                                      let idColumnWidth = Math.max('ID'.length * 10 + 40, 80);
                                      previewData.slice(0, 8).forEach(rec => {
                                        const idValue = rec.value || rec.id || '';
                                        const idWidth = String(idValue).length * 9 + 24;
                                        idColumnWidth = Math.max(idColumnWidth, idWidth);
                                      });
                                      idColumnWidth = Math.min(idColumnWidth, 250);
                                      columnWidth += idColumnWidth;
                                    }
                                    
                                    return (
                                      <td 
                                        key={`${record.id}-${fieldName}-${fieldIndex}`} 
                                        className="last:border-r-0 p-2 whitespace-nowrap text-center align-middle overflow-hidden"
                                        style={{ width: `${columnWidth}px`, minWidth: `${columnWidth}px`, boxSizing: 'border-box' }}
                                      >
                                        <div className="flex items-center justify-center h-12 overflow-hidden" style={{ width: `${columnWidth - 16}px` }}>
                                          {(() => {
                                            // Check if this is an Airtable attachment field
                                            const isAttachment = Array.isArray(fieldValue) && 
                                              fieldValue.length > 0 && 
                                              fieldValue[0] && 
                                              typeof fieldValue[0] === 'object' && 
                                              fieldValue[0].url && 
                                              fieldValue[0].filename;
                                            
                                            if (isAttachment) {
                                              // Render attachment thumbnails
                                              return (
                                                <div className="flex flex-wrap gap-1 justify-center h-full items-center">
                                                  {fieldValue.slice(0, 3).map((attachment: any, index: number) => {
                                                    const isImage = attachment.type?.startsWith('image/') || 
                                                      /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(attachment.filename || '');
                                                    
                                                    if (isImage) {
                                                      const thumbnailUrl = attachment.thumbnails?.small?.url || attachment.url;
                                                      return (
                                                        <div 
                                                          key={`${attachment.id || index}`}
                                                          className="relative group"
                                                          title={`${attachment.filename} (${(attachment.size / 1024).toFixed(1)}KB)`}
                                                        >
                                                          <img 
                                                            src={thumbnailUrl}
                                                            alt={attachment.filename || 'Attachment'}
                                                            className="w-8 h-8 object-cover rounded border border-slate-200 hover:border-blue-300 transition-colors"
                                                            onError={(e) => {
                                                              // Fallback to file icon if image fails to load
                                                              const target = e.target as HTMLImageElement;
                                                              target.style.display = 'none';
                                                              const parent = target.parentElement;
                                                              if (parent) {
                                                                parent.innerHTML = `
                                                                  <div class="w-8 h-8 bg-slate-100 rounded border border-slate-200 flex items-center justify-center">
                                                                    <span class="text-xs text-slate-500">📎</span>
                                                                  </div>
                                                                `;
                                                              }
                                                            }}
                                                          />
                                                        </div>
                                                      );
                                                    } else {
                                                      // Non-image attachment - show file icon
                                                      return (
                                                        <div 
                                                          key={`${attachment.id || index}`}
                                                          className="w-8 h-8 bg-slate-100 rounded border border-slate-200 flex items-center justify-center"
                                                          title={`${attachment.filename} (${(attachment.size / 1024).toFixed(1)}KB)`}
                                                        >
                                                          <span className="text-xs text-slate-500">📎</span>
                                                        </div>
                                                      );
                                                    }
                                                  })}
                                                  {fieldValue.length > 3 && (
                                                    <div className="w-8 h-8 bg-slate-50 rounded border border-slate-200 flex items-center justify-center">
                                                      <span className="text-xs text-slate-400">+{fieldValue.length - 3}</span>
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            }
                                            
                                            // Regular array handling
                                            if (Array.isArray(fieldValue)) {
                                              return (
                                                <div className="text-xs text-slate-900 text-center h-full flex items-center justify-center">
                                                  <span className="block truncate" title={fieldValue.join(', ')}>
                                                    {fieldValue.length > 0 ? fieldValue.join(', ') : '[]'}
                                                  </span>
                                                </div>
                                              );
                                            }
                                            
                                            // Empty/null values
                                            if (fieldValue === null || fieldValue === undefined || fieldValue === '') {
                                              return (
                                                <div className="text-slate-400 italic text-xs h-full flex items-center justify-center">
                                                  <span>—</span>
                                                </div>
                                              );
                                            }
                                            
                                            // Regular text values
                                            return (
                                              <div className="text-xs text-slate-900 text-center h-full flex items-center justify-center">
                                                <span className="block truncate" title={String(fieldValue)}>
                                                  {String(fieldValue)}
                                                </span>
                                              </div>
                                            );
                                          })()}
                                        </div>
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                              {previewData.length > 8 && (
                                <tr className="h-12">
                                  <td colSpan={Object.keys(previewData[0]?.fields || {}).length + 1} className="p-2 text-center text-xs text-slate-500 bg-slate-50">
                                    ... and {previewData.length - 8} more record{previewData.length - 8 !== 1 ? 's' : ''}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-slate-500">
                          <div className="bg-slate-100 rounded-full p-2 mb-2">
                            <Eye className="h-4 w-4 text-slate-400" />
                          </div>
                          <p className="text-sm font-medium">No preview data available</p>
                          <p className="text-xs text-slate-400 mt-1">The table may be empty or there was an error loading data</p>
                        </div>
                      )}
                    </div>
                    
                    {previewData.length > 0 && (
                      <>
                        <div className="border-t border-slate-200 bg-slate-50 px-3 py-1.5 rounded-b-lg">
                          <div className="flex items-center justify-between text-xs text-slate-600">
                            <span>Total: {previewData.length} record{previewData.length !== 1 ? 's' : ''}</span>
                            <span>Showing all {Object.keys(previewData[0]?.fields || {}).length} field{Object.keys(previewData[0]?.fields || {}).length !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </React.Fragment>
        );
        })}
        
        {/* Records table for update record - exact copy from list records */}
        {showRecordsTable && (
          <div className="mt-6 border border-slate-200 rounded-lg bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 rounded-t-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-slate-900">
                    Select Record: {values.tableName}
                  </h3>
                  <p className="text-xs text-slate-600">
                    {airtableRecords.length} record{airtableRecords.length !== 1 ? 's' : ''} • Click to select
                    {selectedRecord && (
                      <span className="ml-2 text-blue-600">Selected: {selectedRecord.id}</span>
                    )}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedRecord(null);
                    setValue('recordId', '');
                    // Clear all dynamic field values
                    Object.keys(values).forEach(key => {
                      if (key.startsWith('airtable_field_')) {
                        setValue(key, '');
                      }
                    });
                  }}
                  className="h-6 w-6 p-0 hover:bg-red-50 hover:text-red-600"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
            
            <div>
              {loadingRecords ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
                  <span className="ml-2 text-sm text-slate-600">Loading records...</span>
                </div>
              ) : airtableRecords.length > 0 ? (
                <>
                  <style jsx>{`
                    .update-record-table-container {
                      overflow: scroll !important;
                      overflow-x: scroll !important;
                      overflow-y: scroll !important;
                    }
                    .update-record-table-container::-webkit-scrollbar {
                      width: 16px !important;
                      height: 16px !important;
                      background-color: #e2e8f0 !important;
                      display: block !important;
                    }
                    .update-record-table-container::-webkit-scrollbar-track {
                      background: #f1f5f9 !important;
                      border-radius: 8px !important;
                      border: 1px solid #cbd5e1 !important;
                    }
                    .update-record-table-container::-webkit-scrollbar-thumb {
                      background: #475569 !important;
                      border-radius: 8px !important;
                      border: 2px solid #e2e8f0 !important;
                      min-height: 20px !important;
                      min-width: 20px !important;
                    }
                    .update-record-table-container::-webkit-scrollbar-thumb:hover {
                      background: #334155 !important;
                    }
                    .update-record-table-container::-webkit-scrollbar-corner {
                      background: #f1f5f9 !important;
                      border: 1px solid #cbd5e1 !important;
                    }
                    .update-record-table-container {
                      scrollbar-width: auto !important;
                      scrollbar-color: #475569 #f1f5f9 !important;
                      scrollbar-gutter: stable !important;
                    }
                    .selectable-row {
                      cursor: pointer;
                      transition: all 0.15s ease;
                    }
                    .selectable-row:hover {
                      background-color: #f8fafc;
                    }
                    .selectable-row.selected {
                      background-color: #dbeafe !important;
                    }
                    .selectable-row.selected:hover {
                      background-color: #bfdbfe !important;
                    }
                  `}</style>
                  <div className="relative">
                    {/* Sticky ID column positioned absolutely */}
                    <div 
                      className="absolute left-0 top-0 z-20 bg-white"
                      style={{ 
                        width: '150px'
                      }}
                    >
                      <table className="text-sm" style={{ borderSpacing: 0 }}>
                        <thead className="bg-slate-50/50">
                          <tr className="h-10">
                            <th 
                              className="font-medium text-slate-700 p-2 text-center"
                              style={{ width: '150px' }}
                            >
                              ID
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {airtableRecords.map((record: any, index: number) => (
                            <tr 
                              key={`id-${record.id || index}`} 
                              className={cn(
                                "h-12 cursor-pointer",
                                selectedRecord?.id === record.id ? "bg-blue-50 hover:bg-blue-100" : "hover:bg-slate-50/50"
                              )}
                              onClick={() => handleRecordSelect(record)}
                            >
                              <td 
                                className="font-mono text-xs text-slate-500 bg-slate-50/30 p-2 text-center align-middle overflow-hidden"
                                style={{ 
                                  width: '150px'
                                }}
                              >
                                <div className="truncate" title={record.id}>
                                  {record.id}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Scrollable content area starting after ID column */}
                    <div 
                      className="max-h-[300px] update-record-table-container"
                      style={{
                        marginLeft: '150px',
                        maxWidth: 'calc(100vw - 150px - 380px - 140px)', // Account for ID column + Variables panel + padding
                        overflow: 'scroll',
                        overflowX: 'scroll',
                        overflowY: 'scroll',
                        scrollbarWidth: 'auto',
                        scrollbarColor: '#475569 #f1f5f9',
                        WebkitOverflowScrolling: 'touch'
                      }}
                    >
                      <table 
                        className="text-sm"
                        style={{ 
                          borderSpacing: 0,
                          width: 'max-content',
                          tableLayout: 'fixed'
                        }}
                      >
                        <thead className="bg-slate-50/50 sticky top-0 z-10">
                          <tr className="h-10">
                            {Object.keys(airtableRecords[0]?.fields || {}).map((fieldName) => (
                              <th 
                                key={fieldName} 
                                className="font-medium text-slate-700 p-2 text-center whitespace-nowrap border-r border-slate-200 last:border-r-0"
                                style={{ minWidth: '200px' }}
                              >
                                {fieldName}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {airtableRecords.map((record: any, index: number) => (
                            <tr 
                              key={`fields-${record.id || index}`} 
                              className={cn(
                                "h-12 cursor-pointer",
                                selectedRecord?.id === record.id ? "bg-blue-50 hover:bg-blue-100" : "hover:bg-slate-50/50"
                              )}
                              onClick={() => handleRecordSelect(record)}
                            >
                              {Object.keys(airtableRecords[0]?.fields || {}).map((fieldName) => {
                                const value = record.fields?.[fieldName];
                                
                                // Check if it's an attachment field
                                const isAttachment = Array.isArray(value) && 
                                  value.length > 0 && 
                                  value[0] && 
                                  typeof value[0] === 'object' && 
                                  (value[0].url || value[0].thumbnails);
                                
                                // Check if this is a linked record field and get the field info
                                let isLinkedField = false;
                                let linkedFieldOptions: any[] = [];
                                
                                if (airtableTableSchema?.fields) {
                                  const tableField = airtableTableSchema.fields.find((f: any) => f.name === fieldName);
                                  if (tableField && (tableField.type === 'multipleRecordLinks' || 
                                      tableField.type === 'singleRecordLink' || 
                                      tableField.isLinkedRecord)) {
                                    isLinkedField = true;
                                    // Get the options from dynamicOptions
                                    const fieldId = `airtable_field_${tableField.id}`;
                                    linkedFieldOptions = dynamicOptions?.[fieldId] || tableField.choices || [];
                                  }
                                }
                                
                                let displayContent;
                                if (isAttachment) {
                                  // Display thumbnails for attachments
                                  displayContent = (
                                    <div className="flex items-center justify-center gap-1">
                                      {value.slice(0, 3).map((attachment, idx) => {
                                        const thumbnailUrl = attachment.thumbnails?.small?.url || attachment.url;
                                        return (
                                          <div key={idx} className="w-8 h-8 bg-slate-100 rounded overflow-hidden">
                                            {thumbnailUrl ? (
                                              <img 
                                                src={thumbnailUrl} 
                                                alt={attachment.filename || 'attachment'}
                                                className="w-full h-full object-cover"
                                              />
                                            ) : (
                                              <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                                                📎
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                      {value.length > 3 && (
                                        <span className="text-xs text-slate-500">+{value.length - 3}</span>
                                      )}
                                    </div>
                                  );
                                } else if (isLinkedField) {
                                  // Handle linked record fields - map IDs to names
                                  let displayValue = '';
                                  let mappedNames: string[] = [];
                                  
                                  if (Array.isArray(value)) {
                                    // Multiple linked records
                                    mappedNames = value.map((id: string) => {
                                      const option = linkedFieldOptions.find((opt: any) => opt.value === id);
                                      return option ? option.label : id;
                                    });
                                    displayValue = mappedNames.join(', ');
                                  } else if (value) {
                                    // Single linked record
                                    const option = linkedFieldOptions.find((opt: any) => opt.value === value);
                                    const name = option ? option.label : String(value);
                                    mappedNames = [name];
                                    displayValue = name;
                                  }
                                  
                                  // Show with special styling for linked records
                                  displayContent = (
                                    <div className="flex items-center gap-1">
                                      <span className="text-blue-600" title="Linked record">🔗</span>
                                      <div className="truncate text-blue-700" title={displayValue}>
                                        {displayValue || '-'}
                                      </div>
                                    </div>
                                  );
                                } else {
                                  // Regular text display
                                  const displayValue = value === null || value === undefined ? '' : 
                                    Array.isArray(value) ? value.join(', ') : String(value);
                                  
                                  displayContent = (
                                    <div className="truncate" title={displayValue}>
                                      {displayValue || '-'}
                                    </div>
                                  );
                                }
                                
                                return (
                                  <td 
                                    key={fieldName} 
                                    className="p-2 align-middle overflow-hidden text-center border-r border-slate-200 last:border-r-0"
                                    style={{ 
                                      color: selectedRecord?.id === record.id ? '#334155' : '#475569',
                                      minWidth: '200px'
                                    }}
                                  >
                                    {displayContent}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  
                  <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 rounded-b-lg">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-slate-600">
                        <span>Total: {airtableRecords.length} record{airtableRecords.length !== 1 ? 's' : ''}</span>
                        <span className="ml-3">• Showing all {Object.keys(airtableRecords[0]?.fields || {}).length} field{Object.keys(airtableRecords[0]?.fields || {}).length !== 1 ? 's' : ''}</span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Refresh the records
                          if (values.baseId && values.tableName) {
                            setLoadingRecords(true);
                            loadAirtableRecords(values.baseId, values.tableName);
                          }
                        }}
                        disabled={loadingRecords}
                        className="h-7 px-2.5 text-xs bg-white border-slate-300 hover:bg-slate-100 hover:border-slate-400 text-slate-700 font-medium rounded"
                        title="Refresh records"
                      >
                        <div className="flex items-center gap-1">
                          {loadingRecords ? (
                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-slate-500 border-t-transparent"></div>
                          ) : (
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          )}
                          <span>Refresh</span>
                        </div>
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-4">
                  <div className="text-slate-500 mb-1">
                    No records found in this table
                  </div>
                  <div className="text-xs text-slate-400">
                    Records will appear here once they are created
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Dynamic fields loading indicator for create record only */}
        {showDynamicFields && isCreateRecord && isLoadingTableSchema && (
          <div className="mt-6">
            <div className="flex items-center justify-center gap-3 bg-slate-50 border-2 border-slate-300 px-4 py-4 rounded-lg">
              <div className="animate-spin h-6 w-6 border-3 border-slate-600 border-t-transparent rounded-full" style={{ borderWidth: '3px' }}></div>
              <span className="text-sm font-semibold text-slate-700">Loading table fields...</span>
            </div>
          </div>
        )}
      </>
    );
  };

  if (!nodeInfo) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-500">
        <div className="text-center">
          <Settings className="h-8 w-8 mx-auto mb-2 text-slate-400" />
          <p>No configuration available for this node.</p>
        </div>
      </div>
    );
  }

  // Show loading screen when needed
  // Show loading for Airtable during initial data loading
  if (isLoading || (nodeInfo?.providerId === 'airtable' && isInitialLoading)) {
    return (
      <ConfigurationLoadingScreen 
        integrationName={nodeInfo?.providerId === 'airtable' ? 'Airtable' : integrationName || 'Integration'}
      />
    );
  }

  // Handle Discord integrations specially - Progressive field disclosure
  if (nodeInfo?.providerId === 'discord' && nodeInfo?.type?.startsWith('discord_action_')) {
    return (
      <form onSubmit={async (e) => {
        e.preventDefault();
        
        // Handle saving configuration for both existing and new/pending nodes
        try {
          console.log('🔄 [ConfigForm] Saving configuration:', { currentNodeId, values });
          
          // Check if this is a new/pending node (hasn't been added to workflow yet)
          const isPendingNode = currentNodeId === 'pending-action' || currentNodeId === 'pending-trigger';
          
          if (isPendingNode) {
            // For new/pending nodes, use the original flow to add them to the workflow
            console.log('🔄 [ConfigForm] Pending node detected, using original save flow');
            const dataWithConfig = {
              config: values
            };
            
            if (onSubmit) {
              onSubmit(dataWithConfig);
            }
          } else if (currentNodeId && currentWorkflow) {
            // For existing nodes, update node config and save workflow before calling onSubmit
            console.log('🔄 [ConfigForm] Existing node detected, updating node config and saving workflow');
            
            // Update the node's config in the workflow store
            updateNode(currentNodeId, { config: values });
            
            // Save the workflow to Supabase with updated config
            await saveWorkflow();
            
            const dataWithConfig = {
              config: values
            };
            
            if (onSubmit) {
              onSubmit(dataWithConfig);
            }
          }
        } catch (error) {
          console.error('❌ [ConfigForm] Failed to save configuration:', error);
          // Don't close modal on error - let user retry
          return;
        }
      }} className="h-full flex flex-col">
        <div className="flex-1 flex flex-col min-h-0">
          {renderDiscordProgressiveConfig()}
        </div>
        
        {/* Form buttons */}
        <div className="flex justify-between items-center h-[70px] px-6 border-t border-slate-200 bg-white flex-shrink-0">
          <div className="flex items-center gap-3">
            {Object.keys(errors).length > 0 && (
              <Badge variant="destructive" className="bg-red-100 text-red-700 border-red-200">
                {Object.keys(errors).length} error{Object.keys(errors).length > 1 ? 's' : ''}
              </Badge>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="flex items-center gap-2"
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </div>
          
          <div className="flex gap-3">
            {nodeInfo?.testable && (
              <Button
                type="button"
                onClick={handleTest}
                className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white"
                disabled={isTestLoading}
              >
                {isTestLoading ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Test Configuration
              </Button>
            )}
            <Button
              type="submit"
              className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-200"
            >
              <Save className="h-4 w-4" />
              Save Configuration
            </Button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      
      // Special handling for Airtable create/update record - restructure dynamic fields
      let submissionValues = { ...values };
      if (nodeInfo?.providerId === 'airtable' && (nodeInfo?.type === 'airtable_action_create_record' || nodeInfo?.type === 'airtable_action_update_record')) {

        // Extract Airtable field values and structure them properly
        const airtableFields: Record<string, any> = {};
        const cleanedValues: Record<string, any> = {};
        
        Object.entries(values).forEach(([key, value]) => {
          if (key.startsWith('airtable_field_')) {
            // Extract the field name from the dynamic field
            const fieldId = key.replace('airtable_field_', '');
            
            // Find the actual field definition to get the field name
            const selectedTable = dynamicOptions?.tableName?.find((table: any) => 
              table.value === values.tableName
            );
            const fieldDef = selectedTable?.fields?.find((f: any) => f.id === fieldId);
            
            if (fieldDef && value !== undefined && value !== null && value !== '') {
              airtableFields[fieldDef.name] = value;
            }
          } else {
            // Keep non-Airtable fields as-is
            cleanedValues[key] = value;
          }
        });
        
        // Add the structured fields object if we have any fields
        if (Object.keys(airtableFields).length > 0) {
          cleanedValues.fields = airtableFields;
        }
        
        // For update record, add the recordId from the selected record
        if (nodeInfo?.type === 'airtable_action_update_record' && selectedRecord) {
          cleanedValues.recordId = selectedRecord.value;
        }
        
        submissionValues = cleanedValues;
        console.log(`🔍 Airtable ${nodeInfo.type} submission structured:`, {
          original: values,
          structured: submissionValues,
          airtableFields
        });
      }
      
      // Save configuration to persistent storage if we have a valid node ID
      if (currentNodeId && nodeInfo?.type) {
        const workflowId = getWorkflowId();
        if (workflowId) {
          console.log('📋 Saving configuration for node:', currentNodeId);
          // Save both config and dynamicOptions
          saveNodeConfig(workflowId, currentNodeId, nodeInfo.type, submissionValues, dynamicOptions);
        }
      }
      
      // Submit with the properly structured values
      onSubmit(submissionValues);
    }} className="h-full flex flex-col">
      <div className="flex-1 flex flex-col min-h-0">
        {/* Show tabs only if we have advanced fields */}
        {advancedFields.length > 0 ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col flex-1">
          <TabsList className="grid w-full grid-cols-2 mb-6 bg-slate-100 p-1 rounded-lg">
            <TabsTrigger 
              value="basic" 
              className={cn(
                "rounded-md transition-all duration-200",
                activeTab === "basic" 
                  ? "bg-white text-slate-900 shadow-sm" 
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Settings className="h-4 w-4 mr-2" />
              Basic Settings
            </TabsTrigger>
            <TabsTrigger 
              value="advanced"
              className={cn(
                "rounded-md transition-all duration-200",
                activeTab === "advanced" 
                  ? "bg-white text-slate-900 shadow-sm" 
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Zap className="h-4 w-4 mr-2" />
              Advanced
            </TabsTrigger>
          </TabsList>
          
          <div className="flex-1 min-h-0">
            <TabsContent value="basic" className="h-full mt-0">
              <ScrollArea className="h-[calc(90vh-220px)] pr-4">
                <div className="space-y-3 px-2 pb-6">
                  {renderFieldsWithTable(basicFields, false)}
                  
                  {/* Records table for Airtable update record - placed after base fields */}
                  {nodeInfo?.providerId === 'airtable' && nodeInfo?.type === 'airtable_action_update_record' && values.tableName && values.baseId && (
                    <div className="mt-6 space-y-4">
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                        <p className="text-sm text-slate-600 mb-3">
                          Select a record from the table below to update. The fields will be populated with the current values.
                        </p>
                        <div className="flex items-center gap-3">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              if (showPreviewData) {
                                setShowPreviewData(false);
                                setPreviewData([]);
                              } else {
                                loadPreviewData(values.baseId, values.tableName);
                              }
                            }}
                            disabled={loadingPreview}
                            className="flex items-center gap-2"
                          >
                            {loadingPreview ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent"></div>
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                            {loadingPreview ? 'Loading...' : showPreviewData ? 'Hide Records' : 'Show Records'}
                          </Button>
                          {showPreviewData && previewData.length > 0 && (
                            <div className="text-sm text-slate-600">
                              {selectedRecord ? (
                                <span className="font-medium text-blue-600">
                                  Selected: {selectedRecord.label || selectedRecord.value}
                                </span>
                              ) : (
                                <span>Click a record to select it</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Records Table for Selection - Updated to match list records design */}
                      {showPreviewData && (
                        <div className="border border-slate-200 rounded-lg bg-white shadow-sm">
                          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 rounded-t-lg">
                            <div className="flex items-center justify-between">
                              <div>
                                <h3 className="text-sm font-medium text-slate-900">
                                  Select Record: {values.tableName}
                                </h3>
                                <p className="text-xs text-slate-600">
                                  {previewData.length} record{previewData.length !== 1 ? 's' : ''} • Click to select
                                  {selectedRecord && (
                                    <span className="ml-2 text-blue-600">Selected: {selectedRecord.label || selectedRecord.value}</span>
                                  )}
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setShowPreviewData(false);
                                  setPreviewData([]);
                                }}
                                className="h-6 w-6 p-0 hover:bg-red-50 hover:text-red-600"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          
                          <div>
                            {previewData.length > 0 ? (
                              <>
                                <style jsx>{`
                                  .update-record-table-container {
                                    overflow: scroll !important;
                                    overflow-x: scroll !important;
                                    overflow-y: scroll !important;
                                  }
                                  .update-record-table-container::-webkit-scrollbar {
                                    width: 16px !important;
                                    height: 16px !important;
                                    background-color: #e2e8f0 !important;
                                    display: block !important;
                                  }
                                  .update-record-table-container::-webkit-scrollbar-track {
                                    background: #f1f5f9 !important;
                                    border-radius: 8px !important;
                                    border: 1px solid #cbd5e1 !important;
                                  }
                                  .update-record-table-container::-webkit-scrollbar-thumb {
                                    background: #475569 !important;
                                    border-radius: 8px !important;
                                    border: 2px solid #e2e8f0 !important;
                                    min-height: 20px !important;
                                    min-width: 20px !important;
                                  }
                                  .update-record-table-container::-webkit-scrollbar-thumb:hover {
                                    background: #334155 !important;
                                  }
                                  .update-record-table-container::-webkit-scrollbar-corner {
                                    background: #f1f5f9 !important;
                                    border: 1px solid #cbd5e1 !important;
                                  }
                                  .update-record-table-container {
                                    scrollbar-width: auto !important;
                                    scrollbar-color: #475569 #f1f5f9 !important;
                                    scrollbar-gutter: stable !important;
                                  }
                                  .selectable-row {
                                    cursor: pointer;
                                    transition: all 0.15s ease;
                                  }
                                  .selectable-row:hover {
                                    background-color: #f0f9ff;
                                  }
                                  .selectable-row.selected {
                                    background-color: #dbeafe;
                                  }
                                `}</style>
                                <div className="relative">
                                  {/* Sticky ID column */}
                                  <div 
                                    className="absolute left-0 top-0 z-20 bg-white"
                                    style={{ 
                                      width: (() => {
                                        let maxWidth = Math.max('ID'.length * 10 + 40, 80);
                                        previewData.slice(0, 8).forEach(record => {
                                          const idValue = record.id || '';
                                          const idWidth = String(idValue).length * 9 + 24;
                                          maxWidth = Math.max(maxWidth, idWidth);
                                        });
                                        return `${Math.min(maxWidth, 250)}px`;
                                      })()
                                    }}
                                  >
                                    <table className="text-sm" style={{ borderSpacing: 0 }}>
                                      <thead className="bg-slate-50/50">
                                        <tr className="h-10">
                                          <th 
                                            className="font-medium text-slate-700 p-2 text-center sticky top-0 bg-slate-50/50 z-30"
                                            style={{ 
                                              width: (() => {
                                                let maxWidth = Math.max('ID'.length * 10 + 40, 80);
                                                previewData.slice(0, 8).forEach(record => {
                                                  const idValue = record.id || '';
                                                  const idWidth = String(idValue).length * 9 + 24;
                                                  maxWidth = Math.max(maxWidth, idWidth);
                                                });
                                                return `${Math.min(maxWidth, 250)}px`;
                                              })()
                                            }}
                                          >
                                            ID
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {previewData.map((record: any) => {
                                          const isSelected = selectedRecord?.value === record.id;
                                          return (
                                            <tr 
                                              key={record.id}
                                              className={`selectable-row h-12 ${isSelected ? 'selected' : ''}`}
                                              onClick={() => {
                                                const newRecord = {
                                                  value: record.id,
                                                  label: record.fields?.[Object.keys(record.fields)[0]] || record.id,
                                                  fields: record.fields
                                                };
                                                setSelectedRecord(newRecord);
                                                setValue('recordId', record.id);
                                                // Populate field values
                                                Object.entries(record.fields || {}).forEach(([fieldName, fieldValue]) => {
                                                  const dynamicFieldName = `airtable_field_${fieldName.toLowerCase().replace(/\s+/g, '_')}`;
                                                  if (!aiFields.has(dynamicFieldName)) {
                                                    setValue(dynamicFieldName, fieldValue);
                                                  }
                                                });
                                              }}
                                            >
                                              <td 
                                                className="font-mono text-xs text-center p-2 bg-white"
                                                style={{ 
                                                  backgroundColor: isSelected ? '#dbeafe' : 'white',
                                                  borderLeft: isSelected ? '3px solid #2563eb' : 'none',
                                                  paddingLeft: isSelected ? 'calc(0.5rem - 3px)' : '0.5rem'
                                                }}
                                              >
                                                {record.id}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                  
                                  {/* Scrollable content area */}
                                  <div 
                                    className="max-h-[300px] update-record-table-container"
                                    style={{ 
                                      marginLeft: (() => {
                                        let maxWidth = Math.max('ID'.length * 10 + 40, 80);
                                        previewData.slice(0, 8).forEach(record => {
                                          const idValue = record.id || '';
                                          const idWidth = String(idValue).length * 9 + 24;
                                          maxWidth = Math.max(maxWidth, idWidth);
                                        });
                                        return `${Math.min(maxWidth, 250)}px`;
                                      })()
                                    }}
                                  >
                                    <table className="text-sm w-full" style={{ borderSpacing: 0 }}>
                                      <thead className="bg-slate-50/50 sticky top-0 z-10">
                                        <tr className="h-10">
                                          {Object.keys(previewData[0]?.fields || {}).map((fieldName) => (
                                            <th 
                                              key={fieldName} 
                                              className="font-medium text-slate-700 p-2 text-left whitespace-nowrap"
                                            >
                                              {fieldName}
                                            </th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {previewData.map((record: any) => {
                                          const isSelected = selectedRecord?.value === record.id;
                                          return (
                                            <tr 
                                              key={record.id}
                                              className={`selectable-row h-12 ${isSelected ? 'selected' : ''}`}
                                              style={{ backgroundColor: isSelected ? '#dbeafe' : 'transparent' }}
                                              onClick={() => {
                                                const newRecord = {
                                                  value: record.id,
                                                  label: record.fields?.[Object.keys(record.fields)[0]] || record.id,
                                                  fields: record.fields
                                                };
                                                setSelectedRecord(newRecord);
                                                setValue('recordId', record.id);
                                                // Populate field values
                                                Object.entries(record.fields || {}).forEach(([fieldName, fieldValue]) => {
                                                  const dynamicFieldName = `airtable_field_${fieldName.toLowerCase().replace(/\s+/g, '_')}`;
                                                  if (!aiFields.has(dynamicFieldName)) {
                                                    setValue(dynamicFieldName, fieldValue);
                                                  }
                                                });
                                              }}
                                            >
                                              {Object.entries(record.fields || {}).map(([fieldName, fieldValue]: [string, any]) => (
                                                <td key={fieldName} className="p-2 whitespace-nowrap">
                                                  {Array.isArray(fieldValue) 
                                                    ? `[${fieldValue.length} items]`
                                                    : typeof fieldValue === 'object' && fieldValue !== null
                                                    ? JSON.stringify(fieldValue).substring(0, 50)
                                                    : String(fieldValue || '').substring(0, 100)}
                                                </td>
                                              ))}
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </>
                            ) : (
                              <div className="p-8 text-center text-slate-500">
                                <Database className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                                <p className="text-sm">No records found in this table</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Render dynamic fields for basic tab */}
                  {dynamicFields.length > 0 && renderFieldsWithTable(dynamicFields, true)}
                  
                  {/* Preview button for Airtable list records - placed after all fields */}
                  {nodeInfo?.providerId === 'airtable' && nodeInfo?.type === 'airtable_action_list_records' && values.tableName && values.baseId && (
                    <div className="mt-6 space-y-4">
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                        <p className="text-sm text-slate-600 mb-3">
                          Preview the data that will be retrieved from the selected table. This shows all records that would be returned when the workflow runs.
                        </p>
                        <div className="flex items-center gap-3">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              if (showPreviewData) {
                                setShowPreviewData(false);
                                setPreviewData([]);
                              } else {
                                loadPreviewData(values.baseId, values.tableName);
                              }
                            }}
                            disabled={loadingPreview}
                            className="flex items-center gap-2"
                          >
                            {loadingPreview ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent"></div>
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                            {loadingPreview ? 'Loading...' : showPreviewData ? 'Hide Preview' : 'Preview Records'}
                          </Button>
                          {showPreviewData && previewData.length > 0 && (
                            <div className="text-sm text-slate-600">
                              Showing {previewData.length} record{previewData.length !== 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Preview Data Table */}
                      {showPreviewData && (
                        <div className="border border-slate-200 rounded-lg bg-white shadow-sm">
                          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 rounded-t-lg">
                            <div className="flex items-center justify-between">
                              <div>
                                <h3 className="text-sm font-medium text-slate-900">
                                  Preview: {values.tableName}
                                </h3>
                                <p className="text-xs text-slate-600">
                                  {previewData.length} record{previewData.length !== 1 ? 's' : ''} • Data available in workflow
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setShowPreviewData(false);
                                  setPreviewData([]);
                                }}
                                className="h-6 w-6 p-0 hover:bg-red-50 hover:text-red-600"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          
                          <div>
                            {previewData.length > 0 ? (
                              <>
                                <style jsx>{`
                                  .preview-table-container {
                                    overflow: scroll !important;
                                    overflow-x: scroll !important;
                                    overflow-y: scroll !important;
                                  }
                                  .preview-table-container::-webkit-scrollbar {
                                    width: 16px !important;
                                    height: 16px !important;
                                    background-color: #e2e8f0 !important;
                                    display: block !important;
                                  }
                                  .preview-table-container::-webkit-scrollbar-track {
                                    background: #f1f5f9 !important;
                                    border-radius: 8px !important;
                                    border: 1px solid #cbd5e1 !important;
                                  }
                                  .preview-table-container::-webkit-scrollbar-thumb {
                                    background: #475569 !important;
                                    border-radius: 8px !important;
                                    border: 2px solid #e2e8f0 !important;
                                    min-height: 20px !important;
                                    min-width: 20px !important;
                                  }
                                  .preview-table-container::-webkit-scrollbar-thumb:hover {
                                    background: #334155 !important;
                                  }
                                  .preview-table-container::-webkit-scrollbar-corner {
                                    background: #f1f5f9 !important;
                                    border: 1px solid #cbd5e1 !important;
                                  }
                                  .preview-table-container {
                                    scrollbar-width: auto !important;
                                    scrollbar-color: #475569 #f1f5f9 !important;
                                    scrollbar-gutter: stable !important;
                                  }
                                `}</style>
                                <div className="relative">
                                  {/* Sticky ID column positioned absolutely */}
                                  <div 
                                    className="absolute left-0 top-0 z-20 bg-white"
                                    style={{ 
                                      width: (() => {
                                        let maxWidth = Math.max('ID'.length * 10 + 40, 80);
                                        previewData.slice(0, 8).forEach(record => {
                                          const idValue = record.value || record.id || '';
                                          const idWidth = String(idValue).length * 9 + 24;
                                          maxWidth = Math.max(maxWidth, idWidth);
                                        });
                                        return `${Math.min(maxWidth, 250)}px`;
                                      })()
                                    }}
                                  >
                                    <table className="text-sm" style={{ borderSpacing: 0 }}>
                                      <thead className="bg-slate-50/50">
                                        <tr className="h-10">
                                          <th 
                                            className="font-medium text-slate-700 p-2 text-center"
                                            style={{ 
                                              width: (() => {
                                                let maxWidth = Math.max('ID'.length * 10 + 40, 80);
                                                previewData.slice(0, 8).forEach(record => {
                                                  const idValue = record.value || record.id || '';
                                                  const idWidth = String(idValue).length * 9 + 24;
                                                  maxWidth = Math.max(maxWidth, idWidth);
                                                });
                                                return `${Math.min(maxWidth, 250)}px`;
                                              })()
                                            }}
                                          >
                                            ID
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {previewData.slice(0, 8).map((record: any, index: number) => {
                                          const idColumnWidth = (() => {
                                            let maxWidth = Math.max('ID'.length * 10 + 40, 80);
                                            previewData.slice(0, 8).forEach(rec => {
                                              const idValue = rec.value || rec.id || '';
                                              const idWidth = String(idValue).length * 9 + 24;
                                              maxWidth = Math.max(maxWidth, idWidth);
                                            });
                                            return Math.min(maxWidth, 250);
                                          })();
                                          
                                          return (
                                            <tr key={`id-${record.value || record.id || index}`} className="hover:bg-slate-50/50 h-12">
                                              <td 
                                                className="font-mono text-xs text-slate-500 bg-slate-50/30 p-2 text-center align-middle overflow-hidden"
                                                style={{ width: `${idColumnWidth}px`, boxSizing: 'border-box' }}
                                              >
                                                <div 
                                                  className="flex items-center justify-center h-12 overflow-hidden" 
                                                  style={{ width: `${idColumnWidth - 16}px` }}
                                                  title={record.value || record.id || ''}
                                                >
                                                  <span className="text-center" style={{ lineHeight: '1.2' }}>
                                                    {record.value || record.id || ''}
                                                  </span>
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                        {previewData.length > 8 && (
                                          <tr className="h-12">
                                            <td className="p-2 text-center text-xs text-slate-500 bg-slate-50">
                                              ...
                                            </td>
                                          </tr>
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                  
                                  {/* Scrollable content area starting after ID column */}
                                  <div 
                                    className="max-h-[300px] preview-table-container"
                                    style={{ 
                                      marginLeft: (() => {
                                        // Calculate dynamic ID column width for margin
                                        let maxWidth = Math.max('ID'.length * 10 + 40, 80);
                                        previewData.slice(0, 8).forEach(record => {
                                          const idValue = record.value || record.id || '';
                                          const idWidth = String(idValue).length * 9 + 24;
                                          maxWidth = Math.max(maxWidth, idWidth);
                                        });
                                        return `${Math.min(maxWidth, 250)}px`;
                                      })(),
                                      maxWidth: (() => {
                                        // Calculate max width accounting for dynamic ID column - more restrictive
                                        let idWidth = Math.max('ID'.length * 10 + 40, 80);
                                        previewData.slice(0, 8).forEach(record => {
                                          const idValue = record.value || record.id || '';
                                          const calcWidth = String(idValue).length * 9 + 24;
                                          idWidth = Math.max(idWidth, calcWidth);
                                        });
                                        idWidth = Math.min(idWidth, 250);
                                        return `calc(100vw - ${idWidth}px - 380px - 140px)`; // Even more space for Variables panel
                                      })(), // Account for ID column + Variables panel + more padding
                                      overflow: 'scroll',
                                      overflowX: 'scroll',
                                      overflowY: 'scroll',
                                      scrollbarWidth: 'auto',
                                      scrollbarColor: '#475569 #f1f5f9',
                                      WebkitOverflowScrolling: 'touch'
                                    }}
                                  >
                                    <table 
                                      className="text-sm"
                                      style={{ 
                                        borderSpacing: 0,
                                        width: (() => {
                                          // Calculate dynamic width based on content
                                          const fields = Object.keys(previewData[0]?.fields || {});
                                          if (fields.length === 0) return '800px';
                                          
                                          // Calculate dynamic ID column width
                                          let idColumnWidth = Math.max('ID'.length * 10 + 40, 80);
                                          previewData.slice(0, 8).forEach(record => {
                                            const idValue = record.value || record.id || '';
                                            const idWidth = String(idValue).length * 9 + 24;
                                            idColumnWidth = Math.max(idColumnWidth, idWidth);
                                          });
                                          idColumnWidth = Math.min(idColumnWidth, 250);
                                          
                                          // Calculate width for each column based on content
                                          let totalWidth = 0;
                                          fields.forEach(fieldName => {
                                            // Calculate header width
                                            let maxWidth = Math.max(fieldName.length * 8 + 32, 100); // 8px per char + padding
                                            
                                            // Check data width for this field
                                            previewData.slice(0, 8).forEach(record => {
                                              const value = record.fields?.[fieldName];
                                              
                                              // Check if this is an attachment field
                                              const isAttachment = Array.isArray(value) && 
                                                value.length > 0 && 
                                                value[0] && 
                                                typeof value[0] === 'object' && 
                                                value[0].url && 
                                                value[0].filename;
                                              
                                              if (isAttachment) {
                                                // For attachment fields, calculate width based on thumbnail count
                                                const thumbnailCount = Math.min(value.length, 3);
                                                const hasMoreIndicator = value.length > 3;
                                                const attachmentWidth = (thumbnailCount * 32) + ((thumbnailCount - 1) * 4) + (hasMoreIndicator ? 36 : 0) + 32; // 32px per thumbnail + 4px gap + more indicator + padding
                                                maxWidth = Math.max(maxWidth, attachmentWidth);
                                              } else {
                                                // Regular text width calculation
                                                const valueStr = Array.isArray(value) 
                                                  ? value.join(', ') 
                                                  : String(value || '');
                                                const valueWidth = Math.min(valueStr.length * 7 + 16, 300);
                                                maxWidth = Math.max(maxWidth, valueWidth);
                                              }
                                            });
                                            totalWidth += maxWidth;
                                          });
                                          
                                          // For the last column, add dynamic ID column width for perfect alignment
                                          let finalWidth = totalWidth;
                                          if (fields.length > 0) {
                                            finalWidth = totalWidth + idColumnWidth;
                                          }
                                          
                                          return `${finalWidth}px`;
                                        })(),
                                        tableLayout: 'fixed'
                                      }}
                                    >
                                      <thead className="bg-slate-50/50 sticky top-0 z-10">
                                        <tr className="h-10">
                                          {/* Show all fields with horizontal scrolling - no ID column here */}
                                          {Object.keys(previewData[0]?.fields || {}).map((fieldName, index, fields) => {
                                            // Calculate column width
                                            let columnWidth = Math.max(fieldName.length * 8 + 32, 100);
                                            previewData.slice(0, 8).forEach(record => {
                                              const value = record.fields?.[fieldName];
                                              
                                              // Check if this is an attachment field
                                              const isAttachment = Array.isArray(value) && 
                                                value.length > 0 && 
                                                value[0] && 
                                                typeof value[0] === 'object' && 
                                                value[0].url && 
                                                value[0].filename;
                                              
                                              if (isAttachment) {
                                                // For attachment fields, calculate width based on thumbnail count
                                                const thumbnailCount = Math.min(value.length, 3);
                                                const hasMoreIndicator = value.length > 3;
                                                const attachmentWidth = (thumbnailCount * 32) + ((thumbnailCount - 1) * 4) + (hasMoreIndicator ? 36 : 0) + 32; // 32px per thumbnail + 4px gap + more indicator + padding
                                                columnWidth = Math.max(columnWidth, attachmentWidth);
                                              } else {
                                                // Regular text width calculation
                                                const valueStr = Array.isArray(value) 
                                                  ? value.join(', ') 
                                                  : String(value || '');
                                                const valueWidth = Math.min(valueStr.length * 7 + 16, 300);
                                                columnWidth = Math.max(columnWidth, valueWidth);
                                              }
                                            });
                                            
                                            // For the last column, add dynamic ID column width for perfect alignment
                                            if (index === fields.length - 1) {
                                              let idColumnWidth = Math.max('ID'.length * 10 + 40, 80);
                                              previewData.slice(0, 8).forEach(record => {
                                                const idValue = record.value || record.id || '';
                                                const idWidth = String(idValue).length * 9 + 24;
                                                idColumnWidth = Math.max(idColumnWidth, idWidth);
                                              });
                                              idColumnWidth = Math.min(idColumnWidth, 250);
                                              columnWidth += idColumnWidth; // Add dynamic ID column width for perfect alignment
                                            }
                                            
                                            return (
                                              <th 
                                                key={fieldName} 
                                                className="font-medium text-slate-700 last:border-r-0 p-2 whitespace-nowrap text-center" 
                                                style={{ width: `${columnWidth}px`, minWidth: `${columnWidth}px` }}
                                              >
                                                <div title={fieldName} className="text-center">
                                                  {fieldName}
                                                </div>
                                              </th>
                                            );
                                          })}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {previewData.slice(0, 8).map((record: any, index: number) => (
                                          <tr key={record.value || record.id || index} className="hover:bg-slate-50/50 h-12">
                                            {/* No ID cell - start directly with field data */}
                                            {Object.entries(record.fields || {}).map(([fieldName, fieldValue]: [string, any], fieldIndex: number) => {
                                              const fieldNames = Object.keys(record.fields || {});
                                              const isLastColumn = fieldIndex === fieldNames.length - 1;
                                              
                                              // Calculate column width (same logic as header)
                                              let columnWidth = Math.max(fieldName.length * 8 + 32, 100);
                                              previewData.slice(0, 8).forEach(rec => {
                                                const value = rec.fields?.[fieldName];
                                                
                                                // Check if this is an attachment field
                                                const isAttachment = Array.isArray(value) && 
                                                  value.length > 0 && 
                                                  value[0] && 
                                                  typeof value[0] === 'object' && 
                                                  value[0].url && 
                                                  value[0].filename;
                                                
                                                if (isAttachment) {
                                                  // For attachment fields, calculate width based on thumbnail count
                                                  const thumbnailCount = Math.min(value.length, 3);
                                                  const hasMoreIndicator = value.length > 3;
                                                  const attachmentWidth = (thumbnailCount * 32) + ((thumbnailCount - 1) * 4) + (hasMoreIndicator ? 36 : 0) + 32; // 32px per thumbnail + 4px gap + more indicator + padding
                                                  columnWidth = Math.max(columnWidth, attachmentWidth);
                                                } else {
                                                  // Regular text width calculation
                                                  const valueStr = Array.isArray(value) 
                                                    ? value.join(', ') 
                                                    : String(value || '');
                                                  const valueWidth = Math.min(valueStr.length * 7 + 16, 300);
                                                  columnWidth = Math.max(columnWidth, valueWidth);
                                                }
                                              });
                                              
                                              // For the last column, add dynamic ID column width for perfect alignment
                                              if (isLastColumn) {
                                                let idColumnWidth = Math.max('ID'.length * 10 + 40, 80);
                                                previewData.slice(0, 8).forEach(rec => {
                                                  const idValue = rec.value || rec.id || '';
                                                  const idWidth = String(idValue).length * 9 + 24;
                                                  idColumnWidth = Math.max(idColumnWidth, idWidth);
                                                });
                                                idColumnWidth = Math.min(idColumnWidth, 250);
                                                columnWidth += idColumnWidth;
                                              }
                                              
                                              // Check if this field value is an attachment
                                              const isAttachment = Array.isArray(fieldValue) && 
                                                fieldValue.length > 0 && 
                                                fieldValue[0] && 
                                                typeof fieldValue[0] === 'object' && 
                                                fieldValue[0].url && 
                                                fieldValue[0].filename;
                                              
                                              return (
                                                <td 
                                                  key={`${record.id}-${fieldName}-${fieldIndex}`} 
                                                  className="last:border-r-0 p-2 text-center align-middle overflow-hidden"
                                                  style={{ width: `${columnWidth}px`, minWidth: `${columnWidth}px`, boxSizing: 'border-box' }}
                                                >
                                                  <div className="flex items-center justify-center h-12 overflow-hidden" style={{ width: `${columnWidth - 16}px` }}>
                                                    {(() => {
                                                      // Check if this is an Airtable attachment field
                                                      const isAttachment = Array.isArray(fieldValue) && 
                                                        fieldValue.length > 0 && 
                                                        fieldValue[0] && 
                                                        typeof fieldValue[0] === 'object' && 
                                                        fieldValue[0].url && 
                                                        fieldValue[0].filename;
                                                      
                                                      if (isAttachment) {
                                                        // Render attachment thumbnails
                                                        return (
                                                          <div className="flex flex-wrap gap-1 justify-center">
                                                            {fieldValue.slice(0, 3).map((attachment: any, index: number) => {
                                                              const isImage = attachment.type?.startsWith('image/') || 
                                                                /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(attachment.filename || '');
                                                              
                                                              if (isImage) {
                                                                const thumbnailUrl = attachment.thumbnails?.small?.url || attachment.url;
                                                                return (
                                                                  <div 
                                                                    key={`${attachment.id || index}`}
                                                                    className="relative group"
                                                                    title={`${attachment.filename} (${(attachment.size / 1024).toFixed(1)}KB)`}
                                                                  >
                                                                    <img 
                                                                      src={thumbnailUrl}
                                                                      alt={attachment.filename || 'Attachment'}
                                                                      className="w-8 h-8 object-cover rounded border border-slate-200 hover:border-blue-300 transition-colors"
                                                                      onError={(e) => {
                                                                        // Fallback to file icon if image fails to load
                                                                        const target = e.target as HTMLImageElement;
                                                                        target.style.display = 'none';
                                                                        const parent = target.parentElement;
                                                                        if (parent) {
                                                                          parent.innerHTML = `
                                                                            <div class="w-8 h-8 bg-slate-100 rounded border border-slate-200 flex items-center justify-center">
                                                                              <span class="text-xs text-slate-500">📎</span>
                                                                            </div>
                                                                          `;
                                                                        }
                                                                      }}
                                                                    />
                                                                  </div>
                                                                );
                                                              } else {
                                                                // Non-image attachment - show file icon
                                                                return (
                                                                  <div 
                                                                    key={`${attachment.id || index}`}
                                                                    className="w-8 h-8 bg-slate-100 rounded border border-slate-200 flex items-center justify-center"
                                                                    title={`${attachment.filename} (${(attachment.size / 1024).toFixed(1)}KB)`}
                                                                  >
                                                                    <span className="text-xs text-slate-500">📎</span>
                                                                  </div>
                                                                );
                                                              }
                                                            })}
                                                            {fieldValue.length > 3 && (
                                                              <div className="w-8 h-8 bg-slate-50 rounded border border-slate-200 flex items-center justify-center">
                                                                <span className="text-xs text-slate-400">+{fieldValue.length - 3}</span>
                                                              </div>
                                                            )}
                                                          </div>
                                                        );
                                                      }
                                                      
                                                      // Regular array handling
                                                      if (Array.isArray(fieldValue)) {
                                                        return (
                                                          <div className="text-xs text-slate-900 text-center py-2 px-1 flex items-center justify-center">
                                                            <span className="block text-center" title={fieldValue.join(', ')} style={{ lineHeight: '1.2', 
                                                              maxWidth: `${columnWidth - 32}px`,
                                                              wordBreak: 'break-word',
                                                              overflowWrap: 'break-word',
                                                              whiteSpace: 'pre-wrap'
                                                            }}>
                                                              {fieldValue.length > 0 ? fieldValue.join(', ') : '[]'}
                                                            </span>
                                                          </div>
                                                        );
                                                      }
                                                      
                                                      // Regular field value
                                                      const displayValue = String(fieldValue || '');
                                                      const isTruncated = displayValue.length > 25;
                                                      const truncatedValue = isTruncated ? displayValue.substring(0, 25) + '...' : displayValue;
                                                      
                                                      return (
                                                        <div className="text-xs text-slate-900 text-center py-2 px-1 flex items-center justify-center">
                                                          <span 
                                                            className="block text-center" 
                                                            title={displayValue}
                                                            style={{ lineHeight: '1.2', 
                                                              maxWidth: `${columnWidth - 32}px`,
                                                              wordBreak: 'break-word',
                                                              overflowWrap: 'break-word',
                                                              whiteSpace: 'pre-wrap'
                                                            }}
                                                          >
                                                            {displayValue || '-'}
                                                          </span>
                                                        </div>
                                                      );
                                                    })()}
                                                  </div>
                                                </td>
                                              );
                                            })}
                                          </tr>
                                        ))}
                                        {previewData.length > 8 && (
                                          <tr className="h-12">
                                            <td 
                                              colSpan={Object.keys(previewData[0]?.fields || {}).length + 1} 
                                              className="p-2 text-center text-xs text-slate-500 bg-slate-50"
                                            >
                                              ... and {previewData.length - 8} more record{previewData.length - 8 !== 1 ? 's' : ''}
                                            </td>
                                          </tr>
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                                
                                <div className="flex justify-between items-center mt-2 py-3 px-4 border-t border-slate-200 min-h-[44px]">
                                  <div className="flex items-center text-xs text-slate-500">
                                    <span>Total: {previewData.length} record{previewData.length !== 1 ? 's' : ''}</span>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      loadPreviewData(values.baseId, values.tableName);
                                    }}
                                    disabled={loadingPreview}
                                    className="h-8 px-3 text-xs bg-white border-slate-300 hover:bg-blue-50 hover:border-blue-400 text-slate-700 hover:text-blue-700 font-medium"
                                    title="Refresh preview data"
                                  >
                                    <div className="flex items-center gap-1.5">
                                      {loadingPreview ? (
                                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
                                      ) : (
                                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                      )}
                                      <span>Refresh</span>
                                    </div>
                                  </Button>
                                </div>
                              </>
                            ) : (
                              <div className="text-center py-4">
                                <div className="text-slate-500 mb-1">
                                  {(values.filterField || values.dateFilter !== 'all_time') ? (
                                    'No records match your current filters'
                                  ) : (
                                    'No records found in this table'
                                  )}
                                </div>
                                {(values.filterField || values.dateFilter !== 'all_time') && (
                                  <div className="text-xs text-slate-400">
                                    Try adjusting your filter criteria
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                </div>
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="advanced" className="h-full mt-0">
              <ScrollArea className="h-[calc(90vh-220px)] pr-4">
                <div className="space-y-3 px-2 pb-6">
                  {renderFieldsWithTable(advancedFields, false)}
                  {/* Render dynamic fields for advanced tab */}
                  {dynamicAdvancedFields.length > 0 && renderFieldsWithTable(dynamicAdvancedFields, true)}
                </div>
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
      ) : (
        // Simple view without tabs if no advanced fields
        <ScrollArea className="h-[calc(90vh-180px)] pr-4">
          <div className="space-y-3 px-2 pb-6">
            {renderFieldsWithTable(basicFields, false)}
            {/* Render dynamic fields for simple view */}
            {dynamicFields.length > 0 && renderFieldsWithTable(dynamicFields, true)}
            
            {/* Preview button for Airtable list records - placed after all fields (simple view) */}
            {nodeInfo?.providerId === 'airtable' && nodeInfo?.type === 'airtable_action_list_records' && values.tableName && values.baseId && (
              <div className="mt-6 space-y-4">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <p className="text-sm text-slate-600 mb-3">
                    Preview the data that will be retrieved from the selected table. This shows all records that would be returned when the workflow runs.
                  </p>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        if (showPreviewData) {
                          setShowPreviewData(false);
                          setPreviewData([]);
                        } else {
                          loadPreviewData(values.baseId, values.tableName);
                        }
                      }}
                      disabled={loadingPreview}
                      className="flex items-center gap-2"
                    >
                      {loadingPreview ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent"></div>
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                      {loadingPreview ? 'Loading...' : showPreviewData ? 'Hide Preview' : 'Preview Records'}
                    </Button>
                    {showPreviewData && previewData.length > 0 && (
                      <div className="text-sm text-slate-600">
                        Showing {previewData.length} record{previewData.length !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Preview Data Table */}
                {showPreviewData && (
                  <div className="border border-slate-200 rounded-lg bg-white shadow-sm">
                    <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 rounded-t-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-medium text-slate-900">
                            Preview: {values.tableName}
                          </h3>
                          <p className="text-xs text-slate-600">
                            {previewData.length} record{previewData.length !== 1 ? 's' : ''} • Data available in workflow
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setShowPreviewData(false);
                            setPreviewData([]);
                          }}
                          className="h-6 w-6 p-0 hover:bg-red-50 hover:text-red-600"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    
                    <div>
                      {previewData.length > 0 ? (
                        <>
                          <style jsx>{`
                            .preview-table-container-2 {
                              overflow: scroll !important;
                              overflow-x: scroll !important;
                              overflow-y: scroll !important;
                            }
                            .preview-table-container-2::-webkit-scrollbar {
                              width: 16px !important;
                              height: 16px !important;
                              background-color: #e2e8f0 !important;
                              display: block !important;
                            }
                            .preview-table-container-2::-webkit-scrollbar-track {
                              background: #f1f5f9 !important;
                              border-radius: 8px !important;
                              border: 1px solid #cbd5e1 !important;
                            }
                            .preview-table-container-2::-webkit-scrollbar-thumb {
                              background: #475569 !important;
                              border-radius: 8px !important;
                              border: 2px solid #e2e8f0 !important;
                              min-height: 20px !important;
                              min-width: 20px !important;
                            }
                            .preview-table-container-2::-webkit-scrollbar-thumb:hover {
                              background: #334155 !important;
                            }
                            .preview-table-container-2::-webkit-scrollbar-corner {
                              background: #f1f5f9 !important;
                              border: 1px solid #cbd5e1 !important;
                            }
                            .preview-table-container-2 {
                              scrollbar-width: auto !important;
                              scrollbar-color: #475569 #f1f5f9 !important;
                              scrollbar-gutter: stable !important;
                            }
                          `}</style>
                          <div className="relative">
                            {/* Sticky ID column positioned absolutely */}
                            <div 
                              className="absolute left-0 top-0 z-20 bg-white"
                              style={{ 
                                width: (() => {
                                  let maxWidth = Math.max('ID'.length * 10 + 40, 80);
                                  previewData.slice(0, 8).forEach(record => {
                                    const idValue = record.value || record.id || '';
                                    const idWidth = String(idValue).length * 9 + 24;
                                    maxWidth = Math.max(maxWidth, idWidth);
                                  });
                                  return `${Math.min(maxWidth, 250)}px`;
                                })()
                              }}
                            >
                              <table className="text-sm" style={{ borderSpacing: 0 }}>
                                <thead className="bg-slate-50/50">
                                  <tr className="h-10">
                                    <th 
                                      className="font-medium text-slate-700 p-2 text-center"
                                      style={{ 
                                        width: (() => {
                                          let maxWidth = Math.max('ID'.length * 10 + 40, 80);
                                          previewData.slice(0, 8).forEach(record => {
                                            const idValue = record.value || record.id || '';
                                            const idWidth = String(idValue).length * 9 + 24;
                                            maxWidth = Math.max(maxWidth, idWidth);
                                          });
                                          return `${Math.min(maxWidth, 250)}px`;
                                        })()
                                      }}
                                    >
                                      ID
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {previewData.slice(0, 8).map((record: any, index: number) => {
                                    const idColumnWidth = (() => {
                                      let maxWidth = Math.max('ID'.length * 10 + 40, 80);
                                      previewData.slice(0, 8).forEach(rec => {
                                        const idValue = rec.value || rec.id || '';
                                        const idWidth = String(idValue).length * 9 + 24;
                                        maxWidth = Math.max(maxWidth, idWidth);
                                      });
                                      return Math.min(maxWidth, 250);
                                    })();
                                    
                                    return (
                                      <tr key={`id-${record.value || record.id || index}`} className="hover:bg-slate-50/50 h-12">
                                        <td 
                                          className="font-mono text-xs text-slate-500 bg-slate-50/30 p-2 text-center align-middle overflow-hidden"
                                          style={{ width: `${idColumnWidth}px`, boxSizing: 'border-box' }}
                                        >
                                          <div 
                                            className="flex items-center justify-center h-12 overflow-hidden" 
                                            style={{ width: `${idColumnWidth - 16}px` }}
                                            title={record.value || record.id || ''}
                                          >
                                            <span className="text-center" style={{ lineHeight: '1.2' }}>
                                              {record.value || record.id || ''}
                                            </span>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                  {previewData.length > 8 && (
                                    <tr className="h-12">
                                      <td className="p-2 text-center text-xs text-slate-500 bg-slate-50">
                                        ...
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                            
                            {/* Scrollable content area starting after ID column */}
                            <div 
                              className="max-h-[300px] preview-table-container-2"
                              style={{ 
                                marginLeft: (() => {
                                  // Calculate dynamic ID column width for margin
                                  let maxWidth = Math.max('ID'.length * 10 + 40, 80);
                                  previewData.slice(0, 8).forEach(record => {
                                    const idValue = record.value || record.id || '';
                                    const idWidth = String(idValue).length * 9 + 24;
                                    maxWidth = Math.max(maxWidth, idWidth);
                                  });
                                  return `${Math.min(maxWidth, 250)}px`;
                                })(),
                                maxWidth: (() => {
                                  // Calculate max width accounting for dynamic ID column - more restrictive
                                  let idWidth = Math.max('ID'.length * 10 + 40, 80);
                                  previewData.slice(0, 8).forEach(record => {
                                    const idValue = record.value || record.id || '';
                                    const calcWidth = String(idValue).length * 9 + 24;
                                    idWidth = Math.max(idWidth, calcWidth);
                                  });
                                  idWidth = Math.min(idWidth, 250);
                                  return `calc(100vw - ${idWidth}px - 380px - 140px)`; // Even more space for Variables panel
                                })(), // Account for ID column + Variables panel + more padding
                                overflow: 'scroll',
                                overflowX: 'scroll',
                                overflowY: 'scroll',
                                scrollbarWidth: 'auto',
                                scrollbarColor: '#475569 #f1f5f9',
                                WebkitOverflowScrolling: 'touch'
                              }}
                            >
                              <table 
                                className="text-sm"
                                style={{ 
                                  borderSpacing: 0,
                                  width: (() => {
                                    // Calculate dynamic width based on content
                                    const fields = Object.keys(previewData[0]?.fields || {});
                                    if (fields.length === 0) return '800px';
                                    
                                    // Calculate dynamic ID column width
                                    let idColumnWidth = Math.max('ID'.length * 10 + 40, 80);
                                    previewData.slice(0, 8).forEach(record => {
                                      const idValue = record.value || record.id || '';
                                      const idWidth = String(idValue).length * 9 + 24;
                                      idColumnWidth = Math.max(idColumnWidth, idWidth);
                                    });
                                    idColumnWidth = Math.min(idColumnWidth, 250);
                                    
                                    // Calculate width for each column based on content
                                    let totalWidth = 0;
                                    fields.forEach(fieldName => {
                                      // Calculate header width
                                      let maxWidth = Math.max(fieldName.length * 8 + 32, 100); // 8px per char + padding
                                      
                                      // Check data width for this field
                                      previewData.slice(0, 8).forEach(record => {
                                        const value = record.fields?.[fieldName];
                                        
                                        // Check if this is an attachment field
                                        const isAttachment = Array.isArray(value) && 
                                          value.length > 0 && 
                                          value[0] && 
                                          typeof value[0] === 'object' && 
                                          value[0].url && 
                                          value[0].filename;
                                        
                                        if (isAttachment) {
                                          // For attachment fields, calculate width based on thumbnail count
                                          const thumbnailCount = Math.min(value.length, 3);
                                          const hasMoreIndicator = value.length > 3;
                                          const attachmentWidth = (thumbnailCount * 32) + ((thumbnailCount - 1) * 4) + (hasMoreIndicator ? 36 : 0) + 32; // 32px per thumbnail + 4px gap + more indicator + padding
                                          maxWidth = Math.max(maxWidth, attachmentWidth);
                                        } else {
                                          // Regular text width calculation
                                          const valueStr = Array.isArray(value) 
                                            ? value.join(', ') 
                                            : String(value || '');
                                          const valueWidth = Math.min(valueStr.length * 7 + 16, 300);
                                          maxWidth = Math.max(maxWidth, valueWidth);
                                        }
                                      });
                                      totalWidth += maxWidth;
                                    });
                                    
                                    // For the last column, add dynamic ID column width for perfect alignment
                                    let finalWidth = totalWidth;
                                    if (fields.length > 0) {
                                      finalWidth = totalWidth + idColumnWidth;
                                    }
                                    
                                    return `${finalWidth}px`;
                                  })(),
                                  tableLayout: 'fixed'
                                }}
                              >
                                <thead className="bg-slate-50/50 sticky top-0 z-10">
                                  <tr className="h-10">
                                    {Object.keys(previewData[0]?.fields || {}).map((fieldName) => {
                                      let columnWidth = Math.max(fieldName.length * 8 + 32, 100);
                                      previewData.slice(0, 8).forEach(record => {
                                        const value = record.fields?.[fieldName];
                                        const valueStr = Array.isArray(value) 
                                          ? value.join(', ') 
                                          : String(value || '');
                                        const valueWidth = Math.min(valueStr.length * 7 + 16, 300);
                                        columnWidth = Math.max(columnWidth, valueWidth);
                                      });
                                      
                                      return (
                                        <th 
                                          key={fieldName} 
                                          className="font-medium text-slate-700 last:border-r-0 p-2 whitespace-nowrap text-center" 
                                          style={{ width: `${columnWidth}px`, minWidth: `${columnWidth}px` }}
                                        >
                                          <div title={fieldName} className="text-center">
                                            {fieldName}
                                          </div>
                                        </th>
                                      );
                                    })}
                                  </tr>
                                </thead>
                                <tbody>
                                  {previewData.slice(0, 8).map((record: any, index: number) => (
                                    <tr key={record.value || record.id || index} className="hover:bg-slate-50/50 h-12">
                                      {/* No ID cell - start directly with field data */}
                                      {Object.entries(record.fields || {}).map(([fieldName, fieldValue]: [string, any], fieldIndex: number) => {
                                        const fieldNames = Object.keys(record.fields || {});
                                        const isLastColumn = fieldIndex === fieldNames.length - 1;
                                        
                                        // Calculate column width (same logic as header)
                                        let columnWidth = Math.max(fieldName.length * 8 + 32, 100);
                                        previewData.slice(0, 8).forEach(rec => {
                                          const value = rec.fields?.[fieldName];
                                          
                                          // Check if this is an attachment field
                                          const isAttachment = Array.isArray(value) && 
                                            value.length > 0 && 
                                            value[0] && 
                                            typeof value[0] === 'object' && 
                                            value[0].url && 
                                            value[0].filename;
                                          
                                          if (isAttachment) {
                                            // For attachment fields, calculate width based on thumbnail count
                                            const thumbnailCount = Math.min(value.length, 3);
                                            const hasMoreIndicator = value.length > 3;
                                            const attachmentWidth = (thumbnailCount * 32) + ((thumbnailCount - 1) * 4) + (hasMoreIndicator ? 36 : 0) + 32; // 32px per thumbnail + 4px gap + more indicator + padding
                                            columnWidth = Math.max(columnWidth, attachmentWidth);
                                          } else {
                                            // Regular text width calculation
                                            const valueStr = Array.isArray(value) 
                                              ? value.join(', ') 
                                              : String(value || '');
                                            const valueWidth = Math.min(valueStr.length * 7 + 16, 300);
                                            columnWidth = Math.max(columnWidth, valueWidth);
                                          }
                                        });
                                        
                                        // For the last column, add dynamic ID column width for perfect alignment
                                        if (isLastColumn) {
                                          let idColumnWidth = Math.max('ID'.length * 10 + 40, 80);
                                          previewData.slice(0, 8).forEach(rec => {
                                            const idValue = rec.value || rec.id || '';
                                            const idWidth = String(idValue).length * 9 + 24;
                                            idColumnWidth = Math.max(idColumnWidth, idWidth);
                                          });
                                          idColumnWidth = Math.min(idColumnWidth, 250);
                                          columnWidth += idColumnWidth;
                                        }
                                        
                                        return (
                                          <td 
                                            key={`${record.id}-${fieldName}-${fieldIndex}`} 
                                            className="last:border-r-0 p-2 text-center align-middle overflow-hidden"
                                            style={{ width: `${columnWidth}px`, minWidth: `${columnWidth}px`, boxSizing: 'border-box' }}
                                          >
                                            <div className="flex items-center justify-center h-12 overflow-hidden" style={{ width: `${columnWidth - 16}px` }}>
                                              {(() => {
                                                // Check if this is an Airtable attachment field
                                                const isAttachment = Array.isArray(fieldValue) && 
                                                  fieldValue.length > 0 && 
                                                  fieldValue[0] && 
                                                  typeof fieldValue[0] === 'object' && 
                                                  fieldValue[0].url && 
                                                  fieldValue[0].filename;
                                                
                                                if (isAttachment) {
                                                  // Render attachment thumbnails
                                                  return (
                                                    <div className="flex flex-wrap gap-1 justify-center">
                                                      {fieldValue.slice(0, 3).map((attachment: any, index: number) => {
                                                        const isImage = attachment.type?.startsWith('image/') || 
                                                          /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(attachment.filename || '');
                                                        
                                                        if (isImage) {
                                                          const thumbnailUrl = attachment.thumbnails?.small?.url || attachment.url;
                                                          return (
                                                            <div 
                                                              key={`${attachment.id || index}`}
                                                              className="relative group"
                                                              title={`${attachment.filename} (${(attachment.size / 1024).toFixed(1)}KB)`}
                                                            >
                                                              <img 
                                                                src={thumbnailUrl}
                                                                alt={attachment.filename || 'Attachment'}
                                                                className="w-8 h-8 object-cover rounded border border-slate-200 hover:border-blue-300 transition-colors"
                                                                onError={(e) => {
                                                                  // Fallback to file icon if image fails to load
                                                                  const target = e.target as HTMLImageElement;
                                                                  target.style.display = 'none';
                                                                  const parent = target.parentElement;
                                                                  if (parent) {
                                                                    parent.innerHTML = `
                                                                      <div class="w-8 h-8 bg-slate-100 rounded border border-slate-200 flex items-center justify-center">
                                                                        <span class="text-xs text-slate-500">📎</span>
                                                                      </div>
                                                                    `;
                                                                  }
                                                                }}
                                                              />
                                                            </div>
                                                          );
                                                        } else {
                                                          // Non-image attachment - show file icon
                                                          return (
                                                            <div 
                                                              key={`${attachment.id || index}`}
                                                              className="w-8 h-8 bg-slate-100 rounded border border-slate-200 flex items-center justify-center"
                                                              title={`${attachment.filename} (${(attachment.size / 1024).toFixed(1)}KB)`}
                                                            >
                                                              <span className="text-xs text-slate-500">📎</span>
                                                            </div>
                                                          );
                                                        }
                                                      })}
                                                      {fieldValue.length > 3 && (
                                                        <div className="w-8 h-8 bg-slate-50 rounded border border-slate-200 flex items-center justify-center">
                                                          <span className="text-xs text-slate-400">+{fieldValue.length - 3}</span>
                                                        </div>
                                                      )}
                                                    </div>
                                                  );
                                                }
                                                
                                                // Regular array handling
                                                if (Array.isArray(fieldValue)) {
                                                  return (
                                                    <div className="text-xs text-slate-900 text-center py-2 px-1 flex items-center justify-center">
                                                      <span className="block text-center" title={fieldValue.join(', ')} style={{ lineHeight: '1.2', 
                                                        maxWidth: `${columnWidth - 32}px`,
                                                        wordBreak: 'break-word',
                                                        overflowWrap: 'break-word',
                                                        whiteSpace: 'pre-wrap'
                                                      }}>
                                                        {fieldValue.length > 0 ? fieldValue.join(', ') : '[]'}
                                                      </span>
                                                    </div>
                                                  );
                                                }
                                                
                                                // Regular field value
                                                const displayValue = String(fieldValue || '');
                                                const isTruncated = displayValue.length > 25;
                                                const truncatedValue = isTruncated ? displayValue.substring(0, 25) + '...' : displayValue;
                                                
                                                return (
                                                  <div className="text-xs text-slate-900 text-center py-2 px-1 flex items-center justify-center">
                                                    <span 
                                                      className="block text-center" style={{ lineHeight: '1.2' }} 
                                                      title={displayValue}
                                                      style={{ 
                                                        maxWidth: `${columnWidth - 32}px`,
                                                        wordBreak: 'break-word',
                                                        overflowWrap: 'break-word',
                                                        whiteSpace: 'pre-wrap'
                                                      }}
                                                    >
                                                      {displayValue || '-'}
                                                    </span>
                                                  </div>
                                                );
                                              })()}
                                            </div>
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  ))}
                                  {previewData.length > 8 && (
                                    <tr className="h-12">
                                      <td 
                                        colSpan={Object.keys(previewData[0]?.fields || {}).length} 
                                        className="p-2 text-center text-xs text-slate-500 bg-slate-50"
                                      >
                                        ... and {previewData.length - 8} more record{previewData.length - 8 !== 1 ? 's' : ''}
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                          
                          <div className="flex justify-between items-center mt-2 py-3 px-4 border-t border-slate-200 min-h-[44px]">
                            <div className="flex items-center text-xs text-slate-500">
                              <span>Total: {previewData.length} record{previewData.length !== 1 ? 's' : ''}</span>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                loadPreviewData(values.baseId, values.tableName);
                              }}
                              disabled={loadingPreview}
                              className="h-8 px-3 text-xs bg-white border-slate-300 hover:bg-blue-50 hover:border-blue-400 text-slate-700 hover:text-blue-700 font-medium"
                              title="Refresh preview data"
                            >
                              <div className="flex items-center gap-1.5">
                                {loadingPreview ? (
                                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
                                ) : (
                                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                  </svg>
                                )}
                                <span>Refresh</span>
                              </div>
                            </Button>
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-4">
                          <div className="text-slate-500 mb-1">
                            {(values.filterField || values.dateFilter !== 'all_time') ? (
                              'No records match your current filters'
                            ) : (
                              'No records found in this table'
                            )}
                          </div>
                          {(values.filterField || values.dateFilter !== 'all_time') && (
                            <div className="text-xs text-slate-400">
                              Try adjusting your filter criteria
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      )}
      </div>

      {/* Discord Bot Status - Show only for Discord actions */}
      {nodeInfo?.providerId === 'discord' && (
        <div className="px-6 py-3 border-t border-slate-100 flex-shrink-0">
          {!discordIntegration ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-blue-800">Connect Discord</h3>
                  <p className="text-sm text-blue-700 mt-1">
                    Connect your Discord account to access servers and channels.
                  </p>
                </div>
                <Button
                  onClick={handleConnectDiscord}
                  size="sm"
                  className="bg-[#5865F2] hover:bg-[#4752C4] text-white"
                  disabled={loadingDynamic}
                >
                  {loadingDynamic ? (
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                      Connecting...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0190 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1568 2.4189Z"/>
                      </svg>
                      Connect
                    </div>
                  )}
                </Button>
              </div>
            </div>
          ) : values.guildId ? (
            <DiscordBotStatus guildId={values.guildId} className="w-full" />
          ) : (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-orange-800">Discord Bot Setup</h3>
                  <p className="text-sm text-orange-700 mt-1">
                    Select a Discord server to check bot status and add the bot if needed.
                  </p>
                </div>
                <div className="text-sm text-orange-600">
                  <span className="font-medium">Step 1:</span> Select a server above
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Form buttons */}
      <div className="flex justify-between items-center h-[70px] px-6 border-t border-slate-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          {Object.keys(errors).length > 0 && (
            <Badge variant="destructive" className="bg-red-100 text-red-700 border-red-200">
              {Object.keys(errors).length} error{Object.keys(errors).length > 1 ? 's' : ''}
            </Badge>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="flex items-center gap-2"
          >
            <X className="h-4 w-4" />
            Cancel
          </Button>
        </div>
        
        <div className="flex gap-3">
          {nodeInfo?.testable && (
            <Button
              type="button"
              onClick={handleTest}
              className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white"
              disabled={isTestLoading}
            >
              {isTestLoading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
              ) : (
                <Play className="h-4 w-4" />
              )}
              Test Configuration
            </Button>
          )}
          <Button
            type="submit"
            className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-200"
          >
            <Save className="h-4 w-4" />
            Save Configuration
          </Button>
        </div>
      </div>
    </form>
  );
}