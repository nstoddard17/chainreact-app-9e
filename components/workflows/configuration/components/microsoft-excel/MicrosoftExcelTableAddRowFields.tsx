"use client"

import React, { useState, useEffect, useCallback } from "react";
import { LightningLoader } from '@/components/ui/lightning-loader';
import { Plug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VariableSelectionDropdown } from '../../fields/shared/VariableSelectionDropdown';
import { useIntegrationStore } from '@/stores/integrationStore';
import { logger } from '@/lib/utils/logger';

interface MicrosoftExcelTableAddRowFieldsProps {
  values: Record<string, any>;
  setValue: (key: string, value: any) => void;
  workflowData?: { nodes: any[]; edges: any[] };
  currentNodeId?: string;
  integrationId?: string;
}

export function MicrosoftExcelTableAddRowFields({
  values,
  setValue,
  workflowData,
  currentNodeId,
  integrationId
}: MicrosoftExcelTableAddRowFieldsProps) {
  // Track which fields are in connect mode (showing variable dropdown instead of input)
  const [connectedFields, setConnectedFields] = useState<Set<string>>(new Set());

  // State for fetched columns
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const { getIntegrationByProvider } = useIntegrationStore();

  // Fetch table columns when workbook and table are selected
  const fetchTableColumns = useCallback(async () => {
    if (!values.workbookId || !values.tableName) return;

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

      logger.debug('📊 [MicrosoftExcelTableAddRowFields] Fetching table columns', {
        workbookId: values.workbookId,
        tableName: values.tableName,
        integrationId: intId
      });

      // Fetch table columns from the API
      const response = await fetch('/api/integrations/microsoft-excel/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId: intId,
          dataType: 'microsoft-excel_table_columns',
          options: {
            workbookId: values.workbookId,
            tableName: values.tableName
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch table columns: ${response.status}`);
      }

      const result = await response.json();

      if (result.data && Array.isArray(result.data)) {
        // Extract column names from the response
        const columnNames = result.data.map((col: any) =>
          typeof col === 'string' ? col : col.name || col.value || col.label
        );
        setColumns(columnNames);
        logger.debug('📊 [MicrosoftExcelTableAddRowFields] Fetch complete', {
          columnCount: columnNames.length,
          columns: columnNames
        });
      }
    } catch (error: any) {
      logger.error('📊 [MicrosoftExcelTableAddRowFields] Fetch error', { error: error.message });
      setFetchError(error.message);
    } finally {
      setLoading(false);
    }
  }, [values.workbookId, values.tableName, integrationId, getIntegrationByProvider]);

  // Trigger fetch when workbook/table changes
  useEffect(() => {
    if (values.workbookId && values.tableName) {
      fetchTableColumns();
    }
  }, [values.workbookId, values.tableName, fetchTableColumns]);

  // Toggle connect mode for a specific field
  const toggleConnectMode = (fieldKey: string) => {
    const isCurrentlyConnected = connectedFields.has(fieldKey);

    setConnectedFields(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fieldKey)) {
        newSet.delete(fieldKey);
      } else {
        newSet.add(fieldKey);
      }
      return newSet;
    });

    // Clear the value when disconnecting
    if (isCurrentlyConnected) {
      setValue(fieldKey, '');
    }
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
              onClick={fetchTableColumns}
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
                Analyzing your table "{values.tableName}" to create input fields for each column
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Don't show anything if we don't have workbook/table selected yet
  if (!values.workbookId || !values.tableName) {
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
          <div>
            <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-3">
              Add New Row to Table
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
              Enter values for each column. Leave blank to skip a column.
            </p>
          </div>

          {/* Display all columns as individual fields */}
          <div className="space-y-3">
            {columns.map((columnName) => {
              const fieldKey = `newRow_${columnName}`;
              const isConnected = connectedFields.has(fieldKey) || isVariableValue(values[fieldKey]);

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
                      onClick={() => toggleConnectMode(fieldKey)}
                      className="h-7 text-xs gap-1.5"
                      title={isConnected ? "Switch to text input" : "Connect variable"}
                    >
                      <Plug className="h-3.5 w-3.5" />
                      Connect
                    </Button>
                  </div>

                  {/* Show variable dropdown or text input based on connect mode */}
                  <div>
                    {connectedFields.has(fieldKey) && workflowData && currentNodeId ? (
                      <VariableSelectionDropdown
                        workflowData={workflowData}
                        currentNodeId={currentNodeId}
                        value={values[fieldKey] || ''}
                        onChange={(val) => setValue(fieldKey, val)}
                        placeholder="Select a variable..."
                      />
                    ) : (
                      <input
                        type="text"
                        value={values[fieldKey] || ''}
                        onChange={(e) => setValue(fieldKey, e.target.value)}
                        placeholder="Enter value..."
                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm"
                      />
                    )}
                  </div>

                  {/* Show column name as reference */}
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Column: {columnName}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
