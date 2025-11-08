import React, { useState, useMemo, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { ProfessionalSearch } from "@/components/ui/professional-search";
import { RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface AirtableRecordsTableProps {
  records: any[];
  loading: boolean;
  selectedRecord?: any;
  selectedRecords?: any[]; // For multi-select mode
  onSelectRecord?: (record: any) => void;
  onSelectRecords?: (records: any[]) => void; // For multi-select mode
  onRefresh?: () => void;
  isPreview?: boolean;
  tableName?: string;
  multiSelect?: boolean; // Enable multi-select mode
  onRecordSelected?: () => void; // Callback after selection animation completes
}

export function AirtableRecordsTable({
  records,
  loading,
  selectedRecord,
  selectedRecords,
  onSelectRecord,
  onSelectRecords,
  onRefresh,
  isPreview = false,
  tableName = '',
  multiSelect = false,
  onRecordSelected
}: AirtableRecordsTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [recordsPerPage, setRecordsPerPage] = useState(20);
  const [showAll, setShowAll] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  // Filter records based on search query
  const filteredRecords = useMemo(() => {
    if (!searchQuery) return records;
    
    const query = searchQuery.toLowerCase();
    return records.filter(record => {
      // Search in ID
      if (record.id?.toLowerCase().includes(query)) return true;
      
      // Search in all field values
      if (record.fields) {
        return Object.values(record.fields).some(value => {
          const stringValue = renderFieldValue(value).toLowerCase();
          return stringValue.includes(query);
        });
      }
      return false;
    });
  }, [records, searchQuery]);

  // Get records to display based on showAll state
  const displayRecords = useMemo(() => {
    if (showAll) return filteredRecords;
    return filteredRecords.slice(0, recordsPerPage);
  }, [filteredRecords, recordsPerPage, showAll]);

  // Determine if we should show the "Show All" button
  const shouldShowToggle = filteredRecords.length > recordsPerPage && filteredRecords.length <= 50;

  // Get all unique field names from ALL records (not just displayed ones)
  const allFields = new Set<string>();
  records.forEach(record => {
    Object.keys(record.fields || {}).forEach(field => allFields.add(field));
  });
  const fieldNames = Array.from(allFields);

  // Handle record selection
  const handleRecordClick = (record: any) => {
    if (multiSelect && onSelectRecords) {
      // Multi-select mode: toggle record selection
      const currentSelected = selectedRecords || [];
      const isSelected = currentSelected.some(r => r.id === record.id);

      if (isSelected) {
        // Deselect: remove from array
        const newSelected = currentSelected.filter(r => r.id !== record.id);
        onSelectRecords(newSelected);
      } else {
        // Select: add to array (max 10 records for Airtable API limit)
        if (currentSelected.length < 10) {
          const newSelected = [...currentSelected, record];
          onSelectRecords(newSelected);
        }
      }
      // No auto-scroll for multi-select mode
    } else {
      // Single select mode (existing behavior)
      onSelectRecord?.(record);
      onRecordSelected?.();
    }
  };

  // Show loading state if explicitly loading OR if we have no records yet (to prevent flash of "no records")
  if (loading || records.length === 0) {
    return (
      <div className="bg-white rounded-lg overflow-hidden w-full max-w-full border border-gray-300" style={{ minWidth: 0 }}>
        {/* Header Section - Same as loaded state */}
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-300">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-gray-900 font-medium text-sm">
                {isPreview ? 'Preview Data' : `Select Record: ${tableName || 'Records'}`}
              </h3>
              <p className="text-gray-600 text-xs mt-0.5">
                Loading records...
              </p>
            </div>
          </div>
        </div>

        {/* Loading skeleton with fixed dimensions */}
        <div className="overflow-auto" style={{ maxHeight: '400px', minHeight: '200px' }}>
          <div className="animate-pulse">
            {/* Skeleton table structure */}
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <div className="flex gap-4">
                <div className="w-24 h-4 bg-gray-300 rounded"></div>
                <div className="w-32 h-4 bg-gray-300 rounded"></div>
                <div className="w-28 h-4 bg-gray-300 rounded"></div>
              </div>
            </div>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="px-4 py-3 border-b border-gray-200">
                <div className="flex gap-4">
                  <div className="w-20 h-4 bg-gray-300 rounded"></div>
                  <div className="w-36 h-4 bg-gray-300 rounded"></div>
                  <div className="w-24 h-4 bg-gray-300 rounded"></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Section */}
        <div className="bg-gray-50 px-4 py-3 border-t border-gray-300">
          <div className="text-xs text-gray-600">
            Loading table data...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg w-full border border-gray-300" style={{ maxWidth: '100%', overflow: 'hidden' }}>
      {/* Header Section - Same structure as loading state */}
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-300">
        <div className="flex items-center justify-between flex-wrap gap-2">
          {/* Title and subtitle */}
          <div className="min-w-0">
            <h3 className="text-gray-900 font-medium text-sm">
              {isPreview ? 'Preview Data' : `Select Record${multiSelect ? 's' : ''}: ${tableName || 'Records'}`}
            </h3>
            <p className="text-gray-600 text-xs mt-0.5">
              {showAll || displayRecords.length === filteredRecords.length
                ? `${filteredRecords.length} record${filteredRecords.length !== 1 ? 's' : ''}`
                : `Showing ${displayRecords.length} of ${filteredRecords.length} records`}
              {multiSelect ? ' • Click to select (max 10)' : ' • Click to select'}
            </p>
          </div>

          {/* Search and controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Search Bar */}
            <div className="w-52">
              <ProfessionalSearch
                placeholder="Search records..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClear={() => setSearchQuery('')}
                className="h-8 text-sm bg-white border-gray-300 text-gray-900 placeholder:text-gray-500"
              />
            </div>

            {/* Show All toggle button (only for tables with 21-50 records) */}
            {shouldShowToggle && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAll(!showAll)}
                className="h-8 px-3 text-xs bg-white border-gray-300 hover:bg-gray-50 text-gray-900"
              >
                {showAll ? `Show First ${recordsPerPage}` : `Show All ${filteredRecords.length}`}
              </Button>
            )}

            {/* Refresh button */}
            {onRefresh && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                className="text-gray-600 hover:text-gray-900 p-1"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Table Container with horizontal scroll */}
      <div className="w-full" style={{ maxHeight: '400px', overflowX: 'auto', overflowY: 'auto' }}>
        <table style={{ minWidth: '100%' }}>
            <thead className="sticky top-0 bg-gray-50 z-20">
              <tr className="border-b border-gray-300">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">
                  ID
                </th>
                {fieldNames.map(field => (
                  <th key={field} className="px-4 py-2.5 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">
                    {field}
                  </th>
                ))}
              </tr>
            </thead>
          <tbody className="divide-y divide-gray-200">
            {displayRecords.map((record, idx) => {
              const isSelected = multiSelect
                ? (selectedRecords || []).some(r => r.id === record.id)
                : selectedRecord?.id === record.id;

              return (
              <tr
                key={record.id}
                className={cn(
                  "hover:bg-blue-50 transition-all cursor-pointer",
                  idx % 2 === 0 ? "bg-white" : "bg-gray-50",
                  isSelected && "bg-blue-100 hover:bg-blue-100 border-l-4 border-blue-500"
                )}
                onClick={() => handleRecordClick(record)}
              >
                <td className="px-4 py-3 text-sm text-blue-600 whitespace-nowrap font-medium">
                  <span title={record.id}>
                    {record.id}
                  </span>
                </td>
                {fieldNames.map(field => {
                  const value = record.fields?.[field];
                  // Check if this is an image field
                  const isImage = value && (
                    (Array.isArray(value) && value[0]?.url) ||
                    (typeof value === 'object' && value.url)
                  );

                  return (
                    <td key={field} className="px-4 py-3 text-sm text-gray-900">
                      {isImage ? (
                        <div className="flex items-center gap-2">
                          {Array.isArray(value) ? (
                            value.slice(0, 3).map((img, idx) => (
                              <img
                                key={idx}
                                src={img.url || img.thumbnails?.small?.url || img.thumbnails?.large?.url}
                                alt={img.filename || 'Image'}
                                className="w-10 h-10 object-cover rounded border border-gray-300 flex-shrink-0"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            ))
                          ) : (
                            <img
                              src={value.url || value.thumbnails?.small?.url || value.thumbnails?.large?.url}
                              alt={value.filename || 'Image'}
                              className="w-10 h-10 object-cover rounded border border-gray-300 flex-shrink-0"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          )}
                          {Array.isArray(value) && value.length > 3 && (
                            <span className="text-xs text-gray-600 flex-shrink-0">+{value.length - 3}</span>
                          )}
                        </div>
                      ) : (
                        <div className="whitespace-nowrap" title={renderFieldValue(value)}>
                          {renderFieldValue(value)}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer Section */}
      <div className="bg-gray-50 px-4 py-3 border-t border-gray-300 flex items-center justify-between">
        <div className="text-xs text-gray-600">
          Total: {filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''} •
          Showing {recordsPerPage === -1 ? 'all' : `${Math.min(displayRecords.length, recordsPerPage)}`} of {fieldNames.length + 1} fields
        </div>

        {onRefresh && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            className="text-gray-600 hover:text-gray-900 flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        )}
      </div>
    </div>
  );
}

function renderFieldValue(value: any): string {
  if (value === null || value === undefined) return '';

  // Handle Airtable formula/rollup error states
  if (typeof value === 'object' && value !== null) {
    // Check if it's an error state object from formulas/rollups
    if ('state' in value && value.state === 'error') {
      // Return empty string or a placeholder for error states
      return value.errorType === 'emptyDependency' ? '—' : 'Error';
    }

    // Check if it has a specific value property (some Airtable field types)
    if ('value' in value) {
      return renderFieldValue(value.value);
    }
  }

  if (Array.isArray(value)) {
    return value.map(v => {
      if (typeof v === 'object' && v !== null) {
        // Handle attachment objects
        if (v.filename) return v.filename;
        // Handle linked records
        if (v.name) return v.name;
        // Handle other objects
        return renderFieldValue(v);
      }
      return String(v);
    }).filter(Boolean).join(', ');
  }

  if (typeof value === 'object') {
    // Handle attachment objects
    if (value.filename) return value.filename;
    // Handle linked records
    if (value.name) return value.name;
    // Last resort - stringify but try to make it readable
    try {
      return JSON.stringify(value, null, 0);
    } catch {
      return '[Complex Object]';
    }
  }

  return String(value);
}