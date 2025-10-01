"use client"

import React from "react";

interface MicrosoftExcelUpdateFieldsProps {
  values: Record<string, any>;
  setValue: (key: string, value: any) => void;
  previewData: any[];
  hasHeaders: boolean;
  action: string;
  selectedRow: any | null;
}

export function MicrosoftExcelUpdateFields({
  values,
  setValue,
  previewData,
  hasHeaders,
  action,
  selectedRow
}: MicrosoftExcelUpdateFieldsProps) {
  // Get column names from the selected row
  const columns = selectedRow?.fields ? Object.keys(selectedRow.fields).filter(key => !key.startsWith('_')) : [];

  // Track which row has been initialized to prevent re-initialization
  const initializedRowRef = React.useRef<string | null>(null);
  const hasExistingValuesRef = React.useRef(false);

  // Check if we already have saved values (form was reopened with saved config)
  React.useEffect(() => {
    const hasColumnValues = Object.keys(values).some(key => key.startsWith('column_'));
    if (hasColumnValues && !hasExistingValuesRef.current) {
      hasExistingValuesRef.current = true;
      console.log('📊 [Excel Update] Detected existing column_ values, will not overwrite');
    }
  }, []); // Run only once on mount

  // Initialize values for all columns when a new row is selected
  React.useEffect(() => {
    const rowId = selectedRow?.id;

    // Only initialize if this is a new row selection AND we don't have existing saved values
    if (rowId && rowId !== initializedRowRef.current && selectedRow?.fields) {
      initializedRowRef.current = rowId;

      // If we have existing saved values, don't overwrite them
      if (hasExistingValuesRef.current) {
        console.log('📊 [Excel Update] Skipping initialization, using saved values');
        return;
      }

      console.log('📊 [Excel Update] Initializing with current Excel values');
      Object.entries(selectedRow.fields).forEach(([columnName, currentValue]) => {
        const fieldKey = `column_${columnName}`;
        setValue(fieldKey, String(currentValue ?? ''));
      });
    }
  }, [selectedRow?.id, selectedRow?.fields, setValue]); // Don't include values to avoid loops

  return (
    <div className="mt-4 space-y-4">
      <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              Update Row {selectedRow.rowNumber || selectedRow.id}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Edit the fields below. Only modified fields will be updated when the workflow runs.
            </p>
          </div>

          <div className="space-y-3">
            {columns.map((columnName) => {
              const currentValue = selectedRow.fields[columnName];
              const fieldKey = `column_${columnName}`;

              // Smart field type detection
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

              return (
                <div key={columnName}>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {hasHeaders ? columnName : `Column ${columnName}`}
                  </label>

                  <div className="flex items-start space-x-2">
                    <div className="flex-1">
                      {/* Current value display */}
                      <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                        Current: {String(currentValue) || '(empty)'}
                      </div>

                      {/* Input field based on type */}
                      {isBoolean ? (
                        <div className="flex items-center space-x-3">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={values[fieldKey] === 'true' || values[fieldKey] === true}
                              onChange={(e) => setValue(fieldKey, e.target.checked.toString())}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:bg-gray-700 peer-checked:bg-blue-600"></div>
                            <span className="ml-3 text-sm text-gray-600 dark:text-gray-400">
                              {values[fieldKey] === 'true' || values[fieldKey] === true ? 'True' : 'False'}
                            </span>
                          </label>
                        </div>
                      ) : isDate ? (
                        <input
                          type="date"
                          value={values[fieldKey] || ''}
                          onChange={(e) => setValue(fieldKey, e.target.value)}
                          placeholder="New value or drag a variable"
                          className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                        />
                      ) : isNumber ? (
                        <input
                          type="number"
                          value={values[fieldKey] || ''}
                          onChange={(e) => setValue(fieldKey, e.target.value)}
                          placeholder="New value or drag a variable"
                          className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                        />
                      ) : isEmail ? (
                        <input
                          type="email"
                          value={values[fieldKey] || ''}
                          onChange={(e) => setValue(fieldKey, e.target.value)}
                          placeholder="New email or drag a variable"
                          className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                        />
                      ) : isUrl || isImageUrl ? (
                        <input
                          type="url"
                          value={values[fieldKey] || ''}
                          onChange={(e) => setValue(fieldKey, e.target.value)}
                          placeholder="New URL or drag a variable"
                          className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                        />
                      ) : (
                        <input
                          type="text"
                          value={values[fieldKey] || ''}
                          onChange={(e) => setValue(fieldKey, e.target.value)}
                          placeholder="New value or drag a variable"
                          className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                        />
                      )}
                    </div>
                  </div>

                  <p className="mt-1 text-xs text-slate-400">
                    Leave empty to keep the current value unchanged
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
