/**
 * @deprecated This hook has been consolidated into useFieldChangeHandler.ts
 * Please use useFieldChangeHandler instead.
 * This file is kept for reference only and will be removed in a future update.
 */

import { useCallback } from 'react';

import { logger } from '@/lib/utils/logger'

interface UseProviderFieldHandlersProps {
  nodeInfo: any;
  values: Record<string, any>;
  setValue: (fieldName: string, value: any) => void;
  loadOptions: (fieldName: string, dependsOn?: string, dependsOnValue?: any, forceReload?: boolean) => Promise<void>;
  setLoadingFields: (setter: any) => void;
  resetOptions: (fieldName: string) => void;
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
}

export function useProviderFieldHandlers({
  nodeInfo,
  values,
  setValue,
  loadOptions,
  setLoadingFields,
  resetOptions,
  discordState,
  setSelectedRecord,
  setPreviewData,
  setShowPreviewData,
  setTableSearchQuery,
  setGoogleSheetsSortField,
  setGoogleSheetsSortDirection,
  setGoogleSheetsSelectedRows,
  setAirtableRecords,
  setAirtableTableSchema
}: UseProviderFieldHandlersProps) {

  /**
   * Clear dependent fields when a parent field changes
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
   * Load options for dependent fields
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

  /**
   * Handle Discord field changes
   */
  const handleDiscordFieldChange = useCallback(async (fieldName: string, value: any): Promise<boolean> => {
    if (nodeInfo?.providerId !== 'discord') return false;

    // Handle guildId (server) changes
    if (fieldName === 'guildId') {
      logger.debug('🔍 Discord guildId changed:', value);
      
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
        // Delay to ensure loading state is visible
        setTimeout(() => {
          // Load channels
          loadOptions('channelId', 'guildId', value, true).finally(() => {
            setLoadingFields((prev: Set<string>) => {
              const newSet = new Set(prev);
              newSet.delete('channelId');
              return newSet;
            });
          });
          
          // Load filter authors if needed
          if (nodeInfo.configSchema?.some((f: any) => f.name === 'filterAuthor')) {
            loadOptions('filterAuthor', 'guildId', value, true).finally(() => {
              setLoadingFields((prev: Set<string>) => {
                const newSet = new Set(prev);
                newSet.delete('filterAuthor');
                return newSet;
              });
            });
          }
          
          // Check bot status (only for Discord actions, not triggers)
          if (nodeInfo?.type?.startsWith('discord_action_')) {
            discordState?.checkBotStatus(value);
          }
        }, 10);
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
      
      if (value && values.guildId) {
        // Load messages if needed
        if (hasMessageField) {
          setTimeout(() => {
            loadOptions('messageId', 'channelId', value, true).finally(() => {
              setLoadingFields((prev: Set<string>) => {
                const newSet = new Set(prev);
                newSet.delete('messageId');
                return newSet;
              });
            });
          }, 10);
        }
        
        // Check channel bot status (only for Discord actions, not triggers)
        if (nodeInfo?.type?.startsWith('discord_action_')) {
          discordState?.checkChannelBotStatus(value, values.guildId);
        }
      } else if (hasMessageField) {
        // Clear loading state
        setLoadingFields((prev: Set<string>) => {
          const newSet = new Set(prev);
          newSet.delete('messageId');
          return newSet;
        });
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
        logger.debug('🔍 Message selected for remove reaction action');
      }
      
      return true;
    }

    return false;
  }, [nodeInfo, values, setValue, loadOptions, setLoadingFields, resetOptions, discordState]);

  /**
   * Handle Google Sheets field changes
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
        await loadDependentFieldOptions('spreadsheetId', value);
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
   * Handle Airtable field changes
   */
  const handleAirtableFieldChange = useCallback(async (fieldName: string, value: any): Promise<boolean> => {
    if (nodeInfo?.providerId !== 'airtable') return false;

    // Handle baseId changes
    if (fieldName === 'baseId') {
      logger.debug('🔍 Airtable baseId changed:', value);
      
      // Clear dependent fields
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
      
      // Clear dependent fields
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
    setPreviewData
  ]);

  /**
   * Main provider field handler
   */
  const handleProviderFieldChange = useCallback(async (fieldName: string, value: any): Promise<boolean> => {
    // Try Discord handler
    if (await handleDiscordFieldChange(fieldName, value)) {
      return true;
    }

    // Try Google Sheets handler
    if (await handleGoogleSheetsFieldChange(fieldName, value)) {
      return true;
    }

    // Try Airtable handler
    if (await handleAirtableFieldChange(fieldName, value)) {
      return true;
    }

    return false;
  }, [handleDiscordFieldChange, handleGoogleSheetsFieldChange, handleAirtableFieldChange]);

  return {
    handleProviderFieldChange,
    handleDiscordFieldChange,
    handleGoogleSheetsFieldChange,
    handleAirtableFieldChange,
    clearDependentFields,
    loadDependentFieldOptions
  };
}