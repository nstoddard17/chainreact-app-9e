"use client"

import React, { useCallback, useState } from 'react';
import { Button } from "@/components/ui/button";
import { AlertTriangle, Eye } from "lucide-react";
import { ConfigurationContainer } from '../components/ConfigurationContainer';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FieldRenderer } from '../fields/FieldRenderer';
import { useIntegrationStore } from '@/stores/integrationStore';
import { GoogleSheetsDataPreview } from '../components/google-sheets/GoogleSheetsDataPreview';
import { GoogleSheetsUpdateFields } from '../components/google-sheets/GoogleSheetsUpdateFields';
import { GoogleSheetsDeleteConfirmation } from '../components/google-sheets/GoogleSheetsDeleteConfirmation';
import { GoogleSheetsAddRowFields } from '../components/google-sheets/GoogleSheetsAddRowFields';
import { GoogleSheetsAddRowPreview } from '../components/google-sheets/GoogleSheetsAddRowPreview';
import { GoogleSheetsRangePreview } from '../components/google-sheets/GoogleSheetsRangePreview';
import { GoogleSheetsRowPreview } from '../components/google-sheets/GoogleSheetsRowPreview';
import { GoogleSheetsFindRowPreview } from '../components/google-sheets/GoogleSheetsFindRowPreview';
import { GoogleSheetsUpdateRowPreview } from '../components/google-sheets/GoogleSheetsUpdateRowPreview';
import { GoogleSheetsUpdateRowFields } from '../components/google-sheets/GoogleSheetsUpdateRowFields';
import { getProviderDisplayName } from '@/lib/utils/provider-names';

import { logger } from '@/lib/utils/logger'

interface GoogleSheetsConfigurationProps {
  nodeInfo: any;
  values: Record<string, any>;
  setValue: (field: string, value: any) => void;
  errors: Record<string, string>;
  onSubmit: (values: Record<string, any>) => Promise<void>;
  onCancel: () => void;
  onBack?: () => void;
  isEditMode?: boolean;
  workflowData?: any;
  currentNodeId?: string;
  dynamicOptions: Record<string, any[]>;
  loadingDynamic: boolean;
  loadOptions: (fieldName: string, parentField?: string, parentValue?: any, forceReload?: boolean) => Promise<void>;
  integrationName?: string;
  needsConnection?: boolean;
  onConnectIntegration?: () => void;
  aiFields?: Record<string, boolean>;
  setAiFields?: (fields: Record<string, boolean>) => void;
}

export function GoogleSheetsConfiguration({
  nodeInfo,
  values,
  setValue,
  errors,
  onSubmit,
  onCancel,
  onBack,
  isEditMode,
  workflowData,
  currentNodeId,
  dynamicOptions,
  loadingDynamic,
  loadOptions,
  integrationName,
  needsConnection,
  onConnectIntegration,
  aiFields = {},
  setAiFields = () => {},
}: GoogleSheetsConfigurationProps) {
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [loadingFields, setLoadingFields] = useState<Set<string>>(new Set());
  const [showPreviewData, setShowPreviewData] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [tableSearchQuery, setTableSearchQuery] = useState('');
  const [tableDisplayCount, setTableDisplayCount] = useState(25);
  const [googleSheetsSortField, setGoogleSheetsSortField] = useState<string | null>(null);
  const [googleSheetsSortDirection, setGoogleSheetsSortDirection] = useState<'asc' | 'desc'>('asc');
  const [googleSheetsSelectedRows, setGoogleSheetsSelectedRows] = useState<Set<string>>(new Set());
  const [googleSheetsHasHeaders, setGoogleSheetsHasHeaders] = useState(true);
  
  // Track column update values separately to ensure they're captured
  const [columnUpdateValues, setColumnUpdateValues] = useState<Record<string, any>>({});
  
  // Wrap setValue to capture column_ and newRow_ fields
  const setValueWithColumnTracking = React.useCallback((key: string, value: any) => {
    logger.debug(`🔧 [GoogleSheets] Setting value: ${key} = ${value}`);
    
    // Always set in the main values
    setValue(key, value);
    
    // Also track column_ fields separately for update action
    if (key.startsWith('column_')) {
      setColumnUpdateValues(prev => ({
        ...prev,
        [key]: value
      }));
      logger.debug(`🔧 [GoogleSheets] Tracked column field: ${key} = ${value}`);
    }
    
    // For newRow_ fields, just ensure they're set in main values (no separate tracking needed)
    if (key.startsWith('newRow_')) {
      logger.debug(`🔧 [GoogleSheets] Set newRow field: ${key} = ${value}`);
    }
  }, [setValue]);
  
  const { getIntegrationByProvider } = useIntegrationStore();

  // Track previous action to detect changes
  const [previousAction, setPreviousAction] = useState(values.action);
  const [previousRowPosition, setPreviousRowPosition] = useState(values.rowPosition);

  // Reset grid state when action changes
  React.useEffect(() => {
    if (previousAction !== values.action && previousAction !== undefined) {
      // Reset all grid-related state
      setShowPreviewData(false);
      setPreviewData([]);
      setGoogleSheetsSelectedRows(new Set());
      setTableSearchQuery('');
      setTableDisplayCount(25);
      setGoogleSheetsSortField(null);
      setGoogleSheetsSortDirection('asc');
      hasInitializedRef.current = false; // Reset initialization flag
      
      // Clear action-specific fields when switching actions
      // Clear update-specific fields
      if (previousAction === 'update') {
        setValue('updateRowNumber', undefined);
        setValue('updateFields', undefined);
      }
      
      // Clear delete-specific fields
      if (previousAction === 'delete') {
        setValue('deleteRowBy', undefined);
        setValue('deleteRowNumber', undefined);
        setValue('deleteSearchColumn', undefined);
        setValue('deleteSearchValue', undefined);
        setValue('deleteAll', false);
;
      }
      
      // Clear add-specific fields
      if (previousAction === 'add') {
        setValue('rowPosition', undefined);
        setValue('columnMapping', undefined);
      }
    }
    setPreviousAction(values.action);
  }, [values.action, previousAction, setValue]);

  // Handle dynamic field loading
  const handleDynamicLoad = useCallback(async (
    fieldName: string,
    dependsOn?: string,
    dependsOnValue?: any,
    forceReload?: boolean
  ) => {
    logger.debug('🔍 [GoogleSheetsConfig] handleDynamicLoad called:', {
      fieldName,
      dependsOn,
      dependsOnValue,
      forceReload
    });

    const field = nodeInfo?.configSchema?.find((f: any) => f.name === fieldName);
    if (!field) {
      logger.warn('Field not found in schema:', fieldName);
      return;
    }

    // Add field to loading set
    setLoadingFields(prev => {
      const newSet = new Set(prev);
      newSet.add(fieldName);
      return newSet;
    });

    try {
      // If explicit dependencies are provided, use them
      if (dependsOn && dependsOnValue !== undefined) {
        await loadOptions(fieldName, dependsOn, dependsOnValue, forceReload);
      }
      // Otherwise check field's defined dependencies
      else if (field.dependsOn && values[field.dependsOn]) {
        await loadOptions(fieldName, field.dependsOn, values[field.dependsOn], forceReload);
      }
      // No dependencies, just load the field
      else {
        await loadOptions(fieldName, undefined, undefined, forceReload);
      }
    } catch (error) {
      logger.error('Error loading dynamic options:', error);
    } finally {
      // Remove field from loading set
      setLoadingFields(prev => {
        const newSet = new Set(prev);
        newSet.delete(fieldName);
        return newSet;
      });
    }
  }, [nodeInfo, values, loadOptions]);

  // Load Google Sheets preview data
  const loadGoogleSheetsPreviewData = useCallback(async (spreadsheetId: string, sheetName: string, hasHeaders: boolean) => {
    if (!spreadsheetId || !sheetName) return;
    
    setLoadingPreview(true);
    setShowPreviewData(true);
    
    try {
      logger.debug('📊 Loading Google Sheets preview data...', {
        spreadsheetId,
        sheetName,
        hasHeaders
      });
      
      // Get the Google Sheets integration
      const googleSheetsIntegration = getIntegrationByProvider('google-sheets');
      if (!googleSheetsIntegration) {
        logger.error('Google Sheets integration not found');
        setPreviewData([]);
        return;
      }
      
      // Fetch sheet data using the integration API
      const response = await fetch('/api/integrations/google-sheets/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId: googleSheetsIntegration.id,
          dataType: 'google-sheets_records',
          options: {
            spreadsheetId,
            sheetName,
            maxRows: 100, // Get more rows for better preview
            includeHeaders: hasHeaders
          }
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        logger.error('Failed to fetch sheet data:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        setPreviewData([]);
        return;
      }
      
      const result = await response.json();
      logger.debug('📊 Sheet data loaded:', result);
      
      // Format the data for display - transform to match expected format
      if (result.data && Array.isArray(result.data)) {
        const formattedData = result.data.map((row: any) => ({
          id: row.rowNumber ? `row_${row.rowNumber}` : `row_${Math.random()}`,
          rowNumber: row.rowNumber,
          fields: row.fields || row
        }));
        setPreviewData(formattedData);
      } else {
        setPreviewData([]);
      }
    } catch (error) {
      logger.error('Error loading preview:', error);
      setPreviewData([]);
    } finally {
      setLoadingPreview(false);
    }
  }, [getIntegrationByProvider]);
  
  // Track if we've initialized the newRow fields
  const hasInitializedRef = React.useRef(false);

  // Initialize newRow_ fields from saved columnMapping when editing
  React.useEffect(() => {
    // Check if we have saved columnMapping data (indicates this is an edit of existing config)
    const hasSavedData = values.columnMapping && typeof values.columnMapping === 'object' && Object.keys(values.columnMapping).length > 0;
    
    logger.debug('📊 [GoogleSheets] Checking restoration conditions:', {
      hasSavedData,
      action: values.action,
      hasColumnMapping: !!values.columnMapping,
      columnMapping: values.columnMapping,
      hasInitialized: hasInitializedRef.current,
      showPreviewData,
      previewDataLength: previewData.length
    });
    
    // Only run once when we have the data we need
    // Wait for preview data to be loaded so we know which columns exist
    if (hasInitializedRef.current || !hasSavedData || values.action !== 'add' || !showPreviewData || previewData.length === 0) {
      return;
    }
    
    // Restore the saved columnMapping data
    logger.debug('📊 [GoogleSheets] Initializing newRow fields from saved columnMapping:', values.columnMapping);
    
    // Convert saved columnMapping back to individual newRow_ fields
    Object.entries(values.columnMapping).forEach(([columnName, value]) => {
      const fieldName = `newRow_${columnName}`;
      logger.debug(`  - Restoring ${fieldName} = "${value}"`);
      setValue(fieldName, value);
    });
    
    // Mark as initialized
    hasInitializedRef.current = true;
  }, [values.action, values.columnMapping, setValue, showPreviewData, previewData]);

  // Handle mode switching for Update Row action - clear fields from the other mode
  const previousUpdateModeRef = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    if (nodeInfo?.type !== 'google_sheets_action_update_row') return;
    if (!values.updateMode) return;

    // Check if mode actually changed (not just initial render)
    if (previousUpdateModeRef.current && previousUpdateModeRef.current !== values.updateMode) {
      if (values.updateMode === 'simple') {
        // Switched to simple mode - clear visual mode fields
        logger.debug('🔄 Switched to Simple mode - clearing visual fields');
        // Clear column_ fields
        Object.keys(values).forEach(key => {
          if (key.startsWith('column_')) {
            setValue(key, '');
          }
        });
        // Clear selected row state
        setGoogleSheetsSelectedRows(new Set());
      } else if (values.updateMode === 'visual') {
        // Switched to visual mode - clear simple mode fields
        logger.debug('🔄 Switched to Visual mode - clearing simple fields');
        setValue('rowNumber', '');
        setValue('values', '');
        setValue('rowSelection', '');
      }
    }

    previousUpdateModeRef.current = values.updateMode;
  }, [values.updateMode, nodeInfo?.type, setValue, values]);

  // Handle row selection changes for Update Row and Delete Row actions
  const previousRowSelectionRef = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    const isUpdateRow = nodeInfo?.type === 'google_sheets_action_update_row';
    const isDeleteRow = nodeInfo?.type === 'google_sheets_action_delete_row';

    if (!isUpdateRow && !isDeleteRow) return;
    if (!values.rowSelection) return;

    // Check if rowSelection actually changed (not just initial render)
    if (previousRowSelectionRef.current && previousRowSelectionRef.current !== values.rowSelection) {
      // Clear rowNumber when switching away from "specific"
      if (values.rowSelection === 'last' || values.rowSelection === 'first_data') {
        logger.debug('🔄 Switched row selection to automated - clearing rowNumber');
        setValue('rowNumber', '');
      }
    }

    previousRowSelectionRef.current = values.rowSelection;
  }, [values.rowSelection, nodeInfo?.type, setValue]);

  // Auto-load preview data when sheet is selected
  React.useEffect(() => {
    // For Add Row action (google_sheets_action_append_row), load preview data when:
    // 1. Required fields (spreadsheetId and sheetName) are present
    // 2. Preview not already loaded
    // 3. This is the Add Row action (nodeInfo.type ends with append_row)
    const isAddRowAction = nodeInfo?.type === 'google_sheets_action_append_row';

    if (isAddRowAction && values.spreadsheetId && values.sheetName) {
      const needsPreviewLoad = !showPreviewData && !loadingPreview;

      if (needsPreviewLoad) {
        logger.debug('📊 [GoogleSheets] Auto-loading preview for Add Row action', {
          spreadsheetId: values.spreadsheetId,
          sheetName: values.sheetName,
          showPreviewData,
          loadingPreview
        });

        loadGoogleSheetsPreviewData(values.spreadsheetId, values.sheetName, googleSheetsHasHeaders);
      }
    }

    // For other actions (update/delete), keep the old logic
    if (values.action === 'add' && values.spreadsheetId && values.sheetName) {
      const actionJustChangedToAdd = previousAction !== 'add' && values.action === 'add';
      const needsPreviewLoad = !showPreviewData && !loadingPreview;
      const hasRowPosition = values.rowPosition || 'end';

      if ((actionJustChangedToAdd || needsPreviewLoad) && hasRowPosition) {
        if (!values.rowPosition) {
          setValue('rowPosition', 'end');
        }
        loadGoogleSheetsPreviewData(values.spreadsheetId, values.sheetName, googleSheetsHasHeaders);
      }
    }
    setPreviousRowPosition(values.rowPosition);
  }, [nodeInfo?.type, values.action, values.rowPosition, values.spreadsheetId, values.sheetName,
      previousRowPosition, previousAction, googleSheetsHasHeaders, loadGoogleSheetsPreviewData,
      showPreviewData, loadingPreview, setValue]);

  // Handle row selection
  const handleRowSelect = useCallback((rowId: string, selected: boolean) => {
    setGoogleSheetsSelectedRows(prev => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(rowId);
      } else {
        newSet.delete(rowId);
      }
      return newSet;
    });
  }, []);

  // Handle select all/none
  const handleSelectAll = useCallback((selected: boolean) => {
    if (selected) {
      const allRowIds = previewData.map(row => row.id);
      setGoogleSheetsSelectedRows(new Set(allRowIds));
    } else {
      setGoogleSheetsSelectedRows(new Set());
    }
  }, [previewData]);

  // Handle row click for update action
  const handleRowClick = useCallback((row: any) => {
    if (values.action === 'update') {
      // Set the row number for update
      setValue('updateRowNumber', row.rowNumber);
      logger.debug('📊 Row selected for update:', row);
      
      // Optionally populate field values with row data
      if (row.fields) {
        Object.entries(row.fields).forEach(([key, value]) => {
          const updateFieldName = `updateField_${key}`;
          if (values[updateFieldName] !== undefined) {
            setValue(updateFieldName, value);
          }
        });
      }
    }
  }, [values, setValue]);

  // Filter fields based on visibility conditions
  const getVisibleFields = () => {
    if (!nodeInfo?.configSchema) return [];
    
    return nodeInfo.configSchema.filter((field: any) => {
      // Skip advanced fields and hidden type fields
      if (field.advanced || field.type === 'hidden') return false;
      
      // Hide the columnMapping field for add action (we're replacing it with custom fields)
      if (field.name === 'columnMapping' && values.action === 'add') return false;
      
      // Check if field depends on another field
      if (field.dependsOn) {
        const dependencyValue = values[field.dependsOn];
        if (!dependencyValue) {
          logger.debug(`📋 [GoogleSheets] Field "${field.name}" hidden - depends on "${field.dependsOn}" which has no value`);
          return false; // Hide field if dependency has no value
        }
      }
      
      // Check if field should be shown based on showIf condition
      if (field.showIf && typeof field.showIf === 'function') {
        const shouldShow = field.showIf(values);
        logger.debug(`📋 [GoogleSheets] Field "${field.name}" showIf evaluated:`, shouldShow, 'with values:', values);
        return shouldShow;
      }
      
      // If field is marked as hidden but has showIf, evaluate showIf
      if (field.hidden && field.showIf) {
        if (typeof field.showIf === 'function') {
          const shouldShow = field.showIf(values);
          logger.debug(`📋 [GoogleSheets] Hidden field "${field.name}" showIf evaluated:`, shouldShow);
          return shouldShow;
        }
      }

      // Evaluate hidden condition object (e.g., { $deps: [...], $condition: {...} })
      if (field.hidden && typeof field.hidden === 'object' && field.hidden.$deps && field.hidden.$condition) {
        // Evaluate the condition based on dependencies
        const condition = field.hidden.$condition;

        // Helper function to evaluate a single condition object
        const evaluateCondition = (condObj: any): boolean => {
          for (const [depField, depCondition] of Object.entries(condObj)) {
            if (typeof depCondition === 'object' && depCondition !== null) {
              const depValue = values[depField];

              // Check $exists condition
              if ('$exists' in depCondition) {
                const shouldExist = (depCondition as any).$exists;
                const doesExist = depValue !== undefined && depValue !== null && depValue !== '';

                // If condition says field should NOT exist but it DOES exist, return false (don't hide)
                // If condition says field should exist but it DOESN'T exist, return true (hide)
                const conditionMet = shouldExist ? doesExist : !doesExist;

                if (conditionMet) {
                  logger.debug(`📋 [GoogleSheets] Field "${field.name}" condition met - ${depField} existence check`);
                  return true; // Condition met
                }
              }

              // Check $ne (not equals) condition
              if ('$ne' in depCondition) {
                const expectedValue = (depCondition as any).$ne;
                const conditionMet = depValue !== expectedValue;

                if (conditionMet) {
                  logger.debug(`📋 [GoogleSheets] Field "${field.name}" condition met - ${depField} !== ${expectedValue} (value: ${depValue})`);
                  return true; // Condition met
                }
              }

              // Check $eq (equals) condition
              if ('$eq' in depCondition) {
                const expectedValue = (depCondition as any).$eq;
                const conditionMet = depValue === expectedValue;

                if (conditionMet) {
                  logger.debug(`📋 [GoogleSheets] Field "${field.name}" condition met - ${depField} === ${expectedValue} (value: ${depValue})`);
                  return true; // Condition met
                }
              }
            }
          }
          return false; // No conditions met
        };

        // Handle $or operator - hide if ANY condition is met
        if (condition.$or && Array.isArray(condition.$or)) {
          for (const orCondition of condition.$or) {
            if (evaluateCondition(orCondition)) {
              logger.debug(`📋 [GoogleSheets] Field "${field.name}" hidden - $or condition met`);
              return false; // Hide field when any $or condition is met
            }
          }
          // None of the $or conditions were met, show the field
          logger.debug(`📋 [GoogleSheets] Field "${field.name}" shown - no $or conditions met`);
          return true;
        }

        // Handle single condition (no $or)
        if (evaluateCondition(condition)) {
          logger.debug(`📋 [GoogleSheets] Field "${field.name}" hidden by condition`);
          return false; // Hide field when condition is met
        }

        // If we get here, condition was not met, so show the field
        logger.debug(`📋 [GoogleSheets] Field "${field.name}" shown - hidden condition not met`);
        return true;
      }

      // If field is hidden (boolean true) and no showIf, hide it
      if (field.hidden === true) return false;
      
      // Otherwise show the field
      return true;
    });
  };

  const visibleFields = getVisibleFields();

  // Debug log visible fields for troubleshooting
  logger.debug('📊 [GoogleSheets] visibleFields:', visibleFields.map((f: any) => ({
    name: f.name,
    type: f.type,
    label: f.label
  })));

  // Render fields helper
  const renderFields = (fields: any[]) => {
    return fields.map((field, index) => {
      // Debug log each field being rendered
      logger.debug(`📊 [GoogleSheets] Rendering field: ${field.name} (type: ${field.type})`);

      // Special handling for Google Sheets data preview field
      if (field.type === 'google_sheets_data_preview') {
        // Show for update, delete with column_value or conditions, or add action
        if (values.action === 'update' ||
            (values.action === 'delete' && (values.deleteRowBy === 'column_value' || values.deleteRowBy === 'conditions')) ||
            (values.action === 'add' && values.rowPosition)) {
          return (
            <GoogleSheetsDataPreview
              key={`field-${field.name}-${index}`}
              values={values}
              previewData={previewData}
              showPreviewData={showPreviewData}
              loadingPreview={loadingPreview}
              tableSearchQuery={tableSearchQuery}
              tableDisplayCount={tableDisplayCount}
              googleSheetsSortField={googleSheetsSortField}
              googleSheetsSortDirection={googleSheetsSortDirection}
              googleSheetsSelectedRows={googleSheetsSelectedRows}
              googleSheetsHasHeaders={googleSheetsHasHeaders}
              fieldKey={`field-${field.name}-${index}`}
              onTogglePreview={() => {
                setShowPreviewData(false);
                setPreviewData([]);
                setTableSearchQuery('');
                setGoogleSheetsSelectedRows(new Set());
              }}
              onLoadPreviewData={loadGoogleSheetsPreviewData}
              onSearchChange={setTableSearchQuery}
              onDisplayCountChange={setTableDisplayCount}
              onSortFieldChange={setGoogleSheetsSortField}
              onSortDirectionChange={setGoogleSheetsSortDirection}
              onRowSelect={handleRowSelect}
              onSelectAll={handleSelectAll}
              onHasHeadersChange={setGoogleSheetsHasHeaders}
              onRowClick={handleRowClick}
            />
          );
        }
        return null;
      }

      // Special handling for Add Row Preview field
      if (field.type === 'google_sheets_add_row_preview') {
        return (
          <GoogleSheetsAddRowPreview
            key={`field-${field.name}-${index}`}
            values={values}
            previewData={previewData}
            showPreviewData={showPreviewData}
            loadingPreview={loadingPreview}
            fieldKey={`field-${field.name}-${index}`}
            onTogglePreview={() => {
              setShowPreviewData(false);
              setPreviewData([]);
            }}
            onLoadPreviewData={loadGoogleSheetsPreviewData}
            onSelectInsertPosition={(position, rowNumber) => {
              setValue('insertPosition', position);
              if (rowNumber) {
                setValue('rowNumber', rowNumber);
              }
            }}
          />
        );
      }

      // Special handling for Range Preview field (Clear Range action)
      if (field.type === 'google_sheets_range_preview') {
        return (
          <GoogleSheetsRangePreview
            key={`field-${field.name}-${index}`}
            values={values}
            previewData={previewData}
            showPreviewData={showPreviewData}
            loadingPreview={loadingPreview}
            fieldKey={`field-${field.name}-${index}`}
            onTogglePreview={() => {
              setShowPreviewData(false);
              setPreviewData([]);
            }}
            onLoadPreviewData={loadGoogleSheetsPreviewData}
            setValue={setValue}
          />
        );
      }

      // Special handling for Row Preview field (Clear specific row)
      if (field.type === 'google_sheets_row_preview') {
        return (
          <GoogleSheetsRowPreview
            key={`field-${field.name}-${index}`}
            values={values}
            previewData={previewData}
            showPreviewData={showPreviewData}
            loadingPreview={loadingPreview}
            fieldKey={`field-${field.name}-${index}`}
            onTogglePreview={() => {
              setShowPreviewData(false);
              setPreviewData([]);
            }}
            onLoadPreviewData={loadGoogleSheetsPreviewData}
            setValue={setValue}
          />
        );
      }

      // Special handling for Find Row Preview field
      if (field.type === 'google_sheets_find_row_preview') {
        return (
          <GoogleSheetsFindRowPreview
            key={`field-${field.name}-${index}`}
            values={values}
            fieldKey={`field-${field.name}-${index}`}
          />
        );
      }

      // Special handling for Update Row Preview field
      if (field.type === 'google_sheets_update_row_preview') {
        return (
          <GoogleSheetsUpdateRowPreview
            key={`field-${field.name}-${index}`}
            values={values}
            previewData={previewData}
            showPreviewData={showPreviewData}
            loadingPreview={loadingPreview}
            fieldKey={`field-${field.name}-${index}`}
            onTogglePreview={() => {
              setShowPreviewData(false);
              setPreviewData([]);
            }}
            onLoadPreviewData={loadGoogleSheetsPreviewData}
            setValue={setValueWithColumnTracking}
          />
        );
      }

      // Special handling for Update Row Fields
      if (field.type === 'google_sheets_update_row_fields') {
        return (
          <GoogleSheetsUpdateRowFields
            key={`field-${field.name}-${index}`}
            values={values}
            setValue={setValueWithColumnTracking}
            previewData={previewData}
            hasHeaders={googleSheetsHasHeaders}
            action="update"
            showPreviewData={showPreviewData}
            loadingPreview={loadingPreview}
            workflowData={workflowData}
            currentNodeId={currentNodeId}
          />
        );
      }

      // Special handling for Add Row Fields
      if (field.type === 'google_sheets_add_row_fields') {
        return (
          <GoogleSheetsAddRowFields
            key={`field-${field.name}-${index}`}
            values={values}
            setValue={setValueWithColumnTracking}
            previewData={previewData}
            hasHeaders={googleSheetsHasHeaders}
            action="add"
            showPreviewData={showPreviewData}
            loadingPreview={loadingPreview}
            insertPosition={values.insertPosition}
            rowNumber={values.rowNumber}
            workflowData={workflowData}
            currentNodeId={currentNodeId}
          />
        );
      }

      // Add the update fields section right after the data preview for Google Sheets
      if (field.type === 'google_sheets_update_fields' && values.action === 'update') {
        return (
          <GoogleSheetsUpdateFields
            key={`update-fields-${index}`}
            values={values}
            setValue={setValueWithColumnTracking}
            selectedRows={googleSheetsSelectedRows}
            previewData={previewData}
            hasHeaders={googleSheetsHasHeaders}
            action={values.action}
          />
        );
      }

      return (
        <React.Fragment key={`field-${field.name}-${index}`}>
          <FieldRenderer
            field={field}
            value={values[field.name]}
            onChange={(value) => {
              setValue(field.name, value);

              // When deleteRowBy is set, ensure action is set to delete
              if (field.name === 'deleteRowBy' && value) {
                setValue('action', 'delete');
              }
            }}
            error={errors[field.name] || validationErrors[field.name]}
            workflowData={workflowData}
            currentNodeId={currentNodeId}
            dynamicOptions={dynamicOptions}
            loadingDynamic={loadingDynamic}
            loadingFields={loadingFields}
            nodeInfo={nodeInfo}
            onDynamicLoad={handleDynamicLoad}
            parentValues={values}
          />
        </React.Fragment>
      );
    });
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    logger.debug('🎯 [GoogleSheets] Form submission started');
    logger.debug('🎯 [GoogleSheets] Current form values:', values);
    logger.debug('🎯 [GoogleSheets] All form value keys:', Object.keys(values));
    logger.debug('🎯 [GoogleSheets] Action:', values.action);
    logger.debug('🎯 [GoogleSheets] Selected rows:', googleSheetsSelectedRows);
    
    // Validate only visible required fields
    const requiredFields = visibleFields.filter(f => f.required);
    const errors: Record<string, string> = {};
    
    requiredFields.forEach(field => {
      if (!values[field.name]) {
        errors[field.name] = `${field.label || field.name} is required`;
      }
    });
    
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    // Additional validation for Update Row visual mode
    if (nodeInfo?.type === 'google_sheets_action_update_row' && values.updateMode === 'visual') {
      // Check if a row has been selected (rowNumber should be set by table selection)
      if (!values.rowNumber) {
        setValidationErrors({ updateRowPreview: 'Please select a row from the table to update' });
        return;
      }
    }

    // Additional validation for Update Row with specific row selection
    if (nodeInfo?.type === 'google_sheets_action_update_row' && values.rowSelection === 'specific') {
      if (!values.rowNumber) {
        setValidationErrors({ rowNumber: 'Row number is required when using specific row selection' });
        return;
      }
    }

    // Additional validation for Delete Row with specific row selection
    if (nodeInfo?.type === 'google_sheets_action_delete_row' && values.rowSelection === 'specific') {
      if (!values.rowNumber) {
        setValidationErrors({ rowNumber: 'Row number is required when using specific row selection' });
        return;
      }
    }

    // Show confirmation dialog for delete action
    if (values.action === 'delete') {
      setShowDeleteConfirmation(true);
      return;
    }
    
    // Prepare values for submission
    const submissionValues = { ...values };

    // For update action, convert column_ fields to updateMapping
    // Check both the old action-based flow and the new dedicated Update Row action type
    const isUpdateAction = values.action === 'update' || nodeInfo?.type === 'google_sheets_action_update_row';

    if (isUpdateAction) {
      logger.debug('🔄 Processing update action with values:', values);
      logger.debug('🔄 All value keys:', Object.keys(values));
      logger.debug('🔄 Column fields from values:', Object.keys(values).filter(k => k.startsWith('column_')));
      logger.debug('🔄 Tracked column values:', columnUpdateValues);
      
      const updateMapping: Record<string, any> = {};
      
      // Use the tracked column values which should have all the updates
      const allColumnValues = { ...columnUpdateValues };
      
      // Also check the main values for any column_ fields
      Object.keys(values).forEach(key => {
        if (key.startsWith('column_')) {
          allColumnValues[key] = values[key];
        }
      });
      
      logger.debug('🔄 Combined column values:', allColumnValues);
      
      // Process all column fields
      Object.keys(allColumnValues).forEach(key => {
        if (key.startsWith('column_')) {
          const columnName = key.replace('column_', '');
          const value = allColumnValues[key];
          logger.debug(`  - Processing ${key}: "${value}" (type: ${typeof value})`);
          // Only include fields that have been modified (not empty)
          if (value !== undefined && value !== '') {
            updateMapping[columnName] = value;
            logger.debug(`    ✓ Added to updateMapping: ${columnName} = "${value}"`);
          } else {
            logger.debug(`    ✗ Skipped (empty or undefined)`);
          }
        }
      });
      
      logger.debug('🔄 Final updateMapping:', updateMapping);

      // Only add updateMapping if we have column updates from the UI
      // If user is using the automation mode (values field), don't add empty updateMapping
      if (Object.keys(updateMapping).length > 0) {
        submissionValues.updateMapping = updateMapping;
      }

      // For the dedicated Update Row action, set findRowBy based on whether we have a rowNumber
      if (nodeInfo?.type === 'google_sheets_action_update_row' && submissionValues.rowNumber) {
        submissionValues.findRowBy = 'row_number';
      }

      // Clean up column_ fields from submission
      Object.keys(submissionValues).forEach(key => {
        if (key.startsWith('column_')) {
          delete submissionValues[key];
        }
      });

      // Clean up UI-only fields (not needed by backend)
      delete submissionValues.updateMode;
      delete submissionValues.updateRowPreview;

      logger.debug('🔄 Final update submission values:', {
        updateMapping: submissionValues.updateMapping,
        rowNumber: submissionValues.rowNumber,
        values: submissionValues.values,
        findRowBy: submissionValues.findRowBy
      });
    }
    
    // For add action, convert newRow_ fields to columnMapping
    if (values.action === 'add') {
      logger.debug('➕ Processing add action with values:', values);
      logger.debug('➕ All value keys:', Object.keys(values));
      logger.debug('➕ NewRow fields from values:', Object.keys(values).filter(k => k.startsWith('newRow_')));
      
      const columnMapping: Record<string, any> = {};
      
      // Process all newRow_ fields
      Object.keys(values).forEach(key => {
        if (key.startsWith('newRow_')) {
          const columnName = key.replace('newRow_', '');
          const value = values[key];
          logger.debug(`  - Processing ${key}: "${value}" (type: ${typeof value})`);
          // Include all fields (even empty ones might be intentional)
          columnMapping[columnName] = value || '';
          logger.debug(`    ✓ Added to columnMapping: ${columnName} = "${value}"`);
        }
      });
      
      logger.debug('➕ Final columnMapping:', columnMapping);
      
      // Add columnMapping to submission values
      submissionValues.columnMapping = columnMapping;
      
      // Clean up newRow_ fields from submission
      Object.keys(submissionValues).forEach(key => {
        if (key.startsWith('newRow_')) {
          delete submissionValues[key];
        }
      });
      
      logger.debug('➕ Submitting add with full config:', {
        columnMapping,
        rowPosition: submissionValues.rowPosition,
        rowNumber: submissionValues.rowNumber,
        spreadsheetId: submissionValues.spreadsheetId,
        sheetName: submissionValues.sheetName,
        action: submissionValues.action
      });
      
      // Set row number if a row is selected
      if (googleSheetsSelectedRows.size === 1) {
        const selectedRowId = Array.from(googleSheetsSelectedRows)[0];
        const selectedRow = previewData.find((row: any) => row.id === selectedRowId);
        if (selectedRow) {
          // Set BOTH field names to ensure compatibility
          submissionValues.rowNumber = selectedRow.rowNumber;
          submissionValues.updateRowNumber = selectedRow.rowNumber; // Also set this for compatibility
          submissionValues.findRowBy = 'row_number';
          logger.debug('📊 Selected row for update:', {
            rowId: selectedRowId,
            rowNumber: selectedRow.rowNumber,
            rowData: selectedRow
          });
        }
      }
      
      // Clean up column_ fields from submission
      Object.keys(submissionValues).forEach(key => {
        if (key.startsWith('column_')) {
          delete submissionValues[key];
        }
      });
      
      logger.debug('📊 Final submission values after cleanup:', {
        columnMapping: submissionValues.columnMapping,
        rowNumber: submissionValues.rowNumber,
        findRowBy: submissionValues.findRowBy,
        spreadsheetId: submissionValues.spreadsheetId,
        sheetName: submissionValues.sheetName,
        action: submissionValues.action
      });
    }
    
    await onSubmit(submissionValues);
  };
  
  const handleConfirmDelete = async () => {
    setShowDeleteConfirmation(false);
    // Set confirmDelete to true when the user confirms the deletion
    const confirmedValues = {
      ...values,
      confirmDelete: true
    };
    
    // Map UI field names to backend field names for delete action
    if (values.deleteSearchColumn) {
      confirmedValues.deleteColumn = values.deleteSearchColumn;
    }
    if (values.deleteSearchValue) {
      confirmedValues.deleteValue = values.deleteSearchValue;
    }
    // Ensure deleteRowBy is set
    if (!confirmedValues.deleteRowBy && (values.deleteSearchColumn || values.deleteRowNumber)) {
      confirmedValues.deleteRowBy = values.deleteRowNumber ? 'row_number' : 'column_value';
    }
    
    logger.debug('🗑️ [GoogleSheets] Delete confirmation - mapped values:', {
      deleteRowBy: confirmedValues.deleteRowBy,
      deleteColumn: confirmedValues.deleteColumn,
      deleteValue: confirmedValues.deleteValue,
      deleteRowNumber: confirmedValues.deleteRowNumber,
      deleteAll: confirmedValues.deleteAll,
      confirmDelete: confirmedValues.confirmDelete,
      action: confirmedValues.action
    });
    
    await onSubmit(confirmedValues);
  };

  // Show connection required state
  if (needsConnection) {
    // Get properly capitalized provider name
    const displayName = getProviderDisplayName(nodeInfo?.providerId || 'google-sheets');

    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertTriangle className="h-12 w-12 text-yellow-500 mb-4" />
        <h3 className="text-lg font-semibold mb-2">{displayName} Connection Required</h3>
        <p className="text-sm text-slate-600">
          Please connect your {displayName} account to use this action.
        </p>
      </div>
    );
  }

  return (
    <ConfigurationContainer
      onSubmit={handleSubmit}
      onCancel={onCancel}
      onBack={onBack}
      isEditMode={isEditMode}
    >
      {renderFields(visibleFields)}
            {/* Add update fields section after table preview */}
            {showPreviewData && values.action === 'update' && googleSheetsSelectedRows.size > 0 && (
              <GoogleSheetsUpdateFields
                values={values}
                setValue={setValueWithColumnTracking}
                selectedRows={googleSheetsSelectedRows}
                previewData={previewData}
                hasHeaders={googleSheetsHasHeaders}
                action={values.action}
              />
            )}
            
            {/* Add delete confirmation section after table preview */}
            {values.action === 'delete' && (
              <GoogleSheetsDeleteConfirmation
                values={values}
                setValue={setValue}
                selectedRows={googleSheetsSelectedRows}
                previewData={previewData}
                hasHeaders={googleSheetsHasHeaders}
                action={values.action}
              />
            )}
            
            {/* Add new row fields section after table preview */}
            {values.action === 'add' && (values.rowPosition || values.spreadsheetId && values.sheetName) && (
              <GoogleSheetsAddRowFields
                values={values}
                setValue={setValueWithColumnTracking}
                previewData={previewData}
                hasHeaders={googleSheetsHasHeaders}
                action={values.action}
                showPreviewData={showPreviewData}
                loadingPreview={loadingPreview}
                workflowData={workflowData}
                currentNodeId={currentNodeId}
              />
            )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirmation} onOpenChange={setShowDeleteConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ Confirm Delete Action</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <div>
                  This action will permanently delete rows from your Google Sheet. This cannot be undone.
                </div>
                {values.deleteRowBy === 'row_number' && values.deleteRowNumber && (
                  <div className="font-medium">
                    • Row {values.deleteRowNumber} will be deleted
                  </div>
                )}
                {values.deleteRowBy === 'column_value' && values.deleteSearchValue && (
                  <div>
                    <div className="font-medium">Delete criteria:</div>
                    <ul className="ml-4 mt-1 space-y-1 text-sm">
                      <li>• Column: {values.deleteSearchColumn}</li>
                      <li>• Value: {values.deleteSearchValue}</li>
                      <li>• Mode: {values.deleteAll ? 'Delete ALL matching rows' : 'Delete FIRST matching row'}</li>
                    </ul>
                  </div>
                )}
                {googleSheetsSelectedRows.size > 0 && (
                  <div className="font-medium text-amber-600">
                    • {googleSheetsSelectedRows.size} manually selected row{googleSheetsSelectedRows.size !== 1 ? 's' : ''} will also be deleted
                  </div>
                )}
                <div className="text-red-600 font-semibold mt-3">
                  Are you sure you want to proceed?
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-red-600 hover:bg-red-700">
              Yes, Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfigurationContainer>
  );
}