"use client"

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GoogleSheetsDataPreviewProps {
  field: any;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  onDynamicLoad?: (fieldName: string, dependsOn?: string, dependsOnValue?: any, forceRefresh?: boolean) => Promise<void>;
  dynamicOptions?: any[];
  isLoading?: boolean;
  workflowData?: { nodes: any[]; edges: any[] };
  currentNodeId?: string;
}

interface PreviewData {
  headers: Array<{
    id: string;
    name: string;
    dataType: string;
    hasData: boolean;
    sampleValues: string[];
  }>;
  sampleData: any[][];
  totalRows: number;
  totalColumns: number;
  hasHeaders: boolean;
  dataTypes: Record<string, string>;
  columnStats: Record<string, any>;
}

export function GoogleSheetsDataPreview({
  field,
  value,
  onChange,
  error,
  onDynamicLoad,
  dynamicOptions,
  isLoading,
  workflowData,
  currentNodeId
}: GoogleSheetsDataPreviewProps) {
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Get current form values to determine sheet context
  const currentNode = workflowData?.nodes?.find(n => n.id === currentNodeId);
  const spreadsheetId = currentNode?.data?.config?.spreadsheetId;
  const sheetName = currentNode?.data?.config?.sheetName;

  useEffect(() => {
    if (spreadsheetId && sheetName && onDynamicLoad) {
      loadPreviewData();
    }
  }, [spreadsheetId, sheetName]);

  const loadPreviewData = async () => {
    if (!onDynamicLoad || !spreadsheetId || !sheetName) return;

    setLoading(true);
    setLoadError(null);

    try {
      // Load enhanced preview data
      await onDynamicLoad('google-sheets_enhanced-preview', 'sheetName', sheetName, true);
      
      // The data will be available in dynamicOptions
      if (dynamicOptions && dynamicOptions.length > 0) {
        setPreviewData(dynamicOptions[0]);
      }
    } catch (error: any) {
      console.error('Failed to load preview data:', error);
      setLoadError(error.message || 'Failed to load sheet preview');
    } finally {
      setLoading(false);
    }
  };

  // Update preview data when dynamicOptions change
  useEffect(() => {
    if (dynamicOptions && dynamicOptions.length > 0) {
      setPreviewData(dynamicOptions[0]);
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

  const formatCellValue = (value: any, dataType: string) => {
    if (value === null || value === undefined || value === '') {
      return <span className="text-gray-400 italic">empty</span>;
    }

    if (dataType === 'number' && !isNaN(value)) {
      return parseFloat(value).toLocaleString();
    }

    if (dataType === 'date' && !isNaN(Date.parse(value))) {
      return new Date(value).toLocaleDateString();
    }

    return String(value);
  };

  if (!spreadsheetId || !sheetName) {
    return (
      <Card className="bg-gray-50">
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center text-gray-500">
            <FileSpreadsheet className="h-8 w-8 mx-auto mb-2" />
            <p>Select a spreadsheet and sheet to see preview</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading || isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            <p className="text-sm text-gray-600">Loading sheet preview...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center text-red-600">
            <AlertCircle className="h-6 w-6 mx-auto mb-2" />
            <p className="text-sm">{loadError}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!previewData) {
    return (
      <Card className="bg-gray-50">
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center text-gray-500">
            <FileSpreadsheet className="h-8 w-8 mx-auto mb-2" />
            <p>No preview data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Sheet Preview
          </CardTitle>
          <div className="flex gap-2">
            <Badge variant="outline">
              {previewData.totalRows} rows
            </Badge>
            <Badge variant="outline">
              {previewData.totalColumns} columns
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Column Information */}
          <div>
            <h4 className="font-medium text-sm text-gray-700 mb-2">Column Information</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mb-4">
              {previewData.headers.map((header, index) => (
                <div key={header.id} className="p-2 bg-gray-50 rounded border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs text-gray-500">{header.id}</span>
                    <Badge 
                      variant="secondary" 
                      className={cn("text-xs px-1.5 py-0.5", getDataTypeColor(header.dataType))}
                    >
                      {header.dataType}
                    </Badge>
                  </div>
                  <div className="text-sm font-medium truncate" title={header.name}>
                    {header.name}
                  </div>
                  {header.sampleValues.length > 0 && (
                    <div className="text-xs text-gray-500 mt-1 truncate" title={header.sampleValues.join(', ')}>
                      Sample: {header.sampleValues.slice(0, 2).join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Interactive Data Preview Table */}
          <div>
            <h4 className="font-medium text-sm text-gray-700 mb-2">Data Preview</h4>
            <p className="text-xs text-gray-500 mb-3">Click on column headers or row numbers to select them for your action</p>
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 bg-gray-50 text-center">#</TableHead>
                      {previewData.headers.slice(0, 10).map((header, index) => (
                        <TableHead 
                          key={header.id} 
                          className="bg-gray-50 min-w-32 cursor-pointer hover:bg-gray-100 transition-colors"
                          onClick={() => {
                            // This would trigger column selection in parent form
                            console.log('Column selected:', header);
                          }}
                        >
                          <div className="flex flex-col p-2">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sm">{header.name}</span>
                              <Badge 
                                variant="secondary" 
                                className={cn("text-xs ml-1", getDataTypeColor(header.dataType))}
                              >
                                {header.dataType}
                              </Badge>
                            </div>
                            <span className="font-mono text-xs text-gray-500 mt-1">
                              Column {header.id}
                            </span>
                          </div>
                        </TableHead>
                      ))}
                      {previewData.headers.length > 10 && (
                        <TableHead className="bg-gray-50 text-gray-500">
                          +{previewData.headers.length - 10} more
                        </TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.sampleData.slice(0, 8).map((row, rowIndex) => (
                      <TableRow 
                        key={rowIndex}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <TableCell 
                          className="bg-gray-50 text-gray-600 font-mono text-sm text-center cursor-pointer hover:bg-gray-100 font-medium"
                          onClick={() => {
                            // This would trigger row selection in parent form
                            console.log('Row selected:', rowIndex + 2);
                          }}
                        >
                          {rowIndex + 2}
                        </TableCell>
                        {row.slice(0, 10).map((cell, cellIndex) => (
                          <TableCell key={cellIndex} className="max-w-48">
                            <div className="truncate" title={String(cell || '')}>
                              {formatCellValue(cell, previewData.headers[cellIndex]?.dataType || 'text')}
                            </div>
                          </TableCell>
                        ))}
                        {row.length < 10 && previewData.headers.slice(row.length, 10).map((_, index) => (
                          <TableCell key={`empty-${index}`} className="text-gray-400 italic">
                            empty
                          </TableCell>
                        ))}
                        {previewData.headers.length > 10 && (
                          <TableCell className="text-gray-500">...</TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            
            {previewData.sampleData.length > 10 && (
              <div className="text-center py-2 text-sm text-gray-500">
                ... and {previewData.totalRows - 10} more rows
              </div>
            )}
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t">
            <div className="text-center">
              <div className="text-lg font-semibold text-gray-900">{previewData.totalRows}</div>
              <div className="text-xs text-gray-600">Total Rows</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-gray-900">{previewData.totalColumns}</div>
              <div className="text-xs text-gray-600">Total Columns</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-gray-900">
                {Object.values(previewData.dataTypes).filter(type => type === 'number').length}
              </div>
              <div className="text-xs text-gray-600">Numeric Columns</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-gray-900">
                {previewData.hasHeaders ? 'Yes' : 'No'}
              </div>
              <div className="text-xs text-gray-600">Has Headers</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}