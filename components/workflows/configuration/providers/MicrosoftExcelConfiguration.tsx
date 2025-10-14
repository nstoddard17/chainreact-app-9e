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
  const [microsoftExcelHasHeaders, setMicrosoftExcelHasHeaders] = useState(true);

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
      // Get the Microsoft Excel integration (which uses OneDrive)
      const { getIntegrationByProvider } = useIntegrationStore.getState();
      const excelIntegration = getIntegrationByProvider('microsoft-excel') || getIntegrationByProvider('onedrive');

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

    // Basic validation
    if (!values.workbookId) validationErrors.workbookId = 'Workbook is required';
    if (!values.worksheetName) validationErrors.worksheetName = 'Worksheet is required';
    if (!values.action) validationErrors.action = 'Action is required';

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

    // Add new row values for add action
    if (values.action === 'add') {
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
  const getVisibleFields = () => {
    if (!nodeInfo?.configSchema) return [];

    return nodeInfo.configSchema.filter((field: any) => {
      // Skip advanced fields and hidden type fields
      if (field.advanced || field.type === 'hidden') return false;

      // Check if field depends on another field
      if (field.dependsOn) {
        const dependencyValue = values[field.dependsOn];
        if (!dependencyValue) {
          return false; // Hide field if dependency has no value
        }
      }

      // Check if field should be shown based on showIf condition
      if (field.showIf && typeof field.showIf === 'function') {
        return field.showIf(values);
      }

      // If field is marked as hidden but has showIf, evaluate showIf
      if (field.hidden && field.showIf) {
        if (typeof field.showIf === 'function') {
          return field.showIf(values);
        }
      }

      // If field is hidden and no showIf, hide it
      if (field.hidden) return false;

      // Otherwise show the field
      return true;
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
          if (['dataPreview', 'columnMapping'].includes(field.name)) {
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
              loadOptions={(forceReload?: boolean) => {
                const dependsOn = field.dependsOn;
                const parentValue = dependsOn ? values[dependsOn] : undefined;
                return loadOptions(field.name, dependsOn, parentValue, forceReload);
              }}
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

        {/* Add Row Fields */}
        <MicrosoftExcelAddRowFields
          values={values}
          setValue={setValueWithColumnTracking}
          previewData={previewData}
          hasHeaders={microsoftExcelHasHeaders}
          action={values.action}
          showPreviewData={showPreviewData}
          loadingPreview={loadingPreview}
        />

        {/* Update Row Fields - shown inline below preview */}
        {values.action === 'update' && selectedRow && (
          <MicrosoftExcelUpdateFields
            values={values}
            setValue={setValueWithColumnTracking}
            previewData={previewData}
            hasHeaders={microsoftExcelHasHeaders}
            action={values.action}
            selectedRow={selectedRow}
          />
        )}

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