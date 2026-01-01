"use client"

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, RefreshCw, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { SimpleVariablePicker } from "../SimpleVariablePicker";
import { logger } from '@/lib/utils/logger';

interface ColumnMapping {
  column: string;
  value: string;
}

interface MicrosoftExcelColumnMapperProps {
  value: any;
  onChange: (value: any) => void;
  field: any;
  nodeInfo?: any;
  workflowData?: any;
  currentNodeId?: string;
  dynamicOptions?: Record<string, any[]>;
  loadingFields?: Set<string>;
  loadOptions?: (fieldName: string, dependsOn?: string, dependsOnValue?: any, forceRefresh?: boolean) => Promise<void>;
  parentValues?: Record<string, any>;
}

export function MicrosoftExcelColumnMapper({
  value,
  onChange,
  field,
  nodeInfo,
  workflowData,
  currentNodeId,
  dynamicOptions,
  loadingFields,
  loadOptions,
  parentValues
}: MicrosoftExcelColumnMapperProps) {
  const [isLoadingColumns, setIsLoadingColumns] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parse the value - should be an array of { column, value } objects or an object
  const mappings: ColumnMapping[] = useMemo(() => {
    if (!value) return [];

    // If it's already an array, use it
    if (Array.isArray(value)) {
      return value.filter(m => m && m.column);
    }

    // If it's an object (legacy format), convert to array
    if (typeof value === 'object') {
      return Object.entries(value).map(([column, val]) => ({
        column,
        value: String(val || '')
      }));
    }

    return [];
  }, [value]);

  // Get available columns from dynamic options
  const availableColumns = useMemo(() => {
    console.log('[ExcelColumnMapper] Computing availableColumns from dynamicOptions:', {
      dynamicOptions,
      hasColumnMapping: !!dynamicOptions?.columnMapping,
      hasFilterColumn: !!dynamicOptions?.filterColumn,
      hasSearchColumn: !!dynamicOptions?.searchColumn,
      hasColumns: !!dynamicOptions?.columns,
      hasMicrosoftExcelColumns: !!dynamicOptions?.['microsoft-excel_columns'],
      allKeys: dynamicOptions ? Object.keys(dynamicOptions) : []
    });

    // Try different possible option keys for columns
    const columnOptions = dynamicOptions?.columnMapping ||
                         dynamicOptions?.filterColumn ||
                         dynamicOptions?.searchColumn ||
                         dynamicOptions?.columns ||
                         dynamicOptions?.['microsoft-excel_columns'] ||
                         [];

    const result = columnOptions.map((opt: any) => ({
      value: typeof opt === 'string' ? opt : opt.value || opt.name,
      label: typeof opt === 'string' ? opt : opt.label || opt.name || opt.value
    }));

    console.log('[ExcelColumnMapper] Computed availableColumns:', {
      columnOptionsLength: columnOptions.length,
      resultLength: result.length,
      result
    });

    return result;
  }, [dynamicOptions]);

  // Get the worksheet name and hasHeaders from parent values to load columns
  const worksheetName = parentValues?.worksheetName;
  const workbookId = parentValues?.workbookId;
  const hasHeaders = parentValues?.hasHeaders;

  // Load columns when worksheet or hasHeaders changes
  useEffect(() => {
    console.log('[ExcelColumnMapper] useEffect triggered:', {
      hasWorksheetName: !!worksheetName,
      hasWorkbookId: !!workbookId,
      hasHeaders,
      hasLoadOptions: !!loadOptions,
      availableColumnsLength: availableColumns.length,
      worksheetName,
      workbookId,
      parentValues
    });

    if (worksheetName && workbookId && loadOptions && hasHeaders) {
      // Always try to load when worksheet or hasHeaders changes
      // This ensures we get fresh data when switching worksheets or changing hasHeaders
      setIsLoadingColumns(true);
      setError(null);

      // Try to load columns - use columnMapping field name so it maps to 'columns' dataType
      // Pass hasHeaders as part of the dependsOnValue so the API knows how to format columns
      const dependsOnValue = {
        worksheetName,
        hasHeaders: hasHeaders === 'yes' || hasHeaders === true
      };

      loadOptions('columnMapping', 'hasHeaders', dependsOnValue, true)
        .catch(err => {
          logger.error('[ExcelColumnMapper] Failed to load columns:', err);
          setError('Failed to load columns');
        })
        .finally(() => {
          setIsLoadingColumns(false);
        });
    }
  }, [worksheetName, workbookId, hasHeaders, loadOptions]);

  // Check if columns are currently loading
  const columnsLoading = isLoadingColumns ||
    loadingFields?.has('columnMapping') ||
    loadingFields?.has('filterColumn') ||
    loadingFields?.has('searchColumn') ||
    loadingFields?.has('columns');

  // Add a new mapping row
  const handleAddMapping = useCallback(() => {
    const newMappings = [...mappings, { column: '', value: '' }];
    onChange(newMappings);
  }, [mappings, onChange]);

  // Remove a mapping row
  const handleRemoveMapping = useCallback((index: number) => {
    const newMappings = mappings.filter((_, i) => i !== index);
    onChange(newMappings);
  }, [mappings, onChange]);

  // Update a mapping's column
  const handleColumnChange = useCallback((index: number, column: string) => {
    const newMappings = [...mappings];
    newMappings[index] = { ...newMappings[index], column };
    onChange(newMappings);
  }, [mappings, onChange]);

  // Update a mapping's value
  const handleValueChange = useCallback((index: number, newValue: string) => {
    const newMappings = [...mappings];
    newMappings[index] = { ...newMappings[index], value: newValue };
    onChange(newMappings);
  }, [mappings, onChange]);

  // Refresh columns
  const handleRefreshColumns = useCallback(() => {
    if (loadOptions && worksheetName) {
      setIsLoadingColumns(true);
      setError(null);
      loadOptions('columnMapping', 'worksheetName', worksheetName, true)
        .catch(err => {
          logger.error('[ExcelColumnMapper] Failed to refresh columns:', err);
          setError('Failed to refresh columns');
        })
        .finally(() => {
          setIsLoadingColumns(false);
        });
    }
  }, [loadOptions, worksheetName]);

  // Get columns not yet used in mappings
  const unusedColumns = useMemo(() => {
    const usedColumns = new Set(mappings.map(m => m.column));
    return availableColumns.filter(col => !usedColumns.has(col.value));
  }, [availableColumns, mappings]);

  // Debug logging
  console.log('[ExcelColumnMapper] Render state:', {
    hasWorksheetName: !!worksheetName,
    columnsLoading,
    availableColumnsLength: availableColumns.length,
    mappingsLength: mappings.length,
    error,
    willRenderEmptyState: !worksheetName,
    willRenderLoadingState: columnsLoading && availableColumns.length === 0,
    willRenderErrorState: error && availableColumns.length === 0,
    willRenderMapper: !!worksheetName && !(columnsLoading && availableColumns.length === 0) && !(error && availableColumns.length === 0)
  });

  // Render empty state when no worksheet selected
  if (!worksheetName) {
    return (
      <div className="p-4 border border-dashed rounded-md text-center space-y-2 bg-muted/30">
        <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Select a worksheet first to configure column values
        </p>
      </div>
    );
  }

  // Render empty state when hasHeaders is not yet selected
  if (!hasHeaders) {
    return (
      <div className="p-4 border border-dashed rounded-md text-center space-y-2 bg-muted/30">
        <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Please indicate whether your worksheet has headers to configure column values
        </p>
      </div>
    );
  }

  // Render loading state
  if (columnsLoading && availableColumns.length === 0) {
    return (
      <div className="p-4 border border-dashed rounded-md text-center space-y-2">
        <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Loading columns from worksheet...
        </p>
      </div>
    );
  }

  // Render error state
  if (error && availableColumns.length === 0) {
    return (
      <div className="p-4 border border-dashed border-red-300 rounded-md text-center space-y-2 bg-red-50 dark:bg-red-950/20">
        <AlertCircle className="h-6 w-6 mx-auto text-red-500" />
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <Button variant="outline" size="sm" onClick={handleRefreshColumns}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with refresh button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Map values to worksheet columns
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleRefreshColumns}
          disabled={columnsLoading}
        >
          <RefreshCw className={cn("h-4 w-4", columnsLoading && "animate-spin")} />
        </Button>
      </div>

      {/* Mapping rows */}
      <div className="space-y-3">
        {mappings.map((mapping, index) => (
          <div
            key={index}
            className="flex items-start gap-2 p-3 border rounded-lg bg-card"
          >
            {/* Column selector */}
            <div className="flex-1 min-w-0">
              <label className="text-xs text-muted-foreground mb-1 block">Column</label>
              <select
                value={mapping.column}
                onChange={(e) => handleColumnChange(index, e.target.value)}
                className={cn(
                  "w-full h-9 px-3 rounded-md border border-input bg-background text-sm",
                  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                  !mapping.column && "text-muted-foreground"
                )}
              >
                <option value="">Select column...</option>
                {/* Show current column even if it's "used" */}
                {mapping.column && !unusedColumns.find(c => c.value === mapping.column) && (
                  <option value={mapping.column}>{mapping.column}</option>
                )}
                {unusedColumns.map((col) => (
                  <option key={col.value} value={col.value}>
                    {col.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Value input with variable picker */}
            <div className="flex-1 min-w-0">
              <label className="text-xs text-muted-foreground mb-1 block">Value</label>
              <div className="relative">
                <Input
                  value={mapping.value}
                  onChange={(e) => handleValueChange(index, e.target.value)}
                  placeholder="Enter value or use variable..."
                  className="pr-8"
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2">
                  <SimpleVariablePicker
                    workflowData={workflowData}
                    currentNodeId={currentNodeId}
                    onSelect={(variable) => handleValueChange(index, mapping.value + variable)}
                    compact
                  />
                </div>
              </div>
            </div>

            {/* Remove button */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleRemoveMapping(index)}
              className="mt-5 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      {/* Add mapping button */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAddMapping}
        disabled={unusedColumns.length === 0 && mappings.length > 0}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Column Mapping
      </Button>

      {/* Help text */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>Map data to columns in your Excel worksheet.</p>
        <p>Use the variable picker to reference data from previous steps.</p>
        {field.helpText && <p>{field.helpText}</p>}
      </div>
    </div>
  );
}
