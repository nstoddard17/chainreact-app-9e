import { useCallback, useRef } from 'react';
import { useAirtableFieldHandler } from './providers/useAirtableFieldHandler';
import { useDiscordFieldHandler } from './providers/useDiscordFieldHandler';
import { useGoogleSheetsFieldHandler } from './providers/useGoogleSheetsFieldHandler';
import { useNotionFieldHandler } from './providers/useNotionFieldHandler';

import { logger } from '@/lib/utils/logger'

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
  loadedFieldsWithValues?: React.MutableRefObject<Set<string>>;
  clearedFieldsRef?: React.MutableRefObject<Set<string>>;
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
  originalBubbleValues,
  loadedFieldsWithValues,
  clearedFieldsRef
}: UseFieldChangeHandlerProps) {
  // Track which fields are actively loading to prevent duplicate loads
  const activelyLoadingFields = useRef<Set<string>>(new Set());

  // Track which field changes are currently being processed to prevent duplicate handleGenericDependentField calls
  const processingFieldChanges = useRef<Set<string>>(new Set());

  /**
   * Helper: Clear all fields that depend on a parent field
   */
  const clearDependentFields = useCallback((parentFieldName: string) => {
    if (!nodeInfo?.configSchema) return;

    nodeInfo.configSchema.forEach((field: any) => {
      if (field.dependsOn === parentFieldName) {
        logger.debug('🔍 Clearing dependent field:', field.name);
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
      logger.debug('🔍 Loading options for dependent field:', field.name);
      
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
    selectedRecord,
    clearedFieldsRef
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
      logger.debug('🔍 Discord guildId changed:', value);
      
      // Only proceed if value actually changed
      if (value === values.guildId) {
        logger.debug('📌 Discord guildId unchanged, skipping field operations');
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
        logger.debug('🤖 Checking bot status for guild:', value);
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
      logger.debug('🔍 Discord channelId changed:', value);
      
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
      logger.debug('🔍 Discord messageId changed for remove reaction:', value);
      
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
      logger.debug('🔍 Google Sheets spreadsheetId changed:', value);
      
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
        // For Google Sheets, avoid force-refresh to prevent rapid refetch loops
        await loadDependentFieldOptions('spreadsheetId', value, false);
      }
      
      return true;
    }

    // Handle sheetName changes
    if (fieldName === 'sheetName') {
      logger.debug('🔍 Google Sheets sheetName changed:', value);
      
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
      logger.debug('🔍 Airtable baseId changed:', value);
      
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
      logger.debug('🔍 Airtable tableName changed:', value);
      
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
      logger.debug('🔍 Airtable filterField changed:', value);
      
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
      logger.debug('🔍 Airtable recordId changed, populating dynamic fields');
      
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
   * Handle OneDrive-specific field changes
   */
  const handleOneDriveFieldChange = useCallback(async (fieldName: string, value: any): Promise<boolean> => {
    if (nodeInfo?.providerId !== 'onedrive') return false;

    // Handle folderId changes for OneDrive
    if (fieldName === 'folderId') {
      logger.debug('🔍 OneDrive folderId changed:', value);

      // Clear the fileId field
      setValue('fileId', '');

      if (value) {
        // Reset options first
        logger.debug('📁 OneDrive folder selected, loading files...');
        resetOptions('fileId');

        // Set loading state for fileId
        setLoadingFields((prev: Set<string>) => {
          const newSet = new Set(prev);
          newSet.add('fileId');
          return newSet;
        });

        // Load files for the selected folder with a small delay
        setTimeout(async () => {
          try {
            await loadOptions('fileId', 'folderId', value, true);
          } finally {
            // Clear loading state
            setLoadingFields((prev: Set<string>) => {
              const newSet = new Set(prev);
              newSet.delete('fileId');
              return newSet;
            });
          }
        }, 100);
      } else {
        // Clear loading state if no folder selected
        setLoadingFields((prev: Set<string>) => {
          const newSet = new Set(prev);
          newSet.delete('fileId');
          return newSet;
        });
      }

      // Return true to prevent generic handler from running
      return true;
    }

    return false;
  }, [nodeInfo, values, setValue, resetOptions, setLoadingFields, loadOptions]);

  /**
   * Handle generic dependent field changes for non-provider fields
   */
  const handleGenericDependentField = useCallback(async (fieldName: string, value: any): Promise<boolean> => {
    // Skip if this is OneDrive folderId - it has its own handler
    if (nodeInfo?.providerId === 'onedrive' && fieldName === 'folderId') {
      return false;
    }

    // Check if any field depends on this field
    const dependentFields = nodeInfo?.configSchema?.filter((f: any) => f.dependsOn === fieldName) || [];

    if (dependentFields.length === 0) {
      return false;
    }

    // Create a unique key for this field change
    const changeKey = `${fieldName}-${value}`;

    // Check if this exact change is already being processed
    if (processingFieldChanges.current.has(changeKey)) {
      logger.debug(`🚫 Already processing change for ${fieldName} = ${value}, skipping duplicate call`);
      return true;
    }

    // Mark this change as being processed
    processingFieldChanges.current.add(changeKey);

    logger.debug('🔍 Generic dependent field change:', {
      fieldName,
      value,
      dependentFields: dependentFields.map((f: any) => f.name),
      changeKey
    });

    // Clear all dependent fields
    dependentFields.forEach((depField: any) => {
      logger.debug(`🧹 Clearing dependent field: ${depField.name}`);
      setValue(depField.name, '');

      // Skip dynamic_fields type - they handle their own data loading
      if (depField.type === 'dynamic_fields') {
        logger.debug(`⏭️ Skipping dynamic_fields type field: ${depField.name}`);
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
      // Check if any dependent fields are already loading BEFORE creating setTimeout
      const fieldsToLoad = dependentFields.filter((depField: any) => {
        if (depField.type === 'dynamic_fields') return false;
        if (!depField.dynamic && !depField.dynamicOptions) return false;

        // Check if already loading
        if (activelyLoadingFields.current.has(depField.name)) {
          logger.debug(`⏭️ Skipping ${depField.name} - already loading`);
          return false;
        }

        return true;
      });

      // If no fields to load, skip the setTimeout entirely
      if (fieldsToLoad.length === 0) {
        logger.debug(`⏭️ No dependent fields to load - all already loading or not dynamic`);
        return true;
      }

      // Mark all fields as actively loading BEFORE setTimeout
      fieldsToLoad.forEach((depField: any) => {
        activelyLoadingFields.current.add(depField.name);
      });

      setTimeout(async () => {
        for (const depField of fieldsToLoad) {
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
              // Remove from actively loading
              activelyLoadingFields.current.delete(depField.name);
            } else {
              // Regular dynamic field loading - use cache to prevent API spam
              try {
                await loadOptions(depField.name, fieldName, value, false);
              } finally {
                setLoadingFields((prev: Set<string>) => {
                  const newSet = new Set(prev);
                  newSet.delete(depField.name);
                  return newSet;
                });
                // Remove from actively loading
                activelyLoadingFields.current.delete(depField.name);
              }
            }
          } catch (error) {
            logger.error(`Error loading dependent field ${depField.name}:`, error);
            setLoadingFields((prev: Set<string>) => {
              const newSet = new Set(prev);
              newSet.delete(depField.name);
              return newSet;
            });
            // Remove from actively loading
            activelyLoadingFields.current.delete(depField.name);
          }
        }
      }, 10);

      // Remove from processing after setTimeout is created - the activelyLoadingFields protection takes over
      setTimeout(() => {
        processingFieldChanges.current.delete(changeKey);
      }, 100); // Wait 100ms to ensure concurrent calls are blocked
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

      // Clean up processing key
      processingFieldChanges.current.delete(changeKey);
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

    // Handle OneDrive-specific field changes
    if (await handleOneDriveFieldChange(fieldName, value)) {
      return true;
    }

    // Try generic dependent field handler
    if (await handleGenericDependentField(fieldName, value)) {
      return true;
    }

    return false;
  }, [handleNotionField, handleDiscordField, handleGoogleSheetsField, handleAirtableField, handleOneDriveFieldChange, handleGenericDependentField]);

  /**
   * Main field change handler - the single entry point for all field changes
   */
  const handleFieldChange = useCallback((fieldName: string, value: any) => {
    // Check if the value actually changed
    const currentValue = values[fieldName];
    const hasChanged = value !== currentValue;

    logger.debug('🔍 handleFieldChange called:', {
      fieldName,
      value,
      currentValue,
      hasChanged,
      valueType: typeof value,
      isArray: Array.isArray(value),
      valueLength: Array.isArray(value) ? value.length : 'N/A',
      provider: nodeInfo?.providerId
    });

    // Skip if value hasn't changed (prevents unnecessary resets)
    if (!hasChanged) {
      logger.debug('⏭️ Skipping field change - value unchanged:', fieldName);
      return;
    }

    // Clear the field from loadedFieldsWithValues tracking when user changes it
    // This allows the field to be reloaded if needed after a manual change
    if (loadedFieldsWithValues?.current) {
      if (loadedFieldsWithValues.current.has(fieldName)) {
        logger.debug(`🔄 [handleFieldChange] Clearing tracking for manually changed field: ${fieldName}`);
        loadedFieldsWithValues.current.delete(fieldName);
      }

      // Also clear tracking for dependent fields
      if (nodeInfo?.configSchema) {
        nodeInfo.configSchema.forEach((field: any) => {
          if (field.dependsOn === fieldName && loadedFieldsWithValues.current.has(field.name)) {
            logger.debug(`🔄 [handleFieldChange] Clearing tracking for dependent field: ${field.name}`);
            loadedFieldsWithValues.current.delete(field.name);
          }
        });
      }
    }

    // Special logging for uploadedFiles field
    if (fieldName === 'uploadedFiles') {
      logger.debug('📎 [useFieldChangeHandler] uploadedFiles being set:', {
        value,
        hasValue: value !== null && value !== undefined,
        isArray: Array.isArray(value),
        arrayLength: Array.isArray(value) ? value.length : 0,
        firstItem: Array.isArray(value) && value.length > 0 ? value[0] : null
      });
    }

    // If user is manually setting a value (non-empty), remove it from cleared fields list
    // This allows it to be restored from initialData next time the modal opens
    if (value !== '' && value !== null && value !== undefined && clearedFieldsRef?.current) {
      if (clearedFieldsRef.current.has(fieldName)) {
        logger.debug(`✅ [handleFieldChange] Removing ${fieldName} from cleared fields (user manually set value)`);
        clearedFieldsRef.current.delete(fieldName);
      }
    }

    // Always set the value first
    // (providers handle side effects but don't set the main value)
    setValue(fieldName, value);

    // Try provider-specific and generic handlers (no await needed since we don't care about the result)
    handleProviderFieldChange(fieldName, value).then(handled => {
      // Log if field was handled by a provider
      if (handled) {
        logger.debug('✅ Field handled by provider logic:', fieldName);
      }
    });
  }, [handleProviderFieldChange, setValue, nodeInfo, values, loadedFieldsWithValues, clearedFieldsRef]);

  return {
    handleFieldChange,
    // Export individual handlers for testing or specific use cases
    handleProviderFieldChange,
    handleDiscordFieldChange,
    handleGoogleSheetsFieldChange,
    handleAirtableFieldChange,
    handleOneDriveFieldChange,
    handleGenericDependentField,
    // Export helper functions
    clearDependentFields,
    loadDependentFieldOptions
  };
}