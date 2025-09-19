import { useCallback } from 'react';
import { useAirtableFieldHandler } from './providers/useAirtableFieldHandler';
import { useDiscordFieldHandler } from './providers/useDiscordFieldHandler';
import { useGoogleSheetsFieldHandler } from './providers/useGoogleSheetsFieldHandler';
import { useNotionFieldHandler } from './providers/useNotionFieldHandler';

interface UseFieldChangeHandlerProps {
  nodeInfo: any;
  values: Record<string, any>;
  setValue: (fieldName: string, value: any) => void;
  loadOptions: (fieldName: string, dependsOn?: string, dependsOnValue?: any, forceReload?: boolean) => Promise<void>;
  setLoadingFields: (setter: any) => void;
  resetOptions: (fieldName: string) => void;
  dynamicOptions?: Record<string, any[]>;
  
  // Provider-specific state setters
  discordState?: any;
  setSelectedRecord?: (record: any) => void;
  setPreviewData?: (data: any[]) => void;
  setShowPreviewData?: (show: boolean) => void;
  setTableSearchQuery?: (query: string) => void;
  setGoogleSheetsSortField?: (field: string | null) => void;
  setGoogleSheetsSortDirection?: (direction: 'asc' | 'desc') => void;
  setGoogleSheetsSelectedRows?: (rows: Set<string>) => void;
  setAirtableRecords?: (records: any[]) => void;
  setAirtableTableSchema?: (schema: any) => void;
  
  // Optional props for specific features
  currentNodeId?: string;
  getWorkflowId?: () => string | undefined;
  selectedRecord?: any;
  activeBubbles?: Record<string, boolean>;
  fieldSuggestions?: Record<string, string>;
  originalBubbleValues?: Record<string, any>;
}

/**
 * Consolidated field change handler hook that combines the best of both
 * useFieldChangeHandlers and useProviderFieldHandlers implementations.
 * 
 * This hook manages all field change logic including:
 * - Provider-specific field dependencies (Discord, Airtable, Google Sheets)
 * - Generic dependent field handling
 * - Loading states and option management
 * - State clearing for dependent fields
 */
export function useFieldChangeHandler({
  nodeInfo,
  values,
  setValue,
  loadOptions,
  setLoadingFields,
  resetOptions,
  dynamicOptions,
  discordState,
  setSelectedRecord,
  setPreviewData,
  setShowPreviewData,
  setTableSearchQuery,
  setGoogleSheetsSortField,
  setGoogleSheetsSortDirection,
  setGoogleSheetsSelectedRows,
  setAirtableRecords,
  setAirtableTableSchema,
  currentNodeId,
  getWorkflowId,
  selectedRecord,
  activeBubbles,
  fieldSuggestions,
  originalBubbleValues
}: UseFieldChangeHandlerProps) {

  /**
   * Helper: Clear all fields that depend on a parent field
   */
  const clearDependentFields = useCallback((parentFieldName: string) => {
    if (!nodeInfo?.configSchema) return;

    nodeInfo.configSchema.forEach((field: any) => {
      if (field.dependsOn === parentFieldName) {
        console.log('🔍 Clearing dependent field:', field.name);
        setValue(field.name, '');
      }
    });
  }, [nodeInfo, setValue]);

  /**
   * Helper: Load options for all fields that depend on a parent field
   */
  const loadDependentFieldOptions = useCallback(async (
    parentFieldName: string,
    parentValue: any,
    forceReload: boolean = true
  ) => {
    if (!nodeInfo?.configSchema || !parentValue) return;

    const dependentFields = nodeInfo.configSchema.filter((field: any) => 
      field.dependsOn === parentFieldName
    );

    for (const field of dependentFields) {
      console.log('🔍 Loading options for dependent field:', field.name);
      
      // Set loading state
      setLoadingFields((prev: Set<string>) => {
        const newSet = new Set(prev);
        newSet.add(field.name);
        return newSet;
      });

      try {
        await loadOptions(field.name, parentFieldName, parentValue, forceReload);
      } finally {
        // Clear loading state
        setLoadingFields((prev: Set<string>) => {
          const newSet = new Set(prev);
          newSet.delete(field.name);
          return newSet;
        });
      }
    }
  }, [nodeInfo, loadOptions, setLoadingFields]);

  // Use provider-specific hooks for cleaner separation
  const { handleFieldChange: handleAirtableField } = useAirtableFieldHandler({
    nodeInfo,
    values,
    setValue,
    loadOptions,
    setLoadingFields,
    resetOptions,
    setSelectedRecord,
    setAirtableRecords,
    setAirtableTableSchema,
    setShowPreviewData,
    setPreviewData,
    selectedRecord
  });

  const { handleFieldChange: handleDiscordField } = useDiscordFieldHandler({
    nodeInfo,
    values,
    setValue,
    loadOptions,
    setLoadingFields,
    resetOptions,
    discordState
  });

  const { handleFieldChange: handleGoogleSheetsField } = useGoogleSheetsFieldHandler({
    nodeInfo,
    values,
    setValue,
    loadOptions,
    setLoadingFields,
    resetOptions,
    setSelectedRecord,
    setPreviewData,
    setShowPreviewData,
    setTableSearchQuery,
    setGoogleSheetsSortField,
    setGoogleSheetsSortDirection,
    setGoogleSheetsSelectedRows
  });

  const { handleFieldChange: handleNotionField } = useNotionFieldHandler({
    nodeInfo,
    values,
    setValue,
    loadOptions,
    setLoadingFields,
    resetOptions,
    dynamicOptions
  });

  /**
   * Handle Discord-specific field changes
   * @deprecated Use handleDiscordField from useDiscordFieldHandler instead
   */
  const handleDiscordFieldChange = useCallback(async (fieldName: string, value: any): Promise<boolean> => {
    if (nodeInfo?.providerId !== 'discord') return false;

    // Handle guildId (server) changes
    if (fieldName === 'guildId') {
      console.log('🔍 Discord guildId changed:', value);
      
      // Only proceed if value actually changed
      if (value === values.guildId) {
        console.log('📌 Discord guildId unchanged, skipping field operations');
        return true;
      }
      
      // Clear dependent fields
      setValue('channelId', '');
      setValue('messageId', '');
      setValue('filterAuthor', '');
      
      // Clear Discord state
      discordState?.setChannelBotStatus(null);
      discordState?.setChannelLoadingError(null);
      
      // Set loading states for dependent fields
      setLoadingFields((prev: Set<string>) => {
        const newSet = new Set(prev);
        newSet.add('channelId');
        if (nodeInfo.configSchema?.some((f: any) => f.name === 'filterAuthor')) {
          newSet.add('filterAuthor');
        }
        return newSet;
      });
      
      // Reset cached options
      resetOptions('channelId');
      resetOptions('filterAuthor');
      resetOptions('messageId');
      
      if (value) {
        // Always check bot status when a guild is selected (for both actions and triggers)
        console.log('🤖 Checking bot status for guild:', value);
        discordState?.checkBotStatus(value);
        
        // Don't load channels immediately - they will be loaded after bot status is confirmed
        // The DiscordConfiguration component will handle loading channels when bot is connected
      } else {
        // Clear loading states
        setLoadingFields((prev: Set<string>) => {
          const newSet = new Set(prev);
          newSet.delete('channelId');
          newSet.delete('filterAuthor');
          return newSet;
        });
      }
      
      return true;
    }

    // Handle channelId changes
    if (fieldName === 'channelId') {
      console.log('🔍 Discord channelId changed:', value);
      
      // Check for messageId field
      const hasMessageField = nodeInfo.configSchema?.some((field: any) => field.name === 'messageId');
      const hasMessagesField = nodeInfo.configSchema?.some((field: any) => field.name === 'messageIds'); // Plural for delete action

      if (hasMessageField) {
        // Clear and set loading for messageId
        setValue('messageId', '');
        setLoadingFields((prev: Set<string>) => {
          const newSet = new Set(prev);
          newSet.add('messageId');
          return newSet;
        });
        resetOptions('messageId');
      }

      if (hasMessagesField) {
        // Clear and set loading for messageIds (plural)
        setValue('messageIds', []);
        setLoadingFields((prev: Set<string>) => {
          const newSet = new Set(prev);
          newSet.add('messageIds');
          return newSet;
        });
        resetOptions('messageIds');
      }
      
      if (value && values.guildId) {
        // Load messages if needed
        if (hasMessageField) {
          setTimeout(() => {
            // Pass the action type to filter messages if this is an edit action
            const actionType = nodeInfo?.type;
            loadOptions('messageId', 'channelId', value, true, false, { actionType }).finally(() => {
              setLoadingFields((prev: Set<string>) => {
                const newSet = new Set(prev);
                newSet.delete('messageId');
                return newSet;
              });
            });
          }, 10);
        }

        // Load messages for multi-select (delete action)
        if (hasMessagesField) {
          setTimeout(() => {
            const actionType = nodeInfo?.type;
            loadOptions('messageIds', 'channelId', value, true, false, { actionType }).finally(() => {
              setLoadingFields((prev: Set<string>) => {
                const newSet = new Set(prev);
                newSet.delete('messageIds');
                return newSet;
              });
            });
          }, 10);
        }
        
        // Check channel bot status (only for Discord actions, not triggers)
        if (nodeInfo?.type?.startsWith('discord_action_')) {
          discordState?.checkChannelBotStatus(value, values.guildId);
        }
      } else {
        // Clear loading state
        if (hasMessageField) {
          setLoadingFields((prev: Set<string>) => {
            const newSet = new Set(prev);
            newSet.delete('messageId');
            return newSet;
          });
        }
        if (hasMessagesField) {
          setLoadingFields((prev: Set<string>) => {
            const newSet = new Set(prev);
            newSet.delete('messageIds');
            return newSet;
          });
        }
      }
      
      return true;
    }

    // Handle messageId changes for remove reaction action
    if (fieldName === 'messageId' && nodeInfo?.type === 'discord_action_remove_reaction') {
      console.log('🔍 Discord messageId changed for remove reaction:', value);
      
      // Clear emoji field
      setValue('emoji', '');
      
      if (value && values.channelId) {
        // Load reactions (handled by DiscordReactionSelector component)
        discordState?.loadReactionsForMessage(values.channelId, value);
      }
      
      return true;
    }

    return false;
  }, [nodeInfo, values, setValue, loadOptions, setLoadingFields, resetOptions, discordState]);

  /**
   * Handle Google Sheets-specific field changes
   */
  const handleGoogleSheetsFieldChange = useCallback(async (fieldName: string, value: any): Promise<boolean> => {
    if (nodeInfo?.providerId !== 'google-sheets') return false;

    // Handle spreadsheetId changes
    if (fieldName === 'spreadsheetId') {
      console.log('🔍 Google Sheets spreadsheetId changed:', value);
      
      // Clear preview data for update action
      if (values.action === 'update') {
        setSelectedRecord?.(null);
        setPreviewData?.([]);
        setShowPreviewData?.(false);
        setValue('updateRowNumber', '');
        
        // Clear updateMapping fields
        Object.keys(values).forEach(key => {
          if (key.startsWith('updateMapping.')) {
            setValue(key, '');
          }
        });
      }
      
      // Clear and reload dependent fields
      clearDependentFields('spreadsheetId');
      
      if (value) {
        await loadDependentFieldOptions('spreadsheetId', value);
      }
      
      return true;
    }

    // Handle sheetName changes
    if (fieldName === 'sheetName') {
      console.log('🔍 Google Sheets sheetName changed:', value);
      
      // Clear preview data for update action
      if (values.action === 'update') {
        setSelectedRecord?.(null);
        setPreviewData?.([]);
        setShowPreviewData?.(false);
        setValue('updateRowNumber', '');
        
        // Clear updateMapping fields
        Object.keys(values).forEach(key => {
          if (key.startsWith('updateMapping.')) {
            setValue(key, '');
          }
        });
      }
      
      // Clear range if it exists
      if (nodeInfo?.configSchema?.some((f: any) => f.name === 'range')) {
        setValue('range', '');
      }
      
      return true;
    }

    // Handle action changes
    if (fieldName === 'action') {
      const previousAction = values.action;
      
      // Clear all preview and state data
      setSelectedRecord?.(null);
      setPreviewData?.([]);
      setShowPreviewData?.(false);
      setTableSearchQuery?.('');
      setGoogleSheetsSortField?.(null);
      setGoogleSheetsSortDirection?.('asc');
      setGoogleSheetsSelectedRows?.(new Set());
      
      // Clear update-specific fields
      if (previousAction === 'update') {
        setValue('updateRowNumber', '');
        setValue('findRowBy', '');
        setValue('updateColumn', '');
        setValue('updateValue', '');
        
        // Clear updateMapping fields
        Object.keys(values).forEach(key => {
          if (key.startsWith('updateMapping.')) {
            setValue(key, '');
          }
        });
      }
      
      return true;
    }

    return false;
  }, [
    nodeInfo,
    values,
    setValue,
    clearDependentFields,
    loadDependentFieldOptions,
    setSelectedRecord,
    setPreviewData,
    setShowPreviewData,
    setTableSearchQuery,
    setGoogleSheetsSortField,
    setGoogleSheetsSortDirection,
    setGoogleSheetsSelectedRows
  ]);

  /**
   * Handle Airtable-specific field changes
   */
  const handleAirtableFieldChange = useCallback(async (fieldName: string, value: any): Promise<boolean> => {
    if (nodeInfo?.providerId !== 'airtable') return false;

    // Handle baseId changes
    if (fieldName === 'baseId') {
      console.log('🔍 Airtable baseId changed:', value);
      
      // Clear ALL dependent fields
      setValue('tableName', '');
      setValue('recordId', '');
      setValue('filterField', '');
      setValue('filterValue', '');
      
      // Clear Airtable state
      setSelectedRecord?.(null);
      setAirtableRecords?.([]);
      setAirtableTableSchema?.(null);
      setShowPreviewData?.(false);
      setPreviewData?.([]);
      
      // Clear all dynamic Airtable fields
      Object.keys(values).forEach(key => {
        if (key.startsWith('airtable_field_')) {
          setValue(key, '');
        }
      });
      
      if (value) {
        // Set loading state for tableName
        setLoadingFields((prev: Set<string>) => {
          const newSet = new Set(prev);
          newSet.add('tableName');
          return newSet;
        });
        
        // Reset cached options
        resetOptions('tableName');
        
        // Load tables with delay
        setTimeout(() => {
          loadOptions('tableName', 'baseId', value, true).finally(() => {
            setLoadingFields((prev: Set<string>) => {
              const newSet = new Set(prev);
              newSet.delete('tableName');
              return newSet;
            });
          });
        }, 10);
      }
      
      return true;
    }

    // Handle tableName changes
    if (fieldName === 'tableName') {
      console.log('🔍 Airtable tableName changed:', value);
      
      // Clear dependent fields (everything except baseId)
      setValue('recordId', '');
      setValue('filterField', '');
      setValue('filterValue', '');
      
      // Clear Airtable state
      setSelectedRecord?.(null);
      setAirtableRecords?.([]);
      setShowPreviewData?.(false);
      setPreviewData?.([]);
      
      // Clear all dynamic Airtable fields
      Object.keys(values).forEach(key => {
        if (key.startsWith('airtable_field_')) {
          setValue(key, '');
        }
      });
      
      if (value && nodeInfo?.type === 'airtable_action_list_records') {
        // Set loading for filterField
        setLoadingFields((prev: Set<string>) => {
          const newSet = new Set(prev);
          newSet.add('filterField');
          return newSet;
        });
        
        resetOptions('filterField');
        
        // Load filter fields
        setTimeout(() => {
          loadOptions('filterField', 'tableName', value, true).finally(() => {
            setLoadingFields((prev: Set<string>) => {
              const newSet = new Set(prev);
              newSet.delete('filterField');
              return newSet;
            });
          });
        }, 10);
      }
      
      return true;
    }

    // Handle filterField changes
    if (fieldName === 'filterField' && nodeInfo?.type === 'airtable_action_list_records') {
      console.log('🔍 Airtable filterField changed:', value);
      
      // Clear filterValue
      setValue('filterValue', '');
      
      if (value && values.baseId && values.tableName) {
        // Set loading for filterValue
        setLoadingFields((prev: Set<string>) => {
          const newSet = new Set(prev);
          newSet.add('filterValue');
          return newSet;
        });
        
        resetOptions('filterValue');
        
        // Load filter values
        setTimeout(() => {
          loadOptions('filterValue', 'filterField', value, true).finally(() => {
            setLoadingFields((prev: Set<string>) => {
              const newSet = new Set(prev);
              newSet.delete('filterValue');
              return newSet;
            });
          });
        }, 10);
      }
      
      return true;
    }

    // Handle recordId change (from manual input or selection)
    if (fieldName === 'recordId' && value && selectedRecord?.fields) {
      console.log('🔍 Airtable recordId changed, populating dynamic fields');
      
      // Populate dynamic fields from selected record
      Object.entries(selectedRecord.fields).forEach(([fieldName, fieldValue]) => {
        const dynamicFieldName = `airtable_field_${fieldName}`;
        setValue(dynamicFieldName, fieldValue);
      });
      
      return true;
    }

    // Handle dynamic Airtable field changes
    if (fieldName.startsWith('airtable_field_')) {
      // These are dynamic fields based on the table schema
      // No special handling needed, just return true to indicate we handled it
      return true;
    }

    return false;
  }, [
    nodeInfo,
    values,
    setValue,
    loadOptions,
    setLoadingFields,
    resetOptions,
    setSelectedRecord,
    setAirtableRecords,
    setAirtableTableSchema,
    setShowPreviewData,
    setPreviewData,
    selectedRecord
  ]);

  /**
   * Handle generic dependent field changes for non-provider fields
   */
  const handleGenericDependentField = useCallback(async (fieldName: string, value: any): Promise<boolean> => {
    // Check if any field depends on this field
    const dependentFields = nodeInfo?.configSchema?.filter((f: any) => f.dependsOn === fieldName) || [];
    
    if (dependentFields.length === 0) {
      return false;
    }
    
    console.log('🔍 Generic dependent field change:', { 
      fieldName, 
      value, 
      dependentFields: dependentFields.map((f: any) => f.name) 
    });
    
    // Clear all dependent fields
    dependentFields.forEach((depField: any) => {
      console.log(`🧹 Clearing dependent field: ${depField.name}`);
      setValue(depField.name, '');

      // Skip dynamic_fields type - they handle their own data loading
      if (depField.type === 'dynamic_fields') {
        console.log(`⏭️ Skipping dynamic_fields type field: ${depField.name}`);
        return;
      }

      // Set loading state if the field has dynamic options (check both 'dynamic' and 'dynamicOptions')
      if (depField.dynamic || depField.dynamicOptions) {
        setLoadingFields((prev: Set<string>) => {
          const newSet = new Set(prev);
          newSet.add(depField.name);
          return newSet;
        });
        
        // Reset cached options
        resetOptions(depField.name);
      }
    });
    
    // Load options for dependent fields if value is provided
    if (value) {
      setTimeout(async () => {
        for (const depField of dependentFields) {
          // Skip dynamic_fields type - they handle their own data loading
          if (depField.type === 'dynamic_fields') {
            console.log(`⏭️ Skipping loading for dynamic_fields type field: ${depField.name}`);
            continue;
          }

          if (depField.dynamic || depField.dynamicOptions) {
            try {
              // Special handling for preview fields (textareas that show dynamic content)
              if (depField.name === 'filePreview' && nodeInfo?.providerId === 'google-drive') {
                // For preview fields, fetch the preview and set it directly as the value
                // Import supabase at the top of the function to get the session
                const { supabase } = await import('@/utils/supabaseClient');
                const { data: { session } } = await supabase.auth.getSession();
                
                const headers: HeadersInit = {
                  'Content-Type': 'application/json'
                };
                
                if (session?.access_token) {
                  headers['Authorization'] = `Bearer ${session.access_token}`;
                }
                
                const response = await fetch(`/api/integrations/google-drive/file-preview`, {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({ fileId: value })
                });

                if (response.ok) {
                  const data = await response.json();
                  setValue(depField.name, data.preview || 'No preview available');
                }
                
                setLoadingFields((prev: Set<string>) => {
                  const newSet = new Set(prev);
                  newSet.delete(depField.name);
                  return newSet;
                });
              } else {
                // Regular dynamic field loading
                await loadOptions(depField.name, fieldName, value, true).finally(() => {
                  setLoadingFields((prev: Set<string>) => {
                    const newSet = new Set(prev);
                    newSet.delete(depField.name);
                    return newSet;
                  });
                });
              }
            } catch (error) {
              console.error(`Error loading dependent field ${depField.name}:`, error);
              setLoadingFields((prev: Set<string>) => {
                const newSet = new Set(prev);
                newSet.delete(depField.name);
                return newSet;
              });
            }
          }
        }
      }, 10);
    } else {
      // If no value, just clear the loading states
      dependentFields.forEach((depField: any) => {
        if (depField.dynamic || depField.dynamicOptions) {
          setLoadingFields((prev: Set<string>) => {
            const newSet = new Set(prev);
            newSet.delete(depField.name);
            return newSet;
          });
        }
      });
    }

    return true;
  }, [nodeInfo, setValue, loadOptions, setLoadingFields, resetOptions]);

  /**
   * Main provider field handler that tries each provider
   * Now uses modular provider-specific hooks for better maintainability
   */
  const handleProviderFieldChange = useCallback(async (fieldName: string, value: any): Promise<boolean> => {
    // Try provider-specific handlers from modular hooks
    if (await handleNotionField(fieldName, value)) {
      return true;
    }

    if (await handleDiscordField(fieldName, value)) {
      return true;
    }

    if (await handleGoogleSheetsField(fieldName, value)) {
      return true;
    }

    if (await handleAirtableField(fieldName, value)) {
      return true;
    }

    // Try generic dependent field handler
    if (await handleGenericDependentField(fieldName, value)) {
      return true;
    }

    return false;
  }, [handleNotionField, handleDiscordField, handleGoogleSheetsField, handleAirtableField, handleGenericDependentField]);

  /**
   * Main field change handler - the single entry point for all field changes
   */
  const handleFieldChange = useCallback(async (fieldName: string, value: any) => {
    console.log('🔍 handleFieldChange called:', { 
      fieldName, 
      value, 
      valueType: typeof value,
      isArray: Array.isArray(value),
      valueLength: Array.isArray(value) ? value.length : 'N/A',
      provider: nodeInfo?.providerId 
    });
    
    // Special logging for uploadedFiles field
    if (fieldName === 'uploadedFiles') {
      console.log('📎 [useFieldChangeHandler] uploadedFiles being set:', {
        value,
        hasValue: value !== null && value !== undefined,
        isArray: Array.isArray(value),
        arrayLength: Array.isArray(value) ? value.length : 0,
        firstItem: Array.isArray(value) && value.length > 0 ? value[0] : null
      });
    }

    // Try provider-specific and generic handlers
    const handled = await handleProviderFieldChange(fieldName, value);
    
    // Always set the value, even if handled by provider
    // (providers handle side effects but don't set the main value)
    setValue(fieldName, value);
    
    // Log if field was handled by a provider
    if (handled) {
      console.log('✅ Field handled by provider logic:', fieldName);
    }
  }, [handleProviderFieldChange, setValue, nodeInfo]);

  return {
    handleFieldChange,
    // Export individual handlers for testing or specific use cases
    handleProviderFieldChange,
    handleDiscordFieldChange,
    handleGoogleSheetsFieldChange,
    handleAirtableFieldChange,
    handleGenericDependentField,
    // Export helper functions
    clearDependentFields,
    loadDependentFieldOptions
  };
}