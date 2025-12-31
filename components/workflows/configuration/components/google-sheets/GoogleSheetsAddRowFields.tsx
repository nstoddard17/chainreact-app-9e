"use client"

import React, { useState, useEffect, useCallback } from "react";
import { LightningLoader } from '@/components/ui/lightning-loader';
import { Plug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VariableSelectionDropdown } from '../../fields/shared/VariableSelectionDropdown';
import { useIntegrationStore } from '@/stores/integrationStore';
import { logger } from '@/lib/utils/logger';

interface GoogleSheetsAddRowFieldsProps {
  values: Record<string, any>;
  setValue: (key: string, value: any) => void;
  previewData?: any[];
  hasHeaders?: boolean;
  action: string;
  showPreviewData?: boolean;
  loadingPreview?: boolean;
  insertPosition?: string;
  rowNumber?: number;
  workflowData?: { nodes: any[]; edges: any[] };
  currentNodeId?: string;
  integrationId?: string;
}

export function GoogleSheetsAddRowFields({
  values,
  setValue,
  previewData: externalPreviewData,
  hasHeaders: externalHasHeaders = true,
  action,
  showPreviewData: externalShowPreviewData,
  loadingPreview: externalLoadingPreview = false,
  insertPosition,
  rowNumber,
  workflowData,
  currentNodeId,
  integrationId
}: GoogleSheetsAddRowFieldsProps) {
  // Track which fields are in connect mode (showing variable dropdown instead of input)
  const [connectedFields, setConnectedFields] = useState<Set<string>>(new Set());

  // Self-fetch state when external preview data is not provided
  const [selfFetchedData, setSelfFetchedData] = useState<any[]>([]);
  const [selfLoading, setSelfLoading] = useState(false);
  const [selfHasHeaders, setSelfHasHeaders] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const { getIntegrationByProvider } = useIntegrationStore();

  // Use external data if provided, otherwise use self-fetched data
  const previewData = externalPreviewData && externalPreviewData.length > 0 ? externalPreviewData : selfFetchedData;
  const hasHeaders = externalPreviewData && externalPreviewData.length > 0 ? externalHasHeaders : selfHasHeaders;
  const showPreviewData = externalShowPreviewData !== undefined ? externalShowPreviewData : selfFetchedData.length > 0;
  const loadingPreview = externalLoadingPreview || selfLoading;

  // Self-fetch data when spreadsheet and sheet are selected but no external data provided
  const fetchSheetData = useCallback(async () => {
    if (!values.spreadsheetId || !values.sheetName) return;
    if (externalPreviewData && externalPreviewData.length > 0) return; // Don't fetch if external data provided

    setSelfLoading(true);
    setFetchError(null);

    try {
      // Get integration - either from prop or store
      let intId = integrationId;
      if (!intId) {
        const integration = getIntegrationByProvider('google-sheets');
        intId = integration?.id;
      }

      if (!intId) {
        setFetchError('Google Sheets integration not found');
        setSelfLoading(false);
        return;
      }

      logger.debug('📊 [AddRowFields] Self-fetching sheet data', {
        spreadsheetId: values.spreadsheetId,
        sheetName: values.sheetName,
        integrationId: intId
      });

      const response = await fetch('/api/integrations/google-sheets/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId: intId,
          dataType: 'google-sheets_records',
          options: {
            spreadsheetId: values.spreadsheetId,
            sheetName: typeof values.sheetName === 'object' ? values.sheetName.name : values.sheetName,
            maxRows: 10,
            includeHeaders: true
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch sheet data: ${response.status}`);
      }

      const result = await response.json();

      if (result.data && Array.isArray(result.data)) {
        const formattedData = result.data.map((row: any) => ({
          id: row.rowNumber ? `row_${row.rowNumber}` : `row_${Math.random()}`,
          rowNumber: row.rowNumber,
          fields: row.fields || row
        }));
        setSelfFetchedData(formattedData);
        logger.debug('📊 [AddRowFields] Self-fetch complete', { rowCount: formattedData.length });
      }
    } catch (error: any) {
      logger.error('📊 [AddRowFields] Self-fetch error', { error: error.message });
      setFetchError(error.message);
    } finally {
      setSelfLoading(false);
    }
  }, [values.spreadsheetId, values.sheetName, externalPreviewData, integrationId, getIntegrationByProvider]);

  // Trigger fetch when spreadsheet/sheet changes
  useEffect(() => {
    if (action === 'add' && values.spreadsheetId && values.sheetName) {
      // Only self-fetch if no external data
      if (!externalPreviewData || externalPreviewData.length === 0) {
        fetchSheetData();
      }
    }
  }, [action, values.spreadsheetId, values.sheetName, externalPreviewData, fetchSheetData]);

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

    // Clear the value when disconnecting (after state update)
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

  // Generate dynamic heading text based on insert position
  const getHeadingText = () => {
    if (insertPosition === 'append') {
      return 'Add New Row at End of Sheet';
    } else if (insertPosition === 'prepend') {
      return 'Add New Row Below Headers';
    } else if (insertPosition === 'specific_row' && rowNumber) {
      if (rowNumber === 1) {
        return 'Add New Row in First Row';
      }
      return `Add New Row at Row ${rowNumber}`;
    }
    return 'Add New Row';
  };

  // Only show for add action
  if (action !== 'add') {
    return null;
  }

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
              onClick={fetchSheetData}
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state while fetching column data
  if (loadingPreview) {
    const sheetNameDisplay = typeof values.sheetName === 'object' ? values.sheetName.name : values.sheetName;
    return (
      <div className="mt-4">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
          <div className="flex flex-col items-center justify-center space-y-4">
            <LightningLoader size="md" color="blue" />
            <div className="text-center">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Preparing column fields...</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Analyzing your sheet "{sheetNameDisplay}" to create input fields for each column
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Don't show anything if we don't have spreadsheet/sheet selected yet
  if (!values.spreadsheetId || !values.sheetName) {
    return null;
  }

  // Don't show anything if we don't have preview data yet (and not loading)
  if (!showPreviewData || previewData.length === 0) {
    return null;
  }

  // Get column names from the first row of preview data
  const columns = previewData[0]?.fields ? Object.keys(previewData[0].fields) : [];

  return (
    <div className="mt-4 space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-slate-900 mb-3">
              {getHeadingText()}
            </h3>
            <p className="text-xs text-slate-600 mb-4">
              Enter values for each column. Leave blank to skip a column.
            </p>
          </div>
          
          {/* Display all columns as individual fields */}
          <div className="space-y-3">
            {columns.map((columnName) => {
              // Smart field type detection
              const sampleValue = previewData[0]?.fields[columnName];
              
              const isImageUrl = typeof sampleValue === 'string' && 
                (sampleValue.startsWith('http') && 
                 (sampleValue.includes('.jpg') || sampleValue.includes('.jpeg') || 
                  sampleValue.includes('.png') || sampleValue.includes('.gif') || 
                  sampleValue.includes('.webp') || sampleValue.includes('.svg')));
              
              const isUrl = typeof sampleValue === 'string' && 
                (sampleValue.startsWith('http://') || sampleValue.startsWith('https://'));
              
              const isEmail = typeof sampleValue === 'string' && 
                sampleValue.includes('@') && sampleValue.includes('.');
              
              const isBoolean = typeof sampleValue === 'boolean' || 
                (typeof sampleValue === 'string' && 
                 (sampleValue.toLowerCase() === 'true' || sampleValue.toLowerCase() === 'false'));
              
              const isNumber = typeof sampleValue === 'number' || 
                (typeof sampleValue === 'string' && !isNaN(Number(sampleValue)) && sampleValue !== '');
              
              const isDate = typeof sampleValue === 'string' && 
                !isNaN(Date.parse(sampleValue)) && 
                (sampleValue.includes('-') || sampleValue.includes('/'));
              
              // Check if it looks like a dropdown value
              const possibleDropdownValues = ['Active', 'Inactive', 'Pending', 'Completed', 'Yes', 'No', 'High', 'Medium', 'Low'];
              const isDropdown = typeof sampleValue === 'string' && 
                possibleDropdownValues.includes(sampleValue);
              
              return (
                <div key={columnName}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium text-slate-700">
                      {hasHeaders ? columnName : `Column ${columnName}`}
                    </label>
                    <Button
                      type="button"
                      variant={connectedFields.has(`newRow_${columnName}`) || isVariableValue(values[`newRow_${columnName}`]) ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleConnectMode(`newRow_${columnName}`)}
                      className="h-7 text-xs gap-1.5"
                      title={connectedFields.has(`newRow_${columnName}`) ? "Switch to text input" : "Connect variable"}
                    >
                      <Plug className="h-3.5 w-3.5" />
                      Connect
                    </Button>
                  </div>

                  {/* Image field */}
                  {isImageUrl ? (
                    <div>
                      {connectedFields.has(`newRow_${columnName}`) && workflowData && currentNodeId ? (
                        <VariableSelectionDropdown
                          workflowData={workflowData}
                          currentNodeId={currentNodeId}
                          value={values[`newRow_${columnName}`] || ''}
                          onChange={(val) => setValue(`newRow_${columnName}`, val)}
                          placeholder="Select a variable..."
                        />
                      ) : (
                        <input
                          type="url"
                          value={values[`newRow_${columnName}`] || ''}
                          onChange={(e) => setValue(`newRow_${columnName}`, e.target.value)}
                          placeholder="https://example.com/image.png"
                          className="w-full px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                        />
                      )}
                    </div>
                  ) : isBoolean ? (
                    // Boolean field - show as toggle
                    <div className="flex items-center space-x-3">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={values[`newRow_${columnName}`] === 'true' || values[`newRow_${columnName}`] === true}
                          onChange={(e) => setValue(`newRow_${columnName}`, e.target.checked.toString())}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                        <span className="ml-3 text-sm text-slate-600">
                          {values[`newRow_${columnName}`] === 'true' || values[`newRow_${columnName}`] === true ? 'True' : 'False'}
                        </span>
                      </label>
                    </div>
                  ) : isDropdown ? (
                    // Dropdown field
                    <div className="relative">
                      <select
                        value={values[`newRow_${columnName}`] || ''}
                        onChange={(e) => setValue(`newRow_${columnName}`, e.target.value)}
                        className="w-full px-3 py-2 pr-10 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="">Select a value...</option>
                        {possibleDropdownValues.map(option => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                      <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none">
                        <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                      </div>
                    </div>
                  ) : isDate ? (
                    // Date field
                    <div>
                      {connectedFields.has(`newRow_${columnName}`) && workflowData && currentNodeId ? (
                        <VariableSelectionDropdown
                          workflowData={workflowData}
                          currentNodeId={currentNodeId}
                          value={values[`newRow_${columnName}`] || ''}
                          onChange={(val) => setValue(`newRow_${columnName}`, val)}
                          placeholder="Select a variable..."
                        />
                      ) : (
                        <input
                          type="date"
                          value={values[`newRow_${columnName}`] || ''}
                          onChange={(e) => setValue(`newRow_${columnName}`, e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      )}
                    </div>
                  ) : isEmail ? (
                    // Email field
                    <div>
                      {connectedFields.has(`newRow_${columnName}`) && workflowData && currentNodeId ? (
                        <VariableSelectionDropdown
                          workflowData={workflowData}
                          currentNodeId={currentNodeId}
                          value={values[`newRow_${columnName}`] || ''}
                          onChange={(val) => setValue(`newRow_${columnName}`, val)}
                          placeholder="Select a variable..."
                        />
                      ) : (
                        <input
                          type="email"
                          value={values[`newRow_${columnName}`] || ''}
                          onChange={(e) => setValue(`newRow_${columnName}`, e.target.value)}
                          placeholder="email@example.com"
                          className="w-full px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      )}
                    </div>
                  ) : isNumber ? (
                    // Number field
                    <div>
                      {connectedFields.has(`newRow_${columnName}`) && workflowData && currentNodeId ? (
                        <VariableSelectionDropdown
                          workflowData={workflowData}
                          currentNodeId={currentNodeId}
                          value={values[`newRow_${columnName}`] || ''}
                          onChange={(val) => setValue(`newRow_${columnName}`, val)}
                          placeholder="Select a variable..."
                        />
                      ) : (
                        <input
                          type="number"
                          value={values[`newRow_${columnName}`] || ''}
                          onChange={(e) => setValue(`newRow_${columnName}`, e.target.value)}
                          placeholder="0"
                          className="w-full px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      )}
                    </div>
                  ) : isUrl ? (
                    // URL field
                    <div>
                      {connectedFields.has(`newRow_${columnName}`) && workflowData && currentNodeId ? (
                        <VariableSelectionDropdown
                          workflowData={workflowData}
                          currentNodeId={currentNodeId}
                          value={values[`newRow_${columnName}`] || ''}
                          onChange={(val) => setValue(`newRow_${columnName}`, val)}
                          placeholder="Select a variable..."
                        />
                      ) : (
                        <input
                          type="url"
                          value={values[`newRow_${columnName}`] || ''}
                          onChange={(e) => setValue(`newRow_${columnName}`, e.target.value)}
                          placeholder="https://example.com"
                          className="w-full px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      )}
                    </div>
                  ) : (
                    // Default text field
                    <div>
                      {connectedFields.has(`newRow_${columnName}`) && workflowData && currentNodeId ? (
                        <VariableSelectionDropdown
                          workflowData={workflowData}
                          currentNodeId={currentNodeId}
                          value={values[`newRow_${columnName}`] || ''}
                          onChange={(val) => setValue(`newRow_${columnName}`, val)}
                          placeholder="Select a variable..."
                        />
                      ) : (
                        <input
                          type="text"
                          value={values[`newRow_${columnName}`] || ''}
                          onChange={(e) => setValue(`newRow_${columnName}`, e.target.value)}
                          placeholder="Enter text..."
                          className="w-full px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      )}
                    </div>
                  )}
                  
                  {/* Show column name as reference */}
                  <p className="mt-1 text-xs text-slate-500">
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