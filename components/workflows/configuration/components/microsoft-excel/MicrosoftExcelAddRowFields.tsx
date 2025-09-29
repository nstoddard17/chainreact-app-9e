"use client"

import React from "react";
import { LightningLoader } from '@/components/ui/lightning-loader';

interface MicrosoftExcelAddRowFieldsProps {
  values: Record<string, any>;
  setValue: (key: string, value: any) => void;
  previewData: any[];
  hasHeaders: boolean;
  action: string;
  showPreviewData: boolean;
  loadingPreview?: boolean;
}

export function MicrosoftExcelAddRowFields({
  values,
  setValue,
  previewData,
  hasHeaders,
  action,
  showPreviewData,
  loadingPreview = false
}: MicrosoftExcelAddRowFieldsProps) {
  // Only show for add action
  if (action !== 'add') {
    return null;
  }

  // Show loading state while fetching column data
  if (loadingPreview || (!showPreviewData && values.workbookId && values.worksheetName)) {
    return (
      <div className="mt-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex flex-col items-center justify-center space-y-4">
            <LightningLoader size="md" color="blue" />
            <div className="text-center">
              <p className="text-sm font-medium text-blue-900">Preparing column fields...</p>
              <p className="text-xs text-blue-700 mt-1">
                Analyzing your worksheet "{values.worksheetName}" to create input fields for each column
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Don't show anything if we don't have preview data yet
  if (!showPreviewData || previewData.length === 0) {
    return null;
  }

  // Get column names from the first row of preview data
  const columns = previewData[0]?.fields ? Object.keys(previewData[0].fields) : [];

  return (
    <div className="mt-4 space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-blue-900 mb-3">
              Add New Row {values.insertPosition === 'specific_row' && values.specificRow ? `at Row ${values.specificRow}` :
                          values.insertPosition === 'prepend' ? 'at Beginning' : 'at End of Worksheet'}
            </h3>
            <p className="text-xs text-blue-700 mb-4">
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {hasHeaders ? columnName : `Column ${columnName}`}
                  </label>

                  {/* Image field */}
                  {isImageUrl ? (
                    <div className="relative">
                      <input
                        type="url"
                        value={values[`newRow_${columnName}`] || ''}
                        onChange={(e) => setValue(`newRow_${columnName}`, e.target.value)}
                        placeholder="Enter image URL or drag a variable"
                        className="w-full px-3 py-2 pr-10 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                      />
                      <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                        <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                      </div>
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
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
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
                        {possibleDropdownValues.map(val => (
                          <option key={val} value={val}>{val}</option>
                        ))}
                      </select>
                    </div>
                  ) : isDate ? (
                    // Date field
                    <input
                      type="date"
                      value={values[`newRow_${columnName}`] || ''}
                      onChange={(e) => setValue(`newRow_${columnName}`, e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  ) : isNumber ? (
                    // Number field
                    <input
                      type="number"
                      value={values[`newRow_${columnName}`] || ''}
                      onChange={(e) => setValue(`newRow_${columnName}`, e.target.value)}
                      placeholder="Enter number or drag a variable"
                      className="w-full px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  ) : isEmail ? (
                    // Email field
                    <input
                      type="email"
                      value={values[`newRow_${columnName}`] || ''}
                      onChange={(e) => setValue(`newRow_${columnName}`, e.target.value)}
                      placeholder="Enter email or drag a variable"
                      className="w-full px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  ) : isUrl ? (
                    // URL field
                    <input
                      type="url"
                      value={values[`newRow_${columnName}`] || ''}
                      onChange={(e) => setValue(`newRow_${columnName}`, e.target.value)}
                      placeholder="Enter URL or drag a variable"
                      className="w-full px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  ) : (
                    // Default text field
                    <input
                      type="text"
                      value={values[`newRow_${columnName}`] || ''}
                      onChange={(e) => setValue(`newRow_${columnName}`, e.target.value)}
                      placeholder="Enter text or drag a variable"
                      className="w-full px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  )}

                  <p className="mt-1 text-xs text-slate-500">
                    {isImageUrl ? 'Image URL expected' :
                     isBoolean ? 'True or False value' :
                     isNumber ? 'Number value expected' :
                     isDate ? 'Date value expected' :
                     isEmail ? 'Email address expected' :
                     isUrl ? 'URL expected' :
                     'Text value'}
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