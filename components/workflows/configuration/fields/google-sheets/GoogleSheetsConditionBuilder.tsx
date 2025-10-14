"use client"

import React, { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { X, Plus, Filter, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

import { logger } from '@/lib/utils/logger'

interface Condition {
  id: string;
  column: string;
  operator: string;
  value: string;
  dataType: string;
}

interface GoogleSheetsConditionBuilderProps {
  field: any;
  value: Condition[];
  onChange: (value: Condition[]) => void;
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

const OPERATORS = {
  text: [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'not_contains', label: 'Does not contain' },
    { value: 'starts_with', label: 'Starts with' },
    { value: 'ends_with', label: 'Ends with' },
    { value: 'is_empty', label: 'Is empty' },
    { value: 'is_not_empty', label: 'Is not empty' },
  ],
  number: [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not equals' },
    { value: 'greater_than', label: 'Greater than' },
    { value: 'greater_than_equal', label: 'Greater than or equal' },
    { value: 'less_than', label: 'Less than' },
    { value: 'less_than_equal', label: 'Less than or equal' },
    { value: 'is_empty', label: 'Is empty' },
    { value: 'is_not_empty', label: 'Is not empty' },
  ],
  date: [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not equals' },
    { value: 'before', label: 'Before' },
    { value: 'after', label: 'After' },
    { value: 'between', label: 'Between' },
    { value: 'is_empty', label: 'Is empty' },
    { value: 'is_not_empty', label: 'Is not empty' },
  ],
  boolean: [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not equals' },
    { value: 'is_empty', label: 'Is empty' },
    { value: 'is_not_empty', label: 'Is not empty' },
  ],
};

const VALUE_NOT_REQUIRED = ['is_empty', 'is_not_empty'];

export function GoogleSheetsConditionBuilder({
  field,
  value = [],
  onChange,
  error,
  onDynamicLoad,
  dynamicOptions,
  isLoading,
  workflowData,
  currentNodeId
}: GoogleSheetsConditionBuilderProps) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [newCondition, setNewCondition] = useState<Partial<Condition>>({
    column: '',
    operator: '',
    value: '',
    dataType: 'text'
  });

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
      logger.error('Failed to load columns:', error);
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
      case 'number': return 'bg-blue-100 text-blue-800';
      case 'date': return 'bg-green-100 text-green-800';
      case 'boolean': return 'bg-purple-100 text-purple-800';
      case 'text': 
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const addCondition = () => {
    if (!newCondition.column || !newCondition.operator) return;

    const selectedColumn = columns.find(col => col.id === newCondition.column);
    if (!selectedColumn) return;

    const condition: Condition = {
      id: Date.now().toString(),
      column: newCondition.column,
      operator: newCondition.operator,
      value: VALUE_NOT_REQUIRED.includes(newCondition.operator) ? '' : newCondition.value || '',
      dataType: selectedColumn.dataType
    };

    onChange([...value, condition]);
    setNewCondition({
      column: '',
      operator: '',
      value: '',
      dataType: 'text'
    });
  };

  const removeCondition = (conditionId: string) => {
    onChange(value.filter(condition => condition.id !== conditionId));
  };

  const updateCondition = (conditionId: string, updates: Partial<Condition>) => {
    onChange(value.map(condition => 
      condition.id === conditionId 
        ? { ...condition, ...updates }
        : condition
    ));
  };

  const handleColumnChange = (columnId: string) => {
    const selectedColumn = columns.find(col => col.id === columnId);
    setNewCondition({
      column: columnId,
      operator: '',
      value: '',
      dataType: selectedColumn?.dataType || 'text'
    });
  };

  const getAvailableOperators = (dataType: string) => {
    return OPERATORS[dataType as keyof typeof OPERATORS] || OPERATORS.text;
  };

  const renderValueInput = (condition: Condition | Partial<Condition>, onChange: (value: string) => void) => {
    if (VALUE_NOT_REQUIRED.includes(condition.operator || '')) {
      return null;
    }

    const dataType = condition.dataType || 'text';

    if (dataType === 'boolean') {
      return (
        <Select value={condition.value} onValueChange={onChange}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Value" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">True</SelectItem>
            <SelectItem value="false">False</SelectItem>
          </SelectContent>
        </Select>
      );
    }

    if (dataType === 'date') {
      return (
        <Input
          type="date"
          value={condition.value}
          onChange={(e) => onChange(e.target.value)}
          className="w-40"
        />
      );
    }

    if (dataType === 'number') {
      return (
        <Input
          type="number"
          value={condition.value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter number"
          className="w-32"
        />
      );
    }

    return (
      <Input
        type="text"
        value={condition.value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter value"
        className="w-40"
      />
    );
  };

  if (!spreadsheetId || !sheetName) {
    return (
      <Card className="bg-gray-50">
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center text-gray-500">
            <Filter className="h-8 w-8 mx-auto mb-2" />
            <p>Select a spreadsheet and sheet to build conditions</p>
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

      {/* Add New Condition */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Condition
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {/* Column Selector */}
            <div className="flex-1 min-w-[150px]">
              <Select value={newCondition.column} onValueChange={handleColumnChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((column) => (
                    <SelectItem key={column.id} value={column.id}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-500">{column.id}</span>
                        <span>{column.name}</span>
                        <Badge 
                          variant="secondary" 
                          className={cn("text-xs", getDataTypeColor(column.dataType))}
                        >
                          {column.dataType}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Operator Selector */}
            {newCondition.column && (
              <div className="flex-1 min-w-[120px]">
                <Select 
                  value={newCondition.operator} 
                  onValueChange={(operator) => setNewCondition({ ...newCondition, operator, value: '' })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Operator" />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableOperators(newCondition.dataType || 'text').map((op) => (
                      <SelectItem key={op.value} value={op.value}>
                        {op.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Value Input */}
            {newCondition.column && newCondition.operator && (
              <div className="flex-1 min-w-[120px]">
                {renderValueInput(newCondition, (value) => setNewCondition({ ...newCondition, value }))}
              </div>
            )}

            {/* Add Button */}
            {newCondition.column && newCondition.operator && 
             (VALUE_NOT_REQUIRED.includes(newCondition.operator) || newCondition.value) && (
              <Button type="button" onClick={addCondition} size="default">
                Add
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Existing Conditions */}
      {value.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Conditions ({value.length})
          </h4>
          
          {value.map((condition, index) => {
            const column = columns.find(col => col.id === condition.column);
            return (
              <Card key={condition.id}>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {index > 0 && (
                      <Badge variant="outline" className="text-xs">
                        AND
                      </Badge>
                    )}
                    
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-sm text-gray-500">{condition.column}</span>
                      <span className="font-medium text-sm truncate">{column?.name}</span>
                      <Badge 
                        variant="secondary" 
                        className={cn("text-xs", getDataTypeColor(condition.dataType))}
                      >
                        {condition.dataType}
                      </Badge>
                    </div>

                    <Select 
                      value={condition.operator} 
                      onValueChange={(operator) => updateCondition(condition.id, { operator, value: '' })}
                    >
                      <SelectTrigger className="w-auto min-w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {getAvailableOperators(condition.dataType).map((op) => (
                          <SelectItem key={op.value} value={op.value}>
                            {op.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {renderValueInput(condition, (value) => updateCondition(condition.id, { value }))}

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeCondition(condition.id)}
                      className="text-gray-400 hover:text-red-600 ml-auto"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {value.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <Filter className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No conditions set. All rows will be affected.</p>
        </div>
      )}

      {value.length > 1 && (
        <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 p-3 rounded-lg">
          <AlertCircle className="h-4 w-4" />
          <span>All conditions must be true (AND logic) for a row to match.</span>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}