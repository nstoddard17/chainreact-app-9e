/**
 * @deprecated This hook has been consolidated into useFieldChangeHandler.ts
 * Please use useFieldChangeHandler instead.
 * This file is kept for reference only and will be removed in a future update.
 */

import { useCallback } from 'react';
import { useIntegrationStore } from '@/stores/integrationStore';

import { logger } from '@/lib/utils/logger'

interface UseFieldChangeHandlersProps {
  nodeInfo: any;
  values: Record<string, any>;
  setValue: (fieldName: string, value: any) => void;
  loadOptions: (fieldName: string, dependsOn?: string, dependsOnValue?: any, forceReload?: boolean) => Promise<void>;
  setLoadingFields: (setter: any) => void;
  resetOptions: (fieldName: string) => void;
  dynamicOptions: Record<string, any[]>;
  currentNodeId?: string;
  getWorkflowId: () => string | undefined;
  discordState?: any;
  airtableTableSchema?: any;
  setShowPreviewData?: (show: boolean) => void;
  setPreviewData?: (data: any[]) => void;
  setSelectedRecord?: (record: any) => void;
  setAirtableRecords?: (records: any[]) => void;
  setAirtableTableSchema?: (schema: any) => void;
  setLoadingRecords?: (loading: boolean) => void;
  loadAirtableRecords?: (baseId: string, tableName: string) => void;
  isLoadingInitialConfig?: boolean;
  activeBubbles?: Record<string, boolean>;
  fieldSuggestions?: Record<string, string>;
  originalBubbleValues?: Record<string, any>;
}

export function useFieldChangeHandlers({
  nodeInfo,
  values,
  setValue,
  loadOptions,
  setLoadingFields,
  resetOptions,
  dynamicOptions,
  currentNodeId,
  getWorkflowId,
  discordState,
  airtableTableSchema,
  setShowPreviewData,
  setPreviewData,
  setSelectedRecord,
  setAirtableRecords,
  setAirtableTableSchema,
  setLoadingRecords,
  loadAirtableRecords,
  isLoadingInitialConfig,
  activeBubbles,
  fieldSuggestions,
  originalBubbleValues
}: UseFieldChangeHandlersProps) {
  const { getIntegrationByProvider } = useIntegrationStore();

  /**
   * Handle Discord-specific field changes
   */
  const handleDiscordFieldChange = useCallback(async (fieldName: string, value: any) => {
    logger.debug('🔍 Discord field change:', { fieldName, value });

    if (fieldName === 'guildId') {
      // Clear dependent fields when server changes
      setValue('channelId', '');
      discordState?.setChannelBotStatus(null);
      discordState?.setChannelLoadingError(null);
      
      if (value) {
        // Set loading state for channelId field
        setLoadingFields(prev => {
          const newSet = new Set(prev);
          newSet.add('channelId');
          return newSet;
        });
        
        // Clear and reset channel options
        resetOptions('channelId');
        
        // Check bot status for the selected server
        setTimeout(() => {
          discordState?.checkBotStatus(value);
        }, 10);
      }
    }

    if (fieldName === 'channelId') {
      // Check if we have the messageId field and it's dependent on channelId
      const hasMessageField = nodeInfo?.configSchema?.some(field => 
        field.name === 'messageId' && field.dependsOn === 'channelId'
      );
      
      // Clear dependent fields
      if (hasMessageField) {
        setValue('messageId', '');
        
        // Set loading state for messageId field  
        setLoadingFields(prev => {
          const newSet = new Set(prev);
          newSet.add('messageId');
          return newSet;
        });
        
        // Clear and reset message options
        resetOptions('messageId');
      }
      
      if (value) {
        // Load messages for the channel after a brief delay
        setTimeout(() => {
          if (hasMessageField) {
            loadOptions('messageId', 'channelId', value, true).finally(() => {
              setLoadingFields(prev => {
                const newSet = new Set(prev);
                newSet.delete('messageId');
                return newSet;
              });
            });
          }
          
          discordState?.checkChannelBotStatus(value, values.guildId);
        }, 10);
      }
    }

    if (fieldName === 'messageId' && value) {
      // Check if we need to load reactions for this message
      const isRemoveReactionAction = nodeInfo?.type === 'discord_action_remove_reaction';
      if (isRemoveReactionAction && values.channelId) {
        discordState?.loadReactionsForMessage(values.channelId, value);
      }
    }

    // Standard value setting
    setValue(fieldName, value);
  }, [nodeInfo, values, setValue, loadOptions, setLoadingFields, resetOptions, discordState]);

  /**
   * Handle Airtable-specific field changes
   */
  const handleAirtableFieldChange = useCallback(async (fieldName: string, value: any) => {
    logger.debug('🔍 Airtable field change:', { fieldName, value });

    // Handle baseId change - RESET EVERYTHING
    if (fieldName === 'baseId') {
      // Clear ALL dependent fields when base changes
      setValue('tableName', '');
      setValue('recordId', '');
      setValue('filterField', '');
      setValue('filterValue', '');
      setSelectedRecord?.(null);
      setAirtableRecords?.([]);
      setAirtableTableSchema?.(null);
      setShowPreviewData?.(false);
      setPreviewData?.([]);
      
      // Clear all dynamic Airtable fields
      const dynamicFields = Object.keys(values).filter(key => key.startsWith('airtable_field_'));
      dynamicFields.forEach(field => setValue(field, ''));
      
      if (value) {
        // Set loading state for tableName
        setLoadingFields(prev => {
          const newSet = new Set(prev);
          newSet.add('tableName');
          return newSet;
        });
        
        // Reset cached options
        resetOptions('tableName');
        resetOptions('filterField');
        resetOptions('filterValue');
        
        // Load tables for the selected base
        setTimeout(() => {
          loadOptions('tableName', 'baseId', value, true).finally(() => {
            setLoadingFields(prev => {
              const newSet = new Set(prev);
              newSet.delete('tableName');
              return newSet;
            });
          });
        }, 10);
      }
    }

    // Handle tableName change - RESET EVERYTHING EXCEPT BASE
    if (fieldName === 'tableName') {
      // Clear all dependent fields except baseId
      setValue('recordId', '');
      setValue('filterField', '');
      setValue('filterValue', '');
      setSelectedRecord?.(null);
      setAirtableRecords?.([]);
      setAirtableTableSchema?.(null);
      setShowPreviewData?.(false);
      setPreviewData?.([]);
      
      // Clear any dynamic Airtable fields
      const dynamicFields = Object.keys(values).filter(key => key.startsWith('airtable_field_'));
      dynamicFields.forEach(field => setValue(field, ''));
      
      // Reset cached options for dependent fields
      resetOptions('filterField');
      resetOptions('filterValue');
      
      if (value && values.baseId) {
        // For list records action, load filter fields
        if (nodeInfo?.type === 'airtable_action_list_records') {
          setLoadingFields(prev => {
            const newSet = new Set(prev);
            newSet.add('filterField');
            return newSet;
          });
          
          setTimeout(() => {
            loadOptions('filterField', 'tableName', value, true).finally(() => {
              setLoadingFields(prev => {
                const newSet = new Set(prev);
                newSet.delete('filterField');
                return newSet;
              });
            });
          }, 10);
        }
      }
    }

    // Handle recordId change (from manual input or selection)
    if (fieldName === 'recordId' && value) {
      // If we have a selected record with fields, populate the dynamic fields
      if (selectedRecord?.fields) {
        Object.entries(selectedRecord.fields).forEach(([fieldName, fieldValue]) => {
          const dynamicFieldName = `airtable_field_${fieldName}`;
          setValue(dynamicFieldName, fieldValue);
        });
      }
    }

    // Handle dynamic Airtable field changes
    if (fieldName.startsWith('airtable_field_')) {
      // These are dynamic fields based on the table schema
      setValue(fieldName, value);
      return;
    }

    // Standard value setting
    setValue(fieldName, value);
  }, [nodeInfo, values, setValue, loadOptions, setLoadingFields, resetOptions, 
      setSelectedRecord, setAirtableRecords, setAirtableTableSchema, setShowPreviewData, setPreviewData, 
      selectedRecord]);

  /**
   * Handle Google Sheets-specific field changes
   */
  const handleGoogleSheetsFieldChange = useCallback(async (fieldName: string, value: any) => {
    logger.debug('🔍 Google Sheets field change:', { fieldName, value });

    // Handle spreadsheetId change
    if (fieldName === 'spreadsheetId') {
      // Clear dependent fields
      setValue('sheetName', '');
      setValue('range', '');
      
      if (value) {
        // Set loading state for sheetName
        setLoadingFields(prev => {
          const newSet = new Set(prev);
          newSet.add('sheetName');
          return newSet;
        });
        
        // Reset cached options
        resetOptions('sheetName');
        
        // Load sheets for the selected spreadsheet
        setTimeout(() => {
          loadOptions('sheetName', 'spreadsheetId', value, true).finally(() => {
            setLoadingFields(prev => {
              const newSet = new Set(prev);
              newSet.delete('sheetName');
              return newSet;
            });
          });
        }, 10);
      }
    }

    // Handle sheetName change
    if (fieldName === 'sheetName') {
      // Clear range if it exists
      if (nodeInfo?.configSchema?.some(f => f.name === 'range')) {
        setValue('range', '');
      }
    }

    // Standard value setting
    setValue(fieldName, value);
  }, [nodeInfo, setValue, loadOptions, setLoadingFields, resetOptions]);

  /**
   * Handle generic dependent field changes
   */
  const handleDependentFieldChange = useCallback(async (fieldName: string, value: any, field: any) => {
    logger.debug('🔍 Dependent field change:', { fieldName, value, dependsOn: field.dependsOn });

    // Find all fields that depend on this field
    const dependentFields = nodeInfo?.configSchema?.filter(f => f.dependsOn === fieldName) || [];
    
    if (dependentFields.length > 0) {
      // Clear all dependent fields
      dependentFields.forEach(depField => {
        setValue(depField.name, '');
        
        // Set loading state if the field has dynamic options
        if (depField.dynamicOptions) {
          setLoadingFields(prev => {
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
        setTimeout(() => {
          Promise.all(
            dependentFields
              .filter(depField => depField.dynamicOptions)
              .map(depField => 
                loadOptions(depField.name, fieldName, value, true).finally(() => {
                  setLoadingFields(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(depField.name);
                    return newSet;
                  });
                })
              )
          );
        }, 10);
      }
    }

    // Standard value setting
    setValue(fieldName, value);
  }, [nodeInfo, setValue, loadOptions, setLoadingFields, resetOptions]);

  /**
   * Main field change handler that routes to appropriate provider handler
   */
  const handleFieldChange = useCallback(async (fieldName: string, value: any, skipBubbleCreation: boolean = false) => {
    logger.debug('🔍 handleFieldChange called:', { fieldName, value, provider: nodeInfo?.providerId });

    // Check if this is a file/attachment field first
    const field = nodeInfo?.configSchema?.find(f => f.name === fieldName);

    // Provider-specific handling
    if (nodeInfo?.providerId === 'discord') {
      await handleDiscordFieldChange(fieldName, value);
      return;
    }

    if (nodeInfo?.providerId === 'airtable') {
      await handleAirtableFieldChange(fieldName, value);
      return;
    }

    if (nodeInfo?.providerId === 'google-sheets') {
      await handleGoogleSheetsFieldChange(fieldName, value);
      return;
    }

    // Handle generic dependent fields
    if (field?.dependsOn) {
      await handleDependentFieldChange(fieldName, value, field);
      return;
    }

    // Default handling for all other fields
    setValue(fieldName, value);
  }, [nodeInfo, handleDiscordFieldChange, handleAirtableFieldChange, 
      handleGoogleSheetsFieldChange, handleDependentFieldChange, setValue]);

  return {
    handleFieldChange,
    handleDiscordFieldChange,
    handleAirtableFieldChange,
    handleGoogleSheetsFieldChange,
    handleDependentFieldChange
  };
}