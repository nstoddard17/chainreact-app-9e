import { useCallback, useRef, useEffect } from 'react';

interface UseGoogleSheetsFieldHandlerProps {
  nodeInfo: any;
  values: Record<string, any>;
  setValue: (fieldName: string, value: any) => void;
  loadOptions: (fieldName: string, dependsOn?: string, dependsOnValue?: any, forceReload?: boolean) => Promise<void>;
  setLoadingFields: (setter: any) => void;
  resetOptions: (fieldName: string) => void;
  setSelectedRecord?: (record: any) => void;
  setPreviewData?: (data: any[]) => void;
  setShowPreviewData?: (show: boolean) => void;
  setTableSearchQuery?: (query: string) => void;
  setGoogleSheetsSortField?: (field: string | null) => void;
  setGoogleSheetsSortDirection?: (direction: 'asc' | 'desc') => void;
  setGoogleSheetsSelectedRows?: (rows: Set<string>) => void;
}

/**
 * Google Sheets-specific field change handler hook
 * Encapsulates all Google Sheets field dependency logic
 */
export function useGoogleSheetsFieldHandler({
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
}: UseGoogleSheetsFieldHandlerProps) {

  // Track the previous spreadsheetId to detect actual changes
  const previousSpreadsheetIdRef = useRef<any>(values.spreadsheetId);

  /**
   * Clear all update-related fields
   */
  const clearUpdateFields = useCallback(() => {
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
  }, [values, setValue]);

  /**
   * Clear all preview and state data
   */
  const clearPreviewData = useCallback(() => {
    setSelectedRecord?.(null);
    setPreviewData?.([]);
    setShowPreviewData?.(false);
    setTableSearchQuery?.('');
    setGoogleSheetsSortField?.(null);
    setGoogleSheetsSortDirection?.('asc');
    setGoogleSheetsSelectedRows?.(new Set());
  }, [
    setSelectedRecord,
    setPreviewData,
    setShowPreviewData,
    setTableSearchQuery,
    setGoogleSheetsSortField,
    setGoogleSheetsSortDirection,
    setGoogleSheetsSelectedRows
  ]);

  /**
   * Handle spreadsheetId changes
   */
  const handleSpreadsheetIdChange = useCallback(async (value: any) => {
    console.log('🔍 Google Sheets spreadsheetId change handler called:', {
      newValue: value,
      previousValue: previousSpreadsheetIdRef.current,
      isActualChange: value !== previousSpreadsheetIdRef.current
    });

    // Only process if the value actually changed from the previous value
    if (value === previousSpreadsheetIdRef.current) {
      console.log('✅ Google Sheets spreadsheetId unchanged, skipping reset');
      return;
    }

    console.log('🔄 Google Sheets spreadsheetId actually changed, proceeding with reset');

    // Update the ref to the new value immediately after confirming it's a real change
    previousSpreadsheetIdRef.current = value;

    // Clear preview data for update action
    if (values.action === 'update') {
      clearPreviewData();
      clearUpdateFields();
    }

    // Clear dependent field
    setValue('sheetName', '');

    if (value) {
      // Set loading state for sheetName
      setLoadingFields((prev: Set<string>) => {
        const newSet = new Set(prev);
        newSet.add('sheetName');
        return newSet;
      });

      // Reset cached options only when spreadsheetId actually changes
      resetOptions('sheetName');

      // Load sheets for the selected spreadsheet (avoid force refresh to reduce API thrash)
      setTimeout(() => {
        loadOptions('sheetName', 'spreadsheetId', value, false).finally(() => {
          setLoadingFields((prev: Set<string>) => {
            const newSet = new Set(prev);
            newSet.delete('sheetName');
            return newSet;
          });
        });
      }, 10);
    }
  }, [values, setValue, clearPreviewData, clearUpdateFields, setLoadingFields, resetOptions, loadOptions]);

  /**
   * Handle sheetName changes
   */
  const handleSheetNameChange = useCallback((value: any) => {
    console.log('🔍 Google Sheets sheetName changed:', value);
    
    // Clear preview data for update action
    if (values.action === 'update') {
      clearPreviewData();
      clearUpdateFields();
    }
    
    // Clear range if it exists
    if (nodeInfo?.configSchema?.some((f: any) => f.name === 'range')) {
      setValue('range', '');
    }
  }, [nodeInfo, values, clearPreviewData, clearUpdateFields, setValue]);

  /**
   * Handle action changes
   */
  const handleActionChange = useCallback((value: any) => {
    console.log('🔍 Google Sheets action changed:', value);
    
    const previousAction = values.action;
    
    // Clear all preview and state data
    clearPreviewData();
    
    // Clear update-specific fields if switching from update
    if (previousAction === 'update') {
      clearUpdateFields();
    }
  }, [values, clearPreviewData, clearUpdateFields]);

  /**
   * Main Google Sheets field change handler
   */
  const handleFieldChange = useCallback(async (fieldName: string, value: any): Promise<boolean> => {
    if (nodeInfo?.providerId !== 'google-sheets') return false;

    switch (fieldName) {
      case 'spreadsheetId':
        await handleSpreadsheetIdChange(value);
        return true;
      
      case 'sheetName':
        handleSheetNameChange(value);
        return true;
      
      case 'action':
        handleActionChange(value);
        return true;
      
      default:
        return false;
    }
  }, [nodeInfo, handleSpreadsheetIdChange, handleSheetNameChange, handleActionChange]);

  return {
    handleFieldChange,
    handleSpreadsheetIdChange,
    handleSheetNameChange,
    handleActionChange,
    clearUpdateFields,
    clearPreviewData
  };
}