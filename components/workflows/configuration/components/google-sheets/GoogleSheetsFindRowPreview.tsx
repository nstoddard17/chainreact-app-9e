"use client"

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Search, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useIntegrationStore } from '@/stores/integrationStore';
import { logger } from '@/lib/utils/logger';

interface GoogleSheetsFindRowPreviewProps {
  values: Record<string, any>;
  fieldKey: string;
}

export function GoogleSheetsFindRowPreview({
  values,
  fieldKey
}: GoogleSheetsFindRowPreviewProps) {
  const [loading, setLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const { getIntegrationByProvider } = useIntegrationStore();

  // Handle test search
  const handleTestSearch = async () => {
    if (!values.spreadsheetId || !values.sheetName || !values.searchColumn || !values.searchValue) {
      setError("Please complete all search fields first");
      return;
    }

    setLoading(true);
    setError(null);
    setSearchResult(null);

    try {
      logger.debug('🔍 Testing Find Row search...', {
        spreadsheetId: values.spreadsheetId,
        sheetName: values.sheetName,
        searchColumn: values.searchColumn,
        searchValue: values.searchValue,
        matchType: values.matchType || 'exact'
      });

      // Get the Google Sheets integration
      const googleSheetsIntegration = getIntegrationByProvider('google-sheets');
      if (!googleSheetsIntegration) {
        throw new Error('Google Sheets integration not found');
      }

      // Fetch all rows to search through
      const response = await fetch('/api/integrations/google-sheets/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId: googleSheetsIntegration.id,
          dataType: 'google-sheets_records',
          options: {
            spreadsheetId: values.spreadsheetId,
            sheetName: values.sheetName,
            maxRows: 1000,
            includeHeaders: true
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch sheet data');
      }

      const result = await response.json();
      const rows = result.data || [];

      logger.debug('🔍 Search data loaded:', { rowCount: rows.length });

      // Perform search based on match type
      const matchType = values.matchType || 'exact';
      const searchValue = values.searchValue.toLowerCase().trim();

      const foundRow = rows.find((row: any) => {
        const cellValue = row.fields[values.searchColumn];
        if (cellValue === null || cellValue === undefined) return false;

        const cellValueStr = String(cellValue).toLowerCase().trim();

        switch (matchType) {
          case 'exact':
            return cellValueStr === searchValue;
          case 'contains':
            return cellValueStr.includes(searchValue);
          case 'starts_with':
            return cellValueStr.startsWith(searchValue);
          default:
            return cellValueStr === searchValue;
        }
      });

      if (foundRow) {
        logger.debug('✅ Row found:', foundRow);
        setSearchResult({
          found: true,
          rowNumber: foundRow.rowNumber,
          rowData: foundRow.fields
        });
      } else {
        logger.debug('❌ No matching row found');
        setSearchResult({
          found: false,
          message: 'No matching row found'
        });
      }

    } catch (err: any) {
      logger.error('Error testing search:', err);
      setError(err.message || 'Failed to test search');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div key={fieldKey} className="mt-4 space-y-4">
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-sm font-medium text-slate-900 mb-1">
              Test Your Search
            </h3>
            <p className="text-xs text-slate-600">
              Click "Test Search" to preview which row will be found based on your search criteria
            </p>
          </div>
          <Button
            type="button"
            onClick={handleTestSearch}
            disabled={loading || !values.searchValue}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            {loading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent"></div>
                Searching...
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Test Search
              </>
            )}
          </Button>
        </div>

        {/* Search Summary */}
        {values.searchColumn && values.searchValue && (
          <div className="mt-3 p-3 bg-white border border-slate-200 rounded-md">
            <p className="text-xs text-slate-600 mb-2">Search Criteria:</p>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">Column:</span>
                <span className="font-mono font-medium text-slate-900">{values.searchColumn}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">Value:</span>
                <span className="font-mono font-medium text-slate-900">{values.searchValue}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">Match:</span>
                <span className="font-medium text-slate-900">
                  {values.matchType === 'exact' && 'Exact Match'}
                  {values.matchType === 'contains' && 'Contains'}
                  {values.matchType === 'starts_with' && 'Starts With'}
                  {!values.matchType && 'Exact Match (default)'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-red-900">Search Failed</h4>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Search Result - Row Found */}
      {searchResult && searchResult.found && (
        <div className="border border-green-200 rounded-lg bg-white shadow-sm">
          <div className="border-b border-green-200 bg-green-50 px-4 py-3 rounded-t-lg">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <h3 className="text-sm font-medium text-green-900">
                  Match Found!
                </h3>
                <p className="text-xs text-green-700 mt-0.5">
                  Row {searchResult.rowNumber} matches your search criteria
                </p>
              </div>
            </div>
          </div>

          {/* Display row data */}
          <div className="p-4">
            <p className="text-xs font-medium text-slate-700 mb-3">Row Data:</p>
            <div className="max-h-[300px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Column</TableHead>
                    <TableHead className="text-xs">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(searchResult.rowData).map(([column, value]) => {
                    const isSearchColumn = column === values.searchColumn;
                    return (
                      <TableRow
                        key={column}
                        className={isSearchColumn ? 'bg-green-50' : ''}
                      >
                        <TableCell className={`text-xs font-medium ${isSearchColumn ? 'text-green-900' : 'text-slate-700'}`}>
                          {column}
                          {isSearchColumn && (
                            <span className="ml-2 text-xs text-green-600">(matched)</span>
                          )}
                        </TableCell>
                        <TableCell className={`text-xs font-mono ${isSearchColumn ? 'text-green-900 font-medium' : 'text-slate-600'}`}>
                          {value !== null && value !== undefined ? String(value) : '(empty)'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      {/* Search Result - No Match */}
      {searchResult && !searchResult.found && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <XCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-amber-900">No Match Found</h4>
              <p className="text-sm text-amber-700 mt-1">
                No rows match your search criteria. The workflow will return <code className="px-1 py-0.5 bg-amber-100 rounded text-xs">found: false</code> when executed.
              </p>
              <div className="mt-3 p-3 bg-white border border-amber-200 rounded text-xs text-amber-800">
                <p className="font-medium mb-1">Suggestions:</p>
                <ul className="list-disc list-inside space-y-1 text-amber-700">
                  <li>Try using "Contains" or "Starts With" match type</li>
                  <li>Check for extra spaces or case differences</li>
                  <li>Verify you're searching in the correct column</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
