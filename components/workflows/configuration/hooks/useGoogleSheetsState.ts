import { useState, useCallback } from 'react';
import { useIntegrationStore } from '@/stores/integrationStore';

interface UseGoogleSheetsStateProps {
  nodeInfo: any;
  values: Record<string, any>;
}

export function useGoogleSheetsState({ nodeInfo, values }: UseGoogleSheetsStateProps) {
  const [showPreviewData, setShowPreviewData] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [tableSearchQuery, setTableSearchQuery] = useState('');
  const [tableDisplayCount, setTableDisplayCount] = useState(10);
  const [googleSheetsSortField, setGoogleSheetsSortField] = useState<string | null>(null);
  const [googleSheetsSortDirection, setGoogleSheetsSortDirection] = useState<'asc' | 'desc'>('asc');
  const [googleSheetsSelectedRows, setGoogleSheetsSelectedRows] = useState<Set<string>>(new Set());
  const [googleSheetsHasHeaders, setGoogleSheetsHasHeaders] = useState(true);
  
  const { getIntegrationByProvider } = useIntegrationStore();
  
  // Check if this is a Google Sheets action
  const isGoogleSheetsAction = nodeInfo?.providerId === 'google-sheets';
  const isUpdateAction = values.action === 'update';
  const isDeleteAction = values.action === 'delete';
  
  // Load Google Sheets preview data
  const loadGoogleSheetsPreviewData = useCallback(async (spreadsheetId: string, sheetName: string, hasHeaders: boolean = true) => {
    try {
      setLoadingPreview(true);
      
      const integration = getIntegrationByProvider('google');
      if (!integration) {
        console.warn('No Google integration found');
        return;
      }

      console.log('🔍 Loading Google Sheets preview data:', { spreadsheetId, sheetName, hasHeaders });
      
      const response = await fetch('/api/integrations/google-sheets/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          integrationId: integration.id,
          dataType: 'sheet_data',
          params: {
            spreadsheetId,
            sheetName,
            hasHeaders
          }
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Failed to load sheet data:', error);
        throw new Error(`Failed to load sheet data: ${error}`);
      }

      const data = await response.json();
      console.log('✅ Loaded', data.length, 'rows from sheet');
      
      // Transform data to match expected format with fields
      const transformedData = data.map((row: any, index: number) => ({
        id: `row-${index + 1}`,
        rowNumber: index + 1 + (hasHeaders ? 1 : 0), // Add 1 if headers exist
        fields: row
      }));
      
      setPreviewData(transformedData);
      setShowPreviewData(true);
    } catch (error) {
      console.error('Error loading sheet data:', error);
      setPreviewData([]);
    } finally {
      setLoadingPreview(false);
    }
  }, [getIntegrationByProvider]);
  
  // Handle row selection for update
  const handleRowSelect = useCallback((row: any) => {
    console.log('Selected row for update:', row);
    // You can add logic here to populate form fields with row data
  }, []);
  
  // Handle row selection for deletion
  const handleRowToggle = useCallback((rowId: string, selected: boolean) => {
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
  const handleSelectAll = useCallback((selected: boolean, rows: any[]) => {
    if (selected) {
      setGoogleSheetsSelectedRows(new Set(rows.map(r => r.id)));
    } else {
      setGoogleSheetsSelectedRows(new Set());
    }
  }, []);
  
  // Toggle preview visibility
  const togglePreviewData = useCallback(() => {
    if (showPreviewData) {
      setShowPreviewData(false);
      setPreviewData([]);
      setTableSearchQuery('');
      setGoogleSheetsSelectedRows(new Set());
    } else if (values.spreadsheetId && values.sheetName) {
      loadGoogleSheetsPreviewData(values.spreadsheetId, values.sheetName, googleSheetsHasHeaders);
    }
  }, [showPreviewData, values.spreadsheetId, values.sheetName, googleSheetsHasHeaders, loadGoogleSheetsPreviewData]);
  
  // Handle headers toggle
  const handleHasHeadersChange = useCallback((hasHeaders: boolean) => {
    setGoogleSheetsHasHeaders(hasHeaders);
    // Reload data with new headers setting if preview is open
    if (showPreviewData && values.spreadsheetId && values.sheetName) {
      loadGoogleSheetsPreviewData(values.spreadsheetId, values.sheetName, hasHeaders);
    }
  }, [showPreviewData, values.spreadsheetId, values.sheetName, loadGoogleSheetsPreviewData]);
  
  return {
    // State
    showPreviewData,
    previewData,
    loadingPreview,
    tableSearchQuery,
    tableDisplayCount,
    googleSheetsSortField,
    googleSheetsSortDirection,
    googleSheetsSelectedRows,
    googleSheetsHasHeaders,
    isGoogleSheetsAction,
    isUpdateAction,
    isDeleteAction,
    
    // Actions
    setShowPreviewData,
    setPreviewData,
    setTableSearchQuery,
    setTableDisplayCount,
    setGoogleSheetsSortField,
    setGoogleSheetsSortDirection,
    setGoogleSheetsSelectedRows,
    setGoogleSheetsHasHeaders,
    loadGoogleSheetsPreviewData,
    handleRowSelect,
    handleRowToggle,
    handleSelectAll,
    togglePreviewData,
    handleHasHeadersChange
  };
}