"use client"

import React, { useState, useEffect, useCallback, useRef } from "react";
import { LightningLoader } from '@/components/ui/lightning-loader';
import { Plug, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VariableSelectionDropdown } from '../../fields/shared/VariableSelectionDropdown';
import { useIntegrationStore } from '@/stores/integrationStore';
import { logger } from '@/lib/utils/logger';

interface MicrosoftExcelMultipleRowsFieldsProps {
  values: Record<string, any>;
  setValue: (key: string, value: any) => void;
  workflowData?: { nodes: any[]; edges: any[] };
  currentNodeId?: string;
  integrationId?: string;
}

interface RowData {
  id: string;
  expanded: boolean;
  values: Record<string, string>;
  connectedFields: Set<string>;
}

export function MicrosoftExcelMultipleRowsFields({
  values,
  setValue,
  workflowData,
  currentNodeId,
  integrationId
}: MicrosoftExcelMultipleRowsFieldsProps) {
  // State for fetched columns
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const { getIntegrationByProvider } = useIntegrationStore();

  // State for multiple rows
  const [rows, setRows] = useState<RowData[]>([
    { id: '1', expanded: true, values: {}, connectedFields: new Set() }
  ]);

  // Track the last JSON value we sent to prevent infinite loops
  const lastSentJsonRef = useRef<string>('');

  // Fetch worksheet columns when workbook and worksheet are selected
  const fetchWorksheetColumns = useCallback(async () => {
    if (!values.workbookId || !values.worksheetName) return;

    setLoading(true);
    setFetchError(null);

    try {
      // Get integration - either from prop or store
      let intId = integrationId;
      if (!intId) {
        const integration = getIntegrationByProvider('microsoft-excel');
        intId = integration?.id;
      }

      if (!intId) {
        setFetchError('Microsoft Excel integration not found');
        setLoading(false);
        return;
      }

      // Determine if worksheet has headers based on user selection
      const hasHeaders = values.hasHeaders !== 'no';

      logger.debug('📊 [MicrosoftExcelMultipleRowsFields] Fetching worksheet columns', {
        workbookId: values.workbookId,
        worksheetName: values.worksheetName,
        hasHeaders,
        integrationId: intId
      });

      // Fetch worksheet columns from the API
      const response = await fetch('/api/integrations/microsoft-excel/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId: intId,
          dataType: 'microsoft-excel_columns',
          options: {
            workbookId: values.workbookId,
            worksheetName: values.worksheetName,
            hasHeaders
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch worksheet columns: ${response.status}`);
      }

      const result = await response.json();

      if (result.data && Array.isArray(result.data)) {
        // Extract column names from the response
        const columnNames = result.data.map((col: any) =>
          typeof col === 'string' ? col : col.name || col.value || col.label
        );
        setColumns(columnNames);
        logger.debug('📊 [MicrosoftExcelMultipleRowsFields] Fetch complete', {
          columnCount: columnNames.length,
          columns: columnNames
        });
      }
    } catch (error: any) {
      logger.error('📊 [MicrosoftExcelMultipleRowsFields] Fetch error', { error: error.message });
      setFetchError(error.message);
    } finally {
      setLoading(false);
    }
  }, [values.workbookId, values.worksheetName, values.hasHeaders, integrationId, getIntegrationByProvider]);

  // Trigger fetch when workbook/worksheet/hasHeaders changes
  useEffect(() => {
    if (values.workbookId && values.worksheetName) {
      // Reset columns and rows when worksheet or hasHeaders changes
      setColumns([]);
      setRows([{ id: '1', expanded: true, values: {}, connectedFields: new Set() }]);
      lastSentJsonRef.current = '';
      fetchWorksheetColumns();
    }
  }, [values.workbookId, values.worksheetName, values.hasHeaders, fetchWorksheetColumns]);

  // Update parent values whenever rows change
  useEffect(() => {
    // Skip if we don't have columns yet
    if (columns.length === 0) return;

    // Convert rows to the format expected by the action handler
    const rowsData = rows
      .map(row => {
        const rowObj: Record<string, string> = {};
        columns.forEach(col => {
          if (row.values[col] !== undefined && row.values[col] !== '') {
            rowObj[col] = row.values[col];
          }
        });
        return rowObj;
      })
      .filter(row => Object.keys(row).length > 0);

    // Store as JSON array for the rows field
    // Note: Do NOT change inputMode here - the handler will check for 'rows' field
    // when inputMode is 'simple' and use it if present
    const jsonValue = rowsData.length > 0 ? JSON.stringify(rowsData) : '';

    // Only call setValue if the value actually changed (prevents infinite loop)
    if (jsonValue !== lastSentJsonRef.current) {
      lastSentJsonRef.current = jsonValue;
      if (jsonValue) {
        setValue('rows', jsonValue);
      }
    }
  }, [rows, columns]); // Intentionally exclude setValue to prevent re-triggers

  // Add a new row
  const addRow = () => {
    const newRow: RowData = {
      id: String(Date.now()),
      expanded: true,
      values: {},
      connectedFields: new Set()
    };
    setRows([...rows, newRow]);
  };

  // Remove a row
  const removeRow = (rowId: string) => {
    if (rows.length <= 1) return; // Keep at least one row
    setRows(rows.filter(row => row.id !== rowId));
  };

  // Toggle row expansion
  const toggleRowExpansion = (rowId: string) => {
    setRows(rows.map(row =>
      row.id === rowId ? { ...row, expanded: !row.expanded } : row
    ));
  };

  // Update a field value in a row
  const updateRowValue = (rowId: string, columnName: string, value: string) => {
    setRows(rows.map(row =>
      row.id === rowId
        ? { ...row, values: { ...row.values, [columnName]: value } }
        : row
    ));
  };

  // Toggle connect mode for a field in a row
  const toggleConnectMode = (rowId: string, columnName: string) => {
    setRows(rows.map(row => {
      if (row.id !== rowId) return row;

      const newConnectedFields = new Set(row.connectedFields);
      if (newConnectedFields.has(columnName)) {
        newConnectedFields.delete(columnName);
        // Clear the value when disconnecting
        return {
          ...row,
          connectedFields: newConnectedFields,
          values: { ...row.values, [columnName]: '' }
        };
      } else {
        newConnectedFields.add(columnName);
        return { ...row, connectedFields: newConnectedFields };
      }
    }));
  };

  // Check if a field value is a variable
  const isVariableValue = (val: any) => {
    if (typeof val !== 'string') return false;
    const trimmed = val.trim();
    return trimmed.startsWith('{{') && trimmed.endsWith('}}');
  };

  // Show error if fetch failed
  if (fetchError) {
    return (
      <div className="mt-4">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
          <div className="text-center">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">Failed to load column fields</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fetchError}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={fetchWorksheetColumns}
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state while fetching column data
  if (loading) {
    return (
      <div className="mt-4">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
          <div className="flex flex-col items-center justify-center space-y-4">
            <LightningLoader size="md" color="blue" />
            <div className="text-center">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Loading column fields...</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Analyzing your worksheet "{values.worksheetName}" to create input fields
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Don't show anything if we don't have workbook/worksheet selected yet
  if (!values.workbookId || !values.worksheetName) {
    return null;
  }

  // Don't show anything if we don't have columns yet (and not loading)
  if (columns.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Add Multiple Rows
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Configure values for each row. Click "+ Add Row" to add more rows.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addRow}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Add Row
            </Button>
          </div>

          {/* Rows */}
          <div className="space-y-3">
            {rows.map((row, rowIndex) => (
              <div
                key={row.id}
                className="border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden"
              >
                {/* Row Header */}
                <div
                  className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-700/50 cursor-pointer"
                  onClick={() => toggleRowExpansion(row.id)}
                >
                  <div className="flex items-center gap-2">
                    {row.expanded ? (
                      <ChevronDown className="h-4 w-4 text-slate-500" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-500" />
                    )}
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Row {rowIndex + 1}
                    </span>
                    {!row.expanded && Object.keys(row.values).filter(k => row.values[k]).length > 0 && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        ({Object.keys(row.values).filter(k => row.values[k]).length} fields set)
                      </span>
                    )}
                  </div>
                  {rows.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeRow(row.id);
                      }}
                      className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {/* Row Fields */}
                {row.expanded && (
                  <div className="p-3 space-y-3">
                    {columns.map((columnName) => {
                      const isConnected = row.connectedFields.has(columnName) || isVariableValue(row.values[columnName]);

                      return (
                        <div key={columnName}>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                              {columnName}
                            </label>
                            <Button
                              type="button"
                              variant={isConnected ? "default" : "outline"}
                              size="sm"
                              onClick={() => toggleConnectMode(row.id, columnName)}
                              className="h-6 text-xs gap-1 px-2"
                              title={isConnected ? "Switch to text input" : "Connect variable"}
                            >
                              <Plug className="h-3 w-3" />
                              Connect
                            </Button>
                          </div>

                          {/* Show variable dropdown or text input based on connect mode */}
                          <div>
                            {row.connectedFields.has(columnName) && workflowData && currentNodeId ? (
                              <VariableSelectionDropdown
                                workflowData={workflowData}
                                currentNodeId={currentNodeId}
                                value={row.values[columnName] || ''}
                                onChange={(val) => updateRowValue(row.id, columnName, val)}
                                placeholder="Select a variable..."
                              />
                            ) : (
                              <input
                                type="text"
                                value={row.values[columnName] || ''}
                                onChange={(e) => updateRowValue(row.id, columnName, e.target.value)}
                                placeholder="Enter value..."
                                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm"
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add Row Button at bottom */}
          <div className="flex justify-center pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addRow}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Add Another Row
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
