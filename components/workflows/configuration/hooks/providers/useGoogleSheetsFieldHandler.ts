import { useCallback, useRef, useEffect } from 'react';

import { logger } from '@/lib/utils/logger'

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
  const previousSpreadsheetIdRef = useRef<any>(undefined);
  const isProcessingRef = useRef<boolean>(false);

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
    logger.debug('🔍 Google Sheets spreadsheetId change handler called:', {
      newValue: value,
      previousValue: previousSpreadsheetIdRef.current,
      isProcessing: isProcessingRef.current,
      isActualChange: value !== previousSpreadsheetIdRef.current
    });

    // Prevent concurrent processing
    if (isProcessingRef.current) {
      logger.debug('⏭️ Already processing spreadsheetId change, skipping');
      return;
    }

    // Only process if the value actually changed from the previous value
    if (value === previousSpreadsheetIdRef.current) {
      logger.debug('✅ Google Sheets spreadsheetId unchanged, skipping reset');
      return;
    }

    // Mark as processing
    isProcessingRef.current = true;

    logger.debug('🔄 Google Sheets spreadsheetId actually changed, proceeding with reset');

    // Update the ref to track the new value
    previousSpreadsheetIdRef.current = value;

    // Clear preview data for update action
    if (values.action === 'update') {
      clearPreviewData();
      clearUpdateFields();
    }

    // Clear sheetName and ALL fields that depend on sheetName
    setValue('sheetName', '');

    // Also clear all fields that depend on sheetName (cascading clear)
    const sheetDependentFields = nodeInfo?.configSchema?.filter((f: any) => f.dependsOn === 'sheetName') || [];
    for (const depField of sheetDependentFields) {
      logger.debug(`🧹 [Google Sheets] Clearing cascading dependent field: ${depField.name}`);
      setValue(depField.name, '');
      if (depField.dynamic || depField.dynamicOptions) {
        resetOptions(depField.name);
      }
    }

    // Clear fields that depend on filterColumn (second-level dependencies)
    const filterColumnDependents = nodeInfo?.configSchema?.filter((f: any) => f.dependsOn === 'filterColumn') || [];
    for (const depField of filterColumnDependents) {
      logger.debug(`🧹 [Google Sheets] Clearing second-level dependent field: ${depField.name}`);
      setValue(depField.name, '');
      if (depField.dynamic || depField.dynamicOptions) {
        resetOptions(depField.name);
      }
    }

    // Clear fields that depend on sortColumn
    const sortColumnDependents = nodeInfo?.configSchema?.filter((f: any) => f.dependsOn === 'sortColumn') || [];
    for (const depField of sortColumnDependents) {
      setValue(depField.name, '');
    }

    // Clear fields that depend on dateFilter
    const dateFilterDependents = nodeInfo?.configSchema?.filter((f: any) => f.dependsOn === 'dateFilter') || [];
    for (const depField of dateFilterDependents) {
      setValue(depField.name, '');
    }

    // Clear fields that depend on recordLimit
    const recordLimitDependents = nodeInfo?.configSchema?.filter((f: any) => f.dependsOn === 'recordLimit') || [];
    for (const depField of recordLimitDependents) {
      setValue(depField.name, '');
    }

    if (value) {
      // Set loading state for sheetName
      setLoadingFields((prev: Set<string>) => {
        const newSet = new Set(prev);
        newSet.add('sheetName');
        return newSet;
      });

      // Reset cached options only when spreadsheetId actually changes
      resetOptions('sheetName');

      // Load sheets for the selected spreadsheet
      try {
        await loadOptions('sheetName', 'spreadsheetId', value, false);
      } catch (error) {
        logger.error('Error loading sheets:', error);
      } finally {
        // Clear loading state
        setLoadingFields((prev: Set<string>) => {
          const newSet = new Set(prev);
          newSet.delete('sheetName');
          return newSet;
        });
        // Clear processing flag
        isProcessingRef.current = false;
      }
    } else {
      // Clear processing flag if no value
      isProcessingRef.current = false;
    }
  }, [nodeInfo, values, setValue, clearPreviewData, clearUpdateFields, setLoadingFields, resetOptions, loadOptions]);

  /**
   * Handle sheetName changes
   */
  const handleSheetNameChange = useCallback(async (value: any) => {
    logger.debug('🔍 Google Sheets sheetName changed:', value);

    // Clear preview data for update action
    if (values.action === 'update') {
      clearPreviewData();
      clearUpdateFields();
    }

    // Clear range if it exists
    if (nodeInfo?.configSchema?.some((f: any) => f.name === 'range')) {
      setValue('range', '');
    }

    // Find all fields that depend on sheetName and clear them
    const dependentFields = nodeInfo?.configSchema?.filter((f: any) => f.dependsOn === 'sheetName') || [];

    for (const depField of dependentFields) {
      logger.debug(`🧹 [Google Sheets] Clearing dependent field: ${depField.name}`);
      setValue(depField.name, '');

      // Reset cached options for dynamic fields
      if (depField.dynamic || depField.dynamicOptions) {
        resetOptions(depField.name);

        // Set loading state
        setLoadingFields((prev: Set<string>) => {
          const newSet = new Set(prev);
          newSet.add(depField.name);
          return newSet;
        });
      }
    }

    // Load options for dependent fields if we have a new value
    if (value) {
      for (const depField of dependentFields) {
        if (depField.dynamic || depField.dynamicOptions) {
          try {
            await loadOptions(depField.name, 'sheetName', value, true);
          } catch (error) {
            logger.error(`Error loading options for ${depField.name}:`, error);
          } finally {
            setLoadingFields((prev: Set<string>) => {
              const newSet = new Set(prev);
              newSet.delete(depField.name);
              return newSet;
            });
          }
        }
      }
    } else {
      // Clear loading states if no value
      for (const depField of dependentFields) {
        if (depField.dynamic || depField.dynamicOptions) {
          setLoadingFields((prev: Set<string>) => {
            const newSet = new Set(prev);
            newSet.delete(depField.name);
            return newSet;
          });
        }
      }
    }
  }, [nodeInfo, values, clearPreviewData, clearUpdateFields, setValue, resetOptions, loadOptions, setLoadingFields]);

  /**
   * Handle action changes
   */
  const handleActionChange = useCallback((value: any) => {
    logger.debug('🔍 Google Sheets action changed:', value);
    
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
        await handleSheetNameChange(value);
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