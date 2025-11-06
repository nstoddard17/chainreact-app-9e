import React, { useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { ProfessionalSearch } from "@/components/ui/professional-search";
import { RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface AirtableRecordsTableProps {
  records: any[];
  loading: boolean;
  selectedRecord?: any;
  onSelectRecord?: (record: any) => void;
  onRefresh?: () => void;
  isPreview?: boolean;
  tableName?: string;
}

export function AirtableRecordsTable({
  records,
  loading,
  selectedRecord,
  onSelectRecord,
  onRefresh,
  isPreview = false,
  tableName = ''
}: AirtableRecordsTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [recordsPerPage, setRecordsPerPage] = useState(10);

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

  // Get records to display based on recordsPerPage setting
  const displayRecords = useMemo(() => {
    if (recordsPerPage === -1) return filteredRecords;
    return filteredRecords.slice(0, recordsPerPage);
  }, [filteredRecords, recordsPerPage]);

  // Get all unique field names from ALL records (not just displayed ones)
  const allFields = new Set<string>();
  records.forEach(record => {
    Object.keys(record.fields || {}).forEach(field => allFields.add(field));
  });
  const fieldNames = Array.from(allFields);

  if (loading) {
    return (
      <div className="bg-gray-900 rounded-lg overflow-hidden w-full max-w-full" style={{ minWidth: 0 }}>
        {/* Header Section - Same as loaded state */}
        <div className="bg-gray-800 px-4 py-3 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-white font-medium">
                {isPreview ? 'Preview Data' : `Select Record: ${tableName || 'Records'}`}
              </h3>
              <p className="text-gray-400 text-sm mt-0.5">
                Loading records...
              </p>
            </div>
          </div>
        </div>

        {/* Loading skeleton with fixed dimensions */}
        <div className="overflow-auto" style={{ maxHeight: '400px', minHeight: '200px' }}>
          <div className="animate-pulse">
            {/* Skeleton table structure */}
            <div className="bg-gray-800 px-4 py-3 border-b border-gray-700">
              <div className="flex gap-4">
                <div className="w-24 h-4 bg-gray-700 rounded"></div>
                <div className="w-32 h-4 bg-gray-700 rounded"></div>
                <div className="w-28 h-4 bg-gray-700 rounded"></div>
              </div>
            </div>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="px-4 py-3 border-b border-gray-800">
                <div className="flex gap-4">
                  <div className="w-20 h-4 bg-gray-700 rounded"></div>
                  <div className="w-36 h-4 bg-gray-700 rounded"></div>
                  <div className="w-24 h-4 bg-gray-700 rounded"></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Section */}
        <div className="bg-gray-800 px-4 py-3 border-t border-gray-700">
          <div className="text-sm text-gray-400">
            Loading table data...
          </div>
        </div>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 bg-gray-900 rounded-lg w-full max-w-full" style={{ minWidth: 0 }}>
        No records found in this table.
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-lg w-full" style={{ maxWidth: '100%', overflow: 'hidden' }}>
      {/* Header Section - Same structure as loading state */}
      <div className="bg-gray-800 px-4 py-3 border-b border-gray-700">
        <div className="flex items-center justify-between flex-wrap gap-2">
          {/* Title and subtitle */}
          <div className="min-w-0">
            <h3 className="text-white font-medium">
              {isPreview ? 'Preview Data' : `Select Record: ${tableName || 'Records'}`}
            </h3>
            <p className="text-gray-400 text-sm mt-0.5">
              {filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''} • Click to select
            </p>
          </div>

          {/* Search and controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Search Bar */}
            <div className="w-40">
              <ProfessionalSearch
                placeholder="Search records..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClear={() => setSearchQuery('')}
                className="h-8 text-sm bg-gray-800 border-gray-600 text-gray-200 placeholder:text-gray-500"
              />
            </div>

            {/* Records per page selector */}
            <select
              value={recordsPerPage}
              onChange={(e) => setRecordsPerPage(Number(e.target.value))}
              className="px-3 py-1.5 text-sm bg-gray-800 border border-gray-600 rounded text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value={5}>Show 5</option>
              <option value={10}>Show 10</option>
              <option value={20}>Show 20</option>
              <option value={50}>Show 50</option>
              <option value={100}>Show 100</option>
              <option value={-1}>Show All</option>
            </select>

            {/* Close button (if in modal context) */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-gray-400 hover:text-white p-1"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Table Container with horizontal scroll */}
      <div className="w-full" style={{ maxHeight: '400px', overflowX: 'auto', overflowY: 'auto' }}>
        <table style={{ minWidth: '100%' }}>
            <thead className="sticky top-0 bg-gray-800 z-20">
              <tr className="border-b border-gray-700">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  ID
                </th>
                {fieldNames.map(field => (
                  <th key={field} className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider whitespace-nowrap">
                    {field}
                  </th>
                ))}
              </tr>
            </thead>
          <tbody className="divide-y divide-gray-800">
            {displayRecords.map((record, idx) => (
              <tr
                key={record.id}
                className={cn(
                  "hover:bg-gray-800 transition-colors cursor-pointer",
                  idx % 2 === 0 ? "bg-gray-900" : "bg-gray-850",
                  selectedRecord?.id === record.id && "bg-blue-900 bg-opacity-30 hover:bg-blue-900 hover:bg-opacity-40"
                )}
                onClick={() => onSelectRecord?.(record)}
              >
                <td className="px-4 py-3 text-sm text-blue-400 whitespace-nowrap">
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
                    <td key={field} className="px-4 py-3 text-sm text-gray-300">
                      {isImage ? (
                        <div className="flex items-center gap-2">
                          {Array.isArray(value) ? (
                            value.slice(0, 3).map((img, idx) => (
                              <img
                                key={idx}
                                src={img.url || img.thumbnails?.small?.url || img.thumbnails?.large?.url}
                                alt={img.filename || 'Image'}
                                className="w-10 h-10 object-cover rounded border border-gray-600 flex-shrink-0"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            ))
                          ) : (
                            <img
                              src={value.url || value.thumbnails?.small?.url || value.thumbnails?.large?.url}
                              alt={value.filename || 'Image'}
                              className="w-10 h-10 object-cover rounded border border-gray-600 flex-shrink-0"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          )}
                          {Array.isArray(value) && value.length > 3 && (
                            <span className="text-xs text-gray-500 flex-shrink-0">+{value.length - 3}</span>
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
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer Section */}
      <div className="bg-gray-800 px-4 py-3 border-t border-gray-700 flex items-center justify-between">
        <div className="text-sm text-gray-400">
          Total: {filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''} • 
          Showing {recordsPerPage === -1 ? 'all' : `${Math.min(displayRecords.length, recordsPerPage)}`} of {fieldNames.length + 1} fields
        </div>
        
        {onRefresh && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            className="text-gray-400 hover:text-white flex items-center gap-2"
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