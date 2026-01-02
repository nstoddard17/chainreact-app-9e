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
import { FieldVisibilityEngine } from '@/lib/workflows/fields/visibility';
import { MicrosoftExcelDataPreview } from '../components/microsoft-excel/MicrosoftExcelDataPreview';
import { MicrosoftExcelUpdateFields } from '../components/microsoft-excel/MicrosoftExcelUpdateFields';
import { MicrosoftExcelDeleteConfirmation } from '../components/microsoft-excel/MicrosoftExcelDeleteConfirmation';
import { MicrosoftExcelAddRowFields } from '../components/microsoft-excel/MicrosoftExcelAddRowFields';

import { logger } from '@/lib/utils/logger'

interface MicrosoftExcelConfigurationProps {
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

export function MicrosoftExcelConfiguration({
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
}: MicrosoftExcelConfigurationProps) {
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [loadingFields, setLoadingFields] = useState<Set<string>>(new Set());
  const [showPreviewData, setShowPreviewData] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [tableSearchQuery, setTableSearchQuery] = useState('');
  const [tableDisplayCount, setTableDisplayCount] = useState(25);
  const [microsoftExcelSortField, setMicrosoftExcelSortField] = useState<string | null>(null);
  const [microsoftExcelSortDirection, setMicrosoftExcelSortDirection] = useState<'asc' | 'desc'>('asc');
  const [microsoftExcelSelectedRows, setMicrosoftExcelSelectedRows] = useState<Set<string>>(new Set());
  const [microsoftExcelHasHeaders, setMicrosoftExcelHasHeaders] = useState(
    values.hasHeaders !== undefined ? values.hasHeaders : true
  );

  // Track column update values separately to ensure they're captured
  const [columnUpdateValues, setColumnUpdateValues] = useState<Record<string, any>>({});

  // Track the column order from the Excel sheet
  const [columnOrder, setColumnOrder] = useState<string[]>([]);

  // Wrap setValue to capture column_ and newRow_ fields
  const setValueWithColumnTracking = React.useCallback((key: string, value: any) => {
    logger.debug(`🔧 [Excel] Setting value: ${key} = ${value}`);

    // Always set in the main values
    setValue(key, value);

    // Also track column_ fields separately for update action
    if (key.startsWith('column_')) {
      setColumnUpdateValues(prev => ({
        ...prev,
        [key]: value
      }));
      logger.debug(`🔧 [Excel] Tracked column field: ${key} = ${value}`);
    }

    // For newRow_ fields, just ensure they're set in main values (no separate tracking needed)
    if (key.startsWith('newRow_')) {
      logger.debug(`🔧 [Excel] Set newRow field: ${key} = ${value}`);
    }
  }, [setValue]);

  // Track which row is selected for update (no modal needed - show inline like Google Sheets)
  const [selectedRow, setSelectedRow] = useState<any | null>(null);

  // Handle row click for update action
  const handleRowClick = useCallback((row: any) => {
    if (values.action === 'update') {
      setSelectedRow(row);
      setValueWithColumnTracking('updateRowNumber', row.rowNumber || row.id);

      // Pre-populate column values with current row data
      if (row.fields) {
        Object.entries(row.fields).forEach(([key, value]) => {
          if (!key.startsWith('_')) {
            setValueWithColumnTracking(`column_${key}`, value);
          }
        });
      }
    }
  }, [values.action, setValueWithColumnTracking]);

  // Load preview data function
  const loadPreviewData = useCallback(async (workbookId: string, worksheetName: string, hasHeaders: boolean) => {
    if (!workbookId || !worksheetName) {
      return;
    }

    setLoadingPreview(true);
    try {
      // Get the Microsoft Excel integration
      const { getIntegrationByProvider } = useIntegrationStore.getState();
      const excelIntegration = getIntegrationByProvider('microsoft-excel');

      if (!excelIntegration) {
        logger.error('Microsoft Excel/OneDrive integration not found');
        setPreviewData([]);
        setLoadingPreview(false);
        return;
      }

      const response = await fetch('/api/integrations/microsoft-excel/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId: excelIntegration.id,
          dataType: 'data_preview',
          options: {
            workbookId,
            worksheetName,
            hasHeaders
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        logger.error('Failed to fetch Excel data preview:', errorData);
        setPreviewData([]);
        setLoadingPreview(false);
        return;
      }

      const result = await response.json();
      const data = result.data;

      if (data) {
        setPreviewData(data);

        // For add action, automatically create fields for each column
        if (values.action === 'add' && hasHeaders) {
          const columns = data[0]?.fields ? Object.keys(data[0].fields).filter(key => !key.startsWith('_')) : [];

          // Store the column order
          setColumnOrder(columns);
          logger.debug('📊 [Excel] Stored column order:', columns);

          columns.forEach(col => {
            if (!values[`newRow_${col}`]) {
              setValueWithColumnTracking(`newRow_${col}`, '');
            }
          });
        }

        // For update action, restore the selected row if updateRowNumber exists
        if (values.action === 'update' && values.updateRowNumber && !selectedRow) {
          const rowToSelect = data.find((row: any) => row.rowNumber === values.updateRowNumber);
          if (rowToSelect) {
            setSelectedRow(rowToSelect);
            logger.debug('📊 [Excel] Restored selected row:', rowToSelect);
          }
        }
      }
    } catch (error) {
      logger.error('Failed to load worksheet data:', error);
    } finally {
      setLoadingPreview(false);
    }
  }, [values.action, setValueWithColumnTracking]);

  // Load preview data when worksheet changes
  React.useEffect(() => {
    if (values.worksheetName && values.action && ['add', 'update', 'delete'].includes(values.action)) {
      // Automatically load preview for these actions
      if (!showPreviewData && values.workbookId && values.worksheetName) {
        setShowPreviewData(true);
        loadPreviewData(values.workbookId, values.worksheetName, microsoftExcelHasHeaders);
      }
    }
  }, [values.worksheetName, values.action, values.workbookId, microsoftExcelHasHeaders, showPreviewData, loadPreviewData]);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    logger.debug('🔧 [Excel] handleSubmit called with values:', values);

    // Validate required fields
    const validationErrors: Record<string, string> = {};

    // Check if this is a dedicated action type (doesn't use unified "action" field)
    const isDedicatedAction = nodeInfo?.type?.startsWith('microsoft_excel_action_');
    const isAddTableRowAction = nodeInfo?.type === 'microsoft_excel_action_add_table_row';
    const isDedicatedAddRowAction = nodeInfo?.type === 'microsoft_excel_action_add_row';

    // Basic validation
    if (!values.workbookId) validationErrors.workbookId = 'Workbook is required';

    // For add_table_row action, validate tableName instead of worksheetName
    if (isAddTableRowAction) {
      if (!values.tableName) validationErrors.tableName = 'Table is required';
    } else if (isDedicatedAddRowAction) {
      // For worksheet-based add_row action, require worksheetName
      if (!values.worksheetName) validationErrors.worksheetName = 'Worksheet is required';
    } else if (!isDedicatedAction) {
      // For unified action, require worksheetName and action
      if (!values.worksheetName) validationErrors.worksheetName = 'Worksheet is required';
      if (!values.action) validationErrors.action = 'Action is required';
    }

    // Action-specific validation
    if (values.action === 'update' && !values.updateRowNumber) {
      validationErrors.updateRowNumber = 'Please select a row to update';
    }

    if (values.action === 'delete') {
      if (!values.deleteRowBy) validationErrors.deleteRowBy = 'Please select how to find the row';
      if (values.deleteRowBy === 'row_number' && !values.deleteRowNumber) {
        validationErrors.deleteRowNumber = 'Row number is required';
      }
      // column_value fields are handled in the confirmation modal, so don't validate them here
      if (values.deleteRowBy === 'range' && (!values.startRow || !values.endRow)) {
        validationErrors.startRow = 'Start and end row are required';
      }
    }

    if (Object.keys(validationErrors).length > 0) {
      setValidationErrors(validationErrors);
      return;
    }

    // Clear validation errors if everything is valid
    setValidationErrors({});

    // Show confirmation dialog for delete action
    if (values.action === 'delete') {
      setShowDeleteConfirmation(true);
      return;
    }

    // Prepare final values
    const finalValues = { ...values };

    // Add column update values for update action
    if (values.action === 'update') {
      const updateMapping: Record<string, any> = {};

      // Convert column_ fields to updateMapping and preserve them in finalValues
      Object.entries(columnUpdateValues).forEach(([key, value]) => {
        if (key.startsWith('column_') && value !== undefined && value !== '') {
          const columnName = key.replace('column_', '');
          updateMapping[columnName] = value;
          // Also preserve the column_ field itself for form display
          finalValues[key] = value;
        }
      });

      // Also check main values for any column_ fields
      Object.entries(values).forEach(([key, value]) => {
        if (key.startsWith('column_') && value !== undefined && value !== '') {
          const columnName = key.replace('column_', '');
          updateMapping[columnName] = value;
          // Preserve the column_ field for form display
          finalValues[key] = value;
        }
      });

      finalValues.updateMapping = updateMapping;

      // Map updateRowNumber to rowNumber if it exists, and preserve it
      if (values.updateRowNumber) {
        finalValues.rowNumber = values.updateRowNumber;
        finalValues.updateRowNumber = values.updateRowNumber; // Keep both for compatibility
      }

      logger.debug('🔧 [Excel] Prepared update mapping:', { updateMapping, rowNumber: finalValues.rowNumber, columnFields: Object.keys(finalValues).filter(k => k.startsWith('column_')) });
    }

    // Add new row values for add action (both unified and dedicated action types)
    const isAddRowAction = values.action === 'add' ||
                           nodeInfo?.type === 'microsoft_excel_action_add_table_row' ||
                           nodeInfo?.type === 'microsoft_excel_action_add_row';
    if (isAddRowAction) {
      const newRowValues: Record<string, any> = {};

      // Use the stored column order to preserve the Excel column sequence
      if (columnOrder.length > 0) {
        columnOrder.forEach(columnName => {
          const fieldKey = `newRow_${columnName}`;
          const value = values[fieldKey];
          newRowValues[columnName] = value !== undefined ? value : '';
        });
        logger.debug('🔧 [Excel] Prepared column mapping in order:', { columnOrder, newRowValues });
      } else {
        // Fallback: iterate over values (may not preserve order)
        Object.entries(values).forEach(([key, value]) => {
          if (key.startsWith('newRow_') && value !== undefined && value !== '') {
            const columnName = key.replace('newRow_', '');
            newRowValues[columnName] = value;
          }
        });
        logger.debug('🔧 [Excel] Prepared column mapping (unordered fallback):', newRowValues);
      }

      finalValues.columnMapping = newRowValues;
    }

    logger.debug('🔧 [Excel] Final values to submit:', finalValues);
    await onSubmit(finalValues);
  }, [values, columnUpdateValues, onSubmit, columnOrder]);

  const handleConfirmDelete = useCallback(async () => {
    setShowDeleteConfirmation(false);

    // Map UI field names to handler field names and set confirmDelete
    const confirmedValues = {
      ...values,
      confirmDelete: true,
      // Map deleteRowBy → deleteBy
      deleteBy: values.deleteRowBy,
      // Map deleteSearchColumn → matchColumn
      matchColumn: values.deleteSearchColumn,
      // Map deleteSearchValue → matchValue
      matchValue: values.deleteSearchValue,
      // Map deleteRowNumber → rowNumber
      rowNumber: values.deleteRowNumber
    };

    logger.debug('🗑️ [Excel] Delete confirmation - mapped values:', {
      deleteBy: confirmedValues.deleteBy,
      rowNumber: confirmedValues.rowNumber,
      startRow: confirmedValues.startRow,
      endRow: confirmedValues.endRow,
      matchColumn: confirmedValues.matchColumn,
      matchValue: confirmedValues.matchValue,
      deleteAll: confirmedValues.deleteAll,
      confirmDelete: confirmedValues.confirmDelete
    });

    await onSubmit(confirmedValues);
  }, [values, onSubmit]);

  // Get visible fields based on current state
  // Uses centralized FieldVisibilityEngine to properly evaluate $deps/$condition visibility rules
  const getVisibleFields = () => {
    if (!nodeInfo?.configSchema) return [];

    return nodeInfo.configSchema.filter((field: any) => {
      // Skip advanced fields and hidden type fields
      if (field.advanced || field.type === 'hidden') return false;

      // Use FieldVisibilityEngine to properly evaluate visibility including $deps and $condition
      return FieldVisibilityEngine.isFieldVisible(field, values, nodeInfo);
    });
  };

  const visibleFields = getVisibleFields();

  return (
    <ConfigurationContainer
      onSubmit={handleSubmit}
      onCancel={onCancel}
      onBack={onBack}
      isEditMode={isEditMode}
    >
      <div className="space-y-6">
        {/* Connection warning if needed */}
        {needsConnection && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-yellow-800">
                  <span className="font-medium">{integrationName}</span> is not connected.
                </p>
                <p className="text-xs text-yellow-700 mt-1">
                  Connect your account to use this action.
                </p>
                <Button
                  size="sm"
                  variant="default"
                  onClick={onConnectIntegration}
                  className="mt-3"
                >
                  Connect {integrationName}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Regular fields */}
        {visibleFields.map((field: any) => {
          // Skip special fields that we handle separately
          // For add_row action, we want to render hasHeaders and columnMapping via FieldRenderer
          const isAddRowAction = nodeInfo?.type === 'microsoft_excel_action_add_row';
          const skipFields = isAddRowAction
            ? ['dataPreview', 'updateMapping']
            : ['dataPreview', 'columnMapping', 'updateMapping', 'hasHeaders'];

          if (skipFields.includes(field.name)) {
            return null;
          }

          return (
            <FieldRenderer
              key={field.name}
              field={field}
              value={values[field.name]}
              onChange={(value) => setValueWithColumnTracking(field.name, value)}
              error={validationErrors[field.name] || errors[field.name]}
              dynamicOptions={dynamicOptions}
              loadingDynamic={loadingDynamic || loadingFields.has(field.name)}
              workflowData={workflowData}
              currentNodeId={currentNodeId}
              values={values}
              parentValues={values}
              onDynamicLoad={(fieldName: string, dependsOn?: string, dependsOnValue?: any, forceRefresh?: boolean) => {
                return loadOptions(fieldName, dependsOn, dependsOnValue, forceRefresh);
              }}
              loadingFields={loadingFields}
              integrationId="microsoft-excel"
              nodeInfo={nodeInfo}
              isAIEnabled={aiFields[field.name] || false}
              onAIToggle={(enabled) => {
                setAiFields({
                  ...aiFields,
                  [field.name]: enabled
                });
              }}
            />
          );
        })}

        {/* Data Preview for all actions */}
        {values.worksheetName && values.action && (
          <MicrosoftExcelDataPreview
            values={values}
            previewData={previewData}
            showPreviewData={showPreviewData}
            loadingPreview={loadingPreview}
            tableSearchQuery={tableSearchQuery}
            tableDisplayCount={tableDisplayCount}
            microsoftExcelSortField={microsoftExcelSortField}
            microsoftExcelSortDirection={microsoftExcelSortDirection}
            microsoftExcelSelectedRows={microsoftExcelSelectedRows}
            microsoftExcelHasHeaders={microsoftExcelHasHeaders}
            fieldKey="dataPreview"
            onTogglePreview={() => setShowPreviewData(!showPreviewData)}
            onLoadPreviewData={loadPreviewData}
            onSearchChange={setTableSearchQuery}
            onDisplayCountChange={setTableDisplayCount}
            onSortFieldChange={setMicrosoftExcelSortField}
            onSortDirectionChange={setMicrosoftExcelSortDirection}
            onRowSelect={(rowId, selected) => {
              const newSelection = new Set(microsoftExcelSelectedRows);
              if (selected) {
                newSelection.add(rowId);
              } else {
                newSelection.delete(rowId);
              }
              setMicrosoftExcelSelectedRows(newSelection);
            }}
            onSelectAll={(selected) => {
              if (selected) {
                setMicrosoftExcelSelectedRows(new Set(previewData.map(r => r.id)));
              } else {
                setMicrosoftExcelSelectedRows(new Set());
              }
            }}
            onHasHeadersChange={setMicrosoftExcelHasHeaders}
            onRowClick={values.action === 'update' ? handleRowClick : undefined}
          />
        )}

        {/* Add Row Fields - only show for legacy add actions, not add_row which uses MicrosoftExcelColumnMapper */}
        {nodeInfo?.type !== 'microsoft_excel_action_add_row' && (
          <MicrosoftExcelAddRowFields
            values={values}
            setValue={setValueWithColumnTracking}
            previewData={previewData}
            hasHeaders={microsoftExcelHasHeaders}
            action={values.action}
            showPreviewData={showPreviewData}
            loadingPreview={loadingPreview}
          />
        )}

        {/* Update Row Fields - shown for update_row action when worksheet is selected */}
        {nodeInfo?.type === 'microsoft_excel_action_update_row' && values.worksheetName && values.workbookId && (() => {
          // Auto-load preview if not already shown
          if (!showPreviewData && !loadingPreview && previewData.length === 0) {
            loadPreviewData(values.workbookId, values.worksheetName, microsoftExcelHasHeaders);
          }

          // Determine if we have enough info to find the row
          const canFindRow =
            (values.findRowBy === 'row_number' && values.rowNumber) ||
            (values.findRowBy === 'column_value' && values.matchColumn && values.matchValue);

          // Find the actual row based on search criteria
          let selectedRow = null;
          if (canFindRow && previewData && previewData.length > 0) {
            if (values.findRowBy === 'row_number') {
              // Find by row number (previewData already has rowNumber property)
              const targetRowNumber = parseInt(values.rowNumber);
              selectedRow = previewData.find(row => row.rowNumber === targetRowNumber);
            } else if (values.findRowBy === 'column_value') {
              // Find by column value match
              selectedRow = previewData.find(row =>
                row.fields[values.matchColumn] === values.matchValue
              );
            }
          }

          return (
            <>
              {/* Has Headers Toggle */}
              <div className="flex items-center gap-3 p-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={microsoftExcelHasHeaders}
                    onChange={(e) => {
                      const newValue = e.target.checked;
                      setMicrosoftExcelHasHeaders(newValue);
                      // Save to form values
                      setValueWithColumnTracking('hasHeaders', newValue);
                      // Reload preview data with new setting
                      if (values.workbookId && values.worksheetName) {
                        loadPreviewData(values.workbookId, values.worksheetName, newValue);
                      }
                    }}
                    className="w-4 h-4 text-blue-600 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 rounded focus:ring-blue-500 focus:ring-2"
                  />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    First row contains headers
                  </span>
                </label>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {microsoftExcelHasHeaders
                    ? "Row 1 is treated as column headers (not data)"
                    : "Row 1 is treated as data (can be updated)"}
                </span>
              </div>

              {/* Only show update fields when we can find the row AND have found it */}
              {canFindRow && selectedRow && selectedRow.fields && (
                <div className="space-y-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                  <div>
                    <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Fields to Update (Row {selectedRow.rowNumber})
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Enter new values for the columns you want to update. Leave empty to keep current values.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {Object.keys(selectedRow.fields)
                      .filter(key => !key.startsWith('_'))
                      .map((columnName) => {
                        const fieldKey = `column_${columnName}`;
                        const currentValue = selectedRow.fields[columnName];

                        return (
                          <div key={columnName} className="space-y-1">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                              {columnName}
                            </label>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                              Current: {String(currentValue) || '(empty)'}
                            </div>
                            <input
                              type="text"
                              value={values[fieldKey] || ''}
                              onChange={(e) => setValueWithColumnTracking(fieldKey, e.target.value)}
                              placeholder="New value (leave empty to keep unchanged)"
                              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                            />
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Show message when search criteria is filled but row not found */}
              {canFindRow && previewData.length > 0 && !selectedRow && (
                <div className="p-4 border border-dashed border-orange-300 dark:border-orange-700 rounded-md bg-orange-50 dark:bg-orange-950/20">
                  <p className="text-sm text-orange-800 dark:text-orange-400">
                    {values.findRowBy === 'row_number'
                      ? `Row ${values.rowNumber} not found in the worksheet.`
                      : `No row found with "${values.matchValue}" in column "${values.matchColumn}".`}
                  </p>
                </div>
              )}

              {/* Show loading state while fetching preview */}
              {loadingPreview && (
                <div className="p-4 border border-dashed rounded-md text-center">
                  <p className="text-sm text-muted-foreground">Loading worksheet columns...</p>
                </div>
              )}
            </>
          );
        })()}

        {/* Delete Configuration (Inline) */}
        <MicrosoftExcelDeleteConfirmation
          values={values}
          setValue={setValueWithColumnTracking}
          previewData={previewData}
          hasHeaders={microsoftExcelHasHeaders}
          action={values.action}
        />

        {/* Validation errors */}
        {Object.keys(validationErrors).length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800 font-medium mb-2">Please fix the following errors:</p>
            <ul className="text-sm text-red-700 list-disc list-inside">
              {Object.entries(validationErrors).map(([field, error]) => (
                <li key={field}>{error}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirmation} onOpenChange={setShowDeleteConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ Confirm Delete Action</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <div>
                  This action will permanently delete rows from your Excel worksheet. This cannot be undone.
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
                {values.deleteRowBy === 'range' && values.startRow && values.endRow && (
                  <div className="font-medium">
                    • Rows {values.startRow} to {values.endRow} will be deleted ({values.endRow - values.startRow + 1} rows)
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