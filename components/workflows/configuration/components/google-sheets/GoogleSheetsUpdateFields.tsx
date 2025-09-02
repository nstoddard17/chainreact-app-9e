"use client"

import React from "react";
import { Database } from "lucide-react";

interface GoogleSheetsUpdateFieldsProps {
  values: Record<string, any>;
  setValue: (key: string, value: any) => void;
  selectedRows: Set<string>;
  previewData: any[];
  hasHeaders: boolean;
  action: string;
}

export function GoogleSheetsUpdateFields({
  values,
  setValue,
  selectedRows,
  previewData,
  hasHeaders,
  action
}: GoogleSheetsUpdateFieldsProps) {
  // Only show for update action when rows are selected
  if (action !== 'update' || selectedRows.size === 0) {
    return null;
  }

  // Single row selected - show all columns as editable fields
  if (selectedRows.size === 1) {
    const selectedRowId = Array.from(selectedRows)[0];
    const selectedRowData = previewData.find((row: any) => row.id === selectedRowId);
    
    if (!selectedRowData) return null;
    
    return (
      <div className="mt-4 space-y-4">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-slate-700 mb-3">
                Update Row {selectedRowData.rowNumber}
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Edit the fields below. Only modified fields will be updated.
              </p>
            </div>
            
            {/* Display all columns as individual fields */}
            <div className="space-y-3">
              {Object.entries(selectedRowData.fields || {}).map(([columnName, currentValue]) => {
                // Detect field type based on value characteristics
                const isImageUrl = typeof currentValue === 'string' && 
                  (currentValue.startsWith('http') && 
                   (currentValue.includes('.jpg') || currentValue.includes('.jpeg') || 
                    currentValue.includes('.png') || currentValue.includes('.gif') || 
                    currentValue.includes('.webp') || currentValue.includes('.svg')));
                
                const isUrl = typeof currentValue === 'string' && 
                  (currentValue.startsWith('http://') || currentValue.startsWith('https://'));
                
                const isEmail = typeof currentValue === 'string' && 
                  currentValue.includes('@') && currentValue.includes('.');
                
                const isBoolean = typeof currentValue === 'boolean' || 
                  (typeof currentValue === 'string' && 
                   (currentValue.toLowerCase() === 'true' || currentValue.toLowerCase() === 'false'));
                
                const isNumber = typeof currentValue === 'number' || 
                  (typeof currentValue === 'string' && !isNaN(Number(currentValue)) && currentValue !== '');
                
                const isDate = typeof currentValue === 'string' && 
                  !isNaN(Date.parse(currentValue)) && 
                  (currentValue.includes('-') || currentValue.includes('/'));
                
                // Check if it looks like a dropdown value (has specific patterns)
                const possibleDropdownValues = ['Active', 'Inactive', 'Pending', 'Completed', 'Yes', 'No', 'High', 'Medium', 'Low'];
                const isDropdown = typeof currentValue === 'string' && 
                  possibleDropdownValues.includes(currentValue);
                
                return (
                  <div key={columnName}>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      {hasHeaders ? columnName : `Column ${columnName}`}
                    </label>
                    
                    {/* Image field */}
                    {isImageUrl ? (
                      <div className="space-y-2">
                        <div className="border border-slate-200 rounded-md p-2 bg-white">
                          <img 
                            src={String(currentValue)} 
                            alt={columnName}
                            className="max-h-32 max-w-full object-contain"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                        <div className="relative">
                          <input
                            type="url"
                            value={values[`column_${columnName}`] !== undefined 
                              ? values[`column_${columnName}`] 
                              : String(currentValue || '')}
                            onChange={(e) => setValue(`column_${columnName}`, e.target.value)}
                            placeholder="Enter image URL or drag a variable"
                            className="w-full px-3 py-2 pr-10 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                          />
                          <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    ) : isBoolean ? (
                      // Boolean field - show as toggle/checkbox
                      <div className="flex items-center space-x-3">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={values[`column_${columnName}`] !== undefined 
                              ? values[`column_${columnName}`] === 'true' || values[`column_${columnName}`] === true
                              : currentValue === 'true' || currentValue === true}
                            onChange={(e) => setValue(`column_${columnName}`, e.target.checked.toString())}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                          <span className="ml-3 text-sm text-slate-600">
                            {values[`column_${columnName}`] !== undefined 
                              ? (values[`column_${columnName}`] === 'true' || values[`column_${columnName}`] === true ? 'True' : 'False')
                              : (currentValue === 'true' || currentValue === true ? 'True' : 'False')}
                          </span>
                        </label>
                      </div>
                    ) : isDropdown ? (
                      // Dropdown field - show as select
                      <div className="relative">
                        <select
                          value={values[`column_${columnName}`] !== undefined 
                            ? values[`column_${columnName}`] 
                            : String(currentValue || '')}
                          onChange={(e) => setValue(`column_${columnName}`, e.target.value)}
                          className="w-full px-3 py-2 pr-10 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        >
                          <option value={String(currentValue)}>{String(currentValue)}</option>
                          {possibleDropdownValues
                            .filter(v => v !== String(currentValue))
                            .map(option => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          <option value="">Clear value</option>
                        </select>
                        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none">
                          <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                          </svg>
                        </div>
                      </div>
                    ) : isDate ? (
                      // Date field
                      <div className="relative">
                        <input
                          type="date"
                          value={values[`column_${columnName}`] !== undefined 
                            ? values[`column_${columnName}`] 
                            : String(currentValue || '').split('T')[0]}
                          onChange={(e) => setValue(`column_${columnName}`, e.target.value)}
                          className="w-full px-3 py-2 pr-10 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none">
                          <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                          </svg>
                        </div>
                      </div>
                    ) : isEmail ? (
                      // Email field
                      <div className="relative">
                        <input
                          type="email"
                          value={values[`column_${columnName}`] !== undefined 
                            ? values[`column_${columnName}`] 
                            : String(currentValue || '')}
                          onChange={(e) => setValue(`column_${columnName}`, e.target.value)}
                          placeholder="Enter email or drag a variable"
                          className="w-full px-3 py-2 pr-10 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                        <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                          <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                          </svg>
                        </div>
                      </div>
                    ) : isNumber ? (
                      // Number field
                      <div className="relative">
                        <input
                          type="number"
                          value={values[`column_${columnName}`] !== undefined 
                            ? values[`column_${columnName}`] 
                            : String(currentValue || '')}
                          onChange={(e) => setValue(`column_${columnName}`, e.target.value)}
                          placeholder="Enter number or drag a variable"
                          className="w-full px-3 py-2 pr-10 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                        <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                          <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                          </svg>
                        </div>
                      </div>
                    ) : isUrl ? (
                      // URL field (non-image)
                      <div className="relative">
                        <input
                          type="url"
                          value={values[`column_${columnName}`] !== undefined 
                            ? values[`column_${columnName}`] 
                            : String(currentValue || '')}
                          onChange={(e) => setValue(`column_${columnName}`, e.target.value)}
                          placeholder="Enter URL or drag a variable"
                          className="w-full px-3 py-2 pr-10 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                        <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                          <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                          </svg>
                        </div>
                      </div>
                    ) : (
                      // Default text field
                      <div className="relative">
                        <input
                          type="text"
                          value={values[`column_${columnName}`] !== undefined 
                            ? values[`column_${columnName}`] 
                            : String(currentValue || '')}
                          onChange={(e) => setValue(`column_${columnName}`, e.target.value)}
                          placeholder="Enter new value or drag a variable"
                          className="w-full px-3 py-2 pr-10 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                        <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                          <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Multiple rows selected - show column selector for bulk update
  return (
    <div className="mt-4 space-y-4">
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-2">
              Bulk Update {selectedRows.size} Rows
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Select columns to update. The same value will be applied to all selected rows.
            </p>
          </div>
          
          {/* Column Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Which column do you want to modify?
            </label>
            <select
              value={values.columnToUpdate || ''}
              onChange={(e) => setValue('columnToUpdate', e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a column...</option>
              {previewData[0]?.fields && Object.keys(previewData[0].fields).map((columnName) => (
                <option key={columnName} value={columnName}>
                  {hasHeaders ? columnName : `Column ${columnName}`}
                </option>
              ))}
            </select>
          </div>
          
          {/* Value Input Field - Show after column selection */}
          {values.columnToUpdate && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                New value for {hasHeaders ? values.columnToUpdate : `Column ${values.columnToUpdate}`}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={values[`updateValue_${values.columnToUpdate}`] || ''}
                  onChange={(e) => setValue(`updateValue_${values.columnToUpdate}`, e.target.value)}
                  placeholder="Enter new value or drag a variable from the right panel"
                  className="w-full px-3 py-2 pr-10 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                This value will be applied to all {selectedRows.size} selected rows
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}