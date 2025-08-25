"use client"

import React, { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Plus, Table } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GoogleSheetsColumnSelectorProps {
  field: any;
  value: string[];
  onChange: (value: string[]) => void;
  error?: string;
  onDynamicLoad?: (fieldName: string, dependsOn?: string, dependsOnValue?: any, forceRefresh?: boolean) => Promise<void>;
  dynamicOptions?: any[];
  isLoading?: boolean;
  workflowData?: { nodes: any[]; edges: any[] };
  currentNodeId?: string;
}

interface Column {
  id: string;
  name: string;
  dataType: string;
  hasData: boolean;
  sampleValues: string[];
}

export function GoogleSheetsColumnSelector({
  field,
  value = [],
  onChange,
  error,
  onDynamicLoad,
  dynamicOptions,
  isLoading,
  workflowData,
  currentNodeId
}: GoogleSheetsColumnSelectorProps) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [selectedColumn, setSelectedColumn] = useState<string>('');

  // Get current form values to determine sheet context
  const currentNode = workflowData?.nodes?.find(n => n.id === currentNodeId);
  const spreadsheetId = currentNode?.data?.config?.spreadsheetId;
  const sheetName = currentNode?.data?.config?.sheetName;

  useEffect(() => {
    if (spreadsheetId && sheetName && onDynamicLoad) {
      loadColumns();
    }
  }, [spreadsheetId, sheetName]);

  const loadColumns = async () => {
    if (!onDynamicLoad || !spreadsheetId || !sheetName) return;

    try {
      await onDynamicLoad('google-sheets_columns', 'sheetName', sheetName, true);
    } catch (error) {
      console.error('Failed to load columns:', error);
    }
  };

  // Update columns when dynamicOptions change
  useEffect(() => {
    if (dynamicOptions && dynamicOptions.length > 0) {
      setColumns(dynamicOptions);
    }
  }, [dynamicOptions]);

  const getDataTypeColor = (dataType: string) => {
    switch (dataType) {
      case 'number': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'date': return 'bg-green-100 text-green-800 border-green-200';
      case 'boolean': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'text': 
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const addColumn = () => {
    if (selectedColumn && !value.includes(selectedColumn)) {
      onChange([...value, selectedColumn]);
      setSelectedColumn('');
    }
  };

  const removeColumn = (columnId: string) => {
    onChange(value.filter(id => id !== columnId));
  };

  const getColumnInfo = (columnId: string) => {
    return columns.find(col => col.id === columnId);
  };

  if (!spreadsheetId || !sheetName) {
    return (
      <Card className="bg-gray-50">
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center text-gray-500">
            <Table className="h-8 w-8 mx-auto mb-2" />
            <p>Select a spreadsheet and sheet to choose columns</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Loading columns...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const availableColumns = columns.filter(col => !value.includes(col.id));

  return (
    <div className="space-y-4">
      {field.label && (
        <label className="text-sm font-medium text-gray-700">
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      {field.description && (
        <p className="text-sm text-gray-600">{field.description}</p>
      )}

      {/* Column Selector */}
      <div className="flex gap-2">
        <div className="flex-1">
          <Select value={selectedColumn} onValueChange={setSelectedColumn}>
            <SelectTrigger>
              <SelectValue placeholder="Select a column to add..." />
            </SelectTrigger>
            <SelectContent>
              {availableColumns.map((column) => (
                <SelectItem key={column.id} value={column.id}>
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-gray-500">{column.id}</span>
                      <span>{column.name}</span>
                    </div>
                    <Badge 
                      variant="secondary" 
                      className={cn("text-xs ml-2", getDataTypeColor(column.dataType))}
                    >
                      {column.dataType}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
              {availableColumns.length === 0 && (
                <SelectItem value="" disabled>
                  {columns.length === 0 ? 'No columns available' : 'All columns selected'}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        <Button 
          type="button"
          onClick={addColumn}
          disabled={!selectedColumn || value.includes(selectedColumn)}
          size="default"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Selected Columns */}
      {value.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">Selected Columns</h4>
          <div className="space-y-2">
            {value.map((columnId) => {
              const columnInfo = getColumnInfo(columnId);
              return (
                <div key={columnId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-gray-500 min-w-[2rem]">
                      {columnId}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{columnInfo?.name || columnId}</span>
                        <Badge 
                          variant="secondary" 
                          className={cn("text-xs", getDataTypeColor(columnInfo?.dataType || 'text'))}
                        >
                          {columnInfo?.dataType || 'text'}
                        </Badge>
                      </div>
                      {columnInfo?.hasData && columnInfo.sampleValues.length > 0 && (
                        <div className="text-xs text-gray-500 mt-1">
                          Sample: {columnInfo.sampleValues.slice(0, 2).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeColumn(columnId)}
                    className="text-gray-400 hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="text-sm text-gray-600">
        {value.length === 0 ? (
          'No columns selected'
        ) : (
          `${value.length} column${value.length !== 1 ? 's' : ''} selected`
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}