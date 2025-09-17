"use client"

import React from "react";
import { Button } from "@/components/ui/button";
import { Database, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { filterRecordsbySearch, formatFieldValue } from "../../utils/helpers";
import { cn } from "@/lib/utils";

interface AirtableRecordSelectorProps {
  records: any[];
  selectedRecord: any;
  loadingRecords: boolean;
  searchQuery: string;
  displayCount: number;
  showTable: boolean;
  tableName?: string;
  onLoadRecords: () => void;
  onSelectRecord: (record: any) => void;
  onSearchChange: (query: string) => void;
  onDisplayCountChange: (count: number) => void;
  onToggleTable: () => void;
}

export function AirtableRecordSelector({
  records,
  selectedRecord,
  loadingRecords,
  searchQuery,
  displayCount,
  showTable,
  tableName,
  onLoadRecords,
  onSelectRecord,
  onSearchChange,
  onDisplayCountChange,
  onToggleTable
}: AirtableRecordSelectorProps) {
  // Filter records based on search
  const filteredRecords = filterRecordsbySearch(records, searchQuery);
  
  // Apply pagination
  const paginatedRecords = displayCount === -1 
    ? filteredRecords 
    : filteredRecords.slice(0, displayCount);
  
  // Get column headers from first record - show ALL columns
  const columns = filteredRecords.length > 0 && filteredRecords[0].fields
    ? Object.keys(filteredRecords[0].fields).filter(key =>
        !key.startsWith('_') && key !== 'id'
      ) // Removed .slice(0, 5) to show all columns
    : [];

  // Remove fixed widths to allow natural table expansion

  return (
    <div className="mt-4 space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-700 mb-3">
          Select a record from {tableName || 'the table'} to update. Click "Show Records" to browse and select.
        </p>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={showTable ? onToggleTable : onLoadRecords}
            disabled={loadingRecords}
            className="flex items-center gap-2"
          >
            {loadingRecords ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
            ) : (
              <Database className="h-4 w-4" />
            )}
            {loadingRecords ? 'Loading...' : showTable ? 'Hide Records' : 'Show Records'}
          </Button>
          {selectedRecord && (
            <Badge variant="secondary" className="px-3">
              Selected: {selectedRecord.id}
            </Badge>
          )}
        </div>
      </div>

      {/* Records Table */}
      {showTable && !loadingRecords && (
        <div className="border border-slate-200 rounded-lg bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 rounded-t-lg">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-sm font-medium text-slate-900">
                  Select Record from {tableName}
                </h3>
                <p className="text-xs text-slate-600">
                  {filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''} 
                  {searchQuery ? ' found' : ' available'}
                </p>
              </div>
              
              <div className="flex items-center gap-2">
                {/* Search Input */}
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="Search records..."
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="h-7 w-48 pl-7 pr-2 text-xs"
                  />
                </div>
                
                {/* Display Count Selector */}
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-600">Show:</span>
                  <select
                    value={displayCount}
                    onChange={(e) => onDisplayCountChange(parseInt(e.target.value))}
                    className="h-7 px-2 text-xs border border-slate-200 rounded"
                  >
                    <option value="10">10</option>
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                    <option value="-1">All</option>
                  </select>
                </div>
                
                {/* Close Button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onToggleTable}
                  className="h-7 w-7 p-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
          
          {/* Table */}
          <div className="max-h-[400px] overflow-auto">
            <table className="w-full min-w-full border-collapse">
              <thead className="sticky top-0 bg-slate-50 z-10 border-b">
                <tr>
                  <th className="text-left text-xs px-3 py-2 font-medium text-slate-700 border-r">
                    Record ID
                  </th>
                  {columns.map((column) => (
                    <th
                      key={column}
                      className="text-left text-xs px-3 py-2 font-medium text-slate-700 border-r"
                    >
                      {column}
                    </th>
                  ))}
                  <th className="text-center text-xs px-3 py-2 font-medium text-slate-700">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedRecords.map((record) => {
                  const isSelected = selectedRecord?.id === record.id;
                  return (
                    <tr
                      key={record.id}
                      className={cn(
                        "border-b cursor-pointer hover:bg-slate-50 transition-colors",
                        isSelected && "bg-blue-50 hover:bg-blue-100"
                      )}
                      onClick={() => onSelectRecord(record)}
                    >
                      <td className="text-xs font-mono px-3 py-2 border-r">
                        <div className="truncate max-w-[150px]" title={record.id}>
                          {record.id}
                        </div>
                      </td>
                      {columns.map((column) => (
                        <td
                          key={column}
                          className="text-xs px-3 py-2 border-r"
                        >
                          <div
                            className="truncate max-w-[200px]"
                            title={formatFieldValue(record.fields[column])}
                          >
                            {formatFieldValue(record.fields[column])}
                          </div>
                        </td>
                      ))}
                      <td className="text-center px-3 py-2">
                        <Button
                          type="button"
                          variant={isSelected ? "default" : "outline"}
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectRecord(record);
                          }}
                          className="h-6 px-2 text-xs"
                        >
                          {isSelected ? 'Selected' : 'Select'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}