import { useCallback } from 'react';

interface UseAirtableFieldHandlerProps {
  nodeInfo: any;
  values: Record<string, any>;
  setValue: (fieldName: string, value: any) => void;
  loadOptions: (fieldName: string, dependsOn?: string, dependsOnValue?: any, forceReload?: boolean) => Promise<void>;
  setLoadingFields: (setter: any) => void;
  resetOptions: (fieldName: string) => void;
  setSelectedRecord?: (record: any) => void;
  setAirtableRecords?: (records: any[]) => void;
  setAirtableTableSchema?: (schema: any) => void;
  setShowPreviewData?: (show: boolean) => void;
  setPreviewData?: (data: any[]) => void;
  selectedRecord?: any;
  clearedFieldsRef?: React.MutableRefObject<Set<string>>;
}

/**
 * Airtable-specific field change handler hook
 * Encapsulates all Airtable field dependency logic
 */
export function useAirtableFieldHandler({
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
}: UseAirtableFieldHandlerProps) {

  /**
   * Clear all dynamic Airtable fields
   */
  const clearDynamicFields = useCallback(() => {
    Object.keys(values).forEach(key => {
      if (key.startsWith('airtable_field_')) {
        setValue(key, '');
      }
    });
  }, [values, setValue]);

  /**
   * Clear all Airtable state
   */
  const clearAirtableState = useCallback(() => {
    setSelectedRecord?.(null);
    setAirtableRecords?.([]);
    setAirtableTableSchema?.(null);
    setShowPreviewData?.(false);
    setPreviewData?.([]);
  }, [setSelectedRecord, setAirtableRecords, setAirtableTableSchema, setShowPreviewData, setPreviewData]);

  /**
   * Handle baseId changes - clear everything
   */
  const handleBaseIdChange = useCallback(async (value: any) => {
    console.log('🔍 Airtable baseId changed:', value);

    // Mark dependent fields as manually cleared to prevent restoration from initialData
    const fieldsToMark = ['tableName', 'recordId', 'filterField', 'filterValue'];
    fieldsToMark.forEach(field => {
      clearedFieldsRef?.current.add(field);
    });
    console.log('🚫 [Airtable] Marked fields as cleared:', fieldsToMark);

    // Clear ALL dependent fields - set to empty string to override any saved values
    setValue('tableName', '', { shouldValidate: false });
    setValue('recordId', '', { shouldValidate: false });
    setValue('filterField', '', { shouldValidate: false });
    setValue('filterValue', '', { shouldValidate: false });

    // Clear state and dynamic fields
    clearAirtableState();
    clearDynamicFields();

    if (value) {
      // Set loading state for tableName
      setLoadingFields((prev: Set<string>) => {
        const newSet = new Set(prev);
        newSet.add('tableName');
        return newSet;
      });

      // Reset cached options to ensure fresh load
      resetOptions('tableName');

      // Load tables with delay - force refresh to ensure we get latest data
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
  }, [setValue, clearAirtableState, clearDynamicFields, setLoadingFields, resetOptions, loadOptions]);

  /**
   * Handle tableName changes - clear everything except baseId
   */
  const handleTableNameChange = useCallback(async (value: any) => {
    console.log('🔍 Airtable tableName changed:', value);
    
    // Clear dependent fields (everything except baseId)
    setValue('recordId', '');
    setValue('filterField', '');
    setValue('filterValue', '');
    
    // Clear state and dynamic fields
    clearAirtableState();
    clearDynamicFields();
    
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
  }, [nodeInfo, setValue, clearAirtableState, clearDynamicFields, setLoadingFields, resetOptions, loadOptions]);

  /**
   * Handle filterField changes
   */
  const handleFilterFieldChange = useCallback(async (value: any) => {
    if (nodeInfo?.type !== 'airtable_action_list_records') return;
    
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
  }, [nodeInfo, values, setValue, setLoadingFields, resetOptions, loadOptions]);

  /**
   * Handle recordId change - populate dynamic fields from selected record
   */
  const handleRecordIdChange = useCallback((value: any) => {
    if (value && selectedRecord?.fields) {
      console.log('🔍 Airtable recordId changed, populating dynamic fields');
      
      // Populate dynamic fields from selected record
      Object.entries(selectedRecord.fields).forEach(([fieldName, fieldValue]) => {
        const dynamicFieldName = `airtable_field_${fieldName}`;
        setValue(dynamicFieldName, fieldValue);
      });
    }
  }, [selectedRecord, setValue]);

  /**
   * Main Airtable field change handler
   */
  const handleFieldChange = useCallback(async (fieldName: string, value: any): Promise<boolean> => {
    if (nodeInfo?.providerId !== 'airtable') return false;

    switch (fieldName) {
      case 'baseId':
        await handleBaseIdChange(value);
        return true;
      
      case 'tableName':
        await handleTableNameChange(value);
        return true;
      
      case 'filterField':
        await handleFilterFieldChange(value);
        return true;
      
      case 'recordId':
        handleRecordIdChange(value);
        return true;
      
      default:
        // Handle dynamic Airtable fields
        if (fieldName.startsWith('airtable_field_')) {
          return true; // Indicate we recognize this field
        }
        return false;
    }
  }, [nodeInfo, handleBaseIdChange, handleTableNameChange, handleFilterFieldChange, handleRecordIdChange]);

  return {
    handleFieldChange,
    handleBaseIdChange,
    handleTableNameChange,
    handleFilterFieldChange,
    handleRecordIdChange,
    clearDynamicFields,
    clearAirtableState
  };
}