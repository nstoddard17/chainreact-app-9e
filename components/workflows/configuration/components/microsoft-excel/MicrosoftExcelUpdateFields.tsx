"use client"

import React from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface MicrosoftExcelUpdateFieldsProps {
  values: Record<string, any>;
  setValue: (key: string, value: any) => void;
  previewData: any[];
  hasHeaders: boolean;
  action: string;
  selectedRow: any | null;
  showUpdateModal: boolean;
  onCloseUpdateModal: () => void;
  onConfirmUpdate: () => void;
}

export function MicrosoftExcelUpdateFields({
  values,
  setValue,
  previewData,
  hasHeaders,
  action,
  selectedRow,
  showUpdateModal,
  onCloseUpdateModal,
  onConfirmUpdate
}: MicrosoftExcelUpdateFieldsProps) {
  // Only show for update action
  if (action !== 'update' || !showUpdateModal || !selectedRow) {
    return null;
  }

  // Get column names from the selected row
  const columns = selectedRow?.fields ? Object.keys(selectedRow.fields).filter(key => !key.startsWith('_')) : [];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden">
        <div className="border-b px-6 py-4 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-semibold">Update Row {selectedRow.rowNumber || selectedRow.id}</h3>
            <p className="text-sm text-gray-500 mt-1">Modify the values you want to update</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onCloseUpdateModal}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-6 py-4 overflow-y-auto max-h-[calc(80vh-140px)]">
          <div className="space-y-4">
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {hasHeaders ? columnName : `Column ${columnName}`}
                  </label>

                  <div className="flex items-start space-x-2">
                    <div className="flex-1">
                      {/* Current value display */}
                      <div className="text-xs text-gray-500 mb-1">
                        Current: {currentValue || '(empty)'}
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
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            <span className="ml-3 text-sm text-gray-600">
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : isNumber ? (
                        <input
                          type="number"
                          value={values[fieldKey] || ''}
                          onChange={(e) => setValue(fieldKey, e.target.value)}
                          placeholder="New value or drag a variable"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : isEmail ? (
                        <input
                          type="email"
                          value={values[fieldKey] || ''}
                          onChange={(e) => setValue(fieldKey, e.target.value)}
                          placeholder="New email or drag a variable"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : isUrl || isImageUrl ? (
                        <input
                          type="url"
                          value={values[fieldKey] || ''}
                          onChange={(e) => setValue(fieldKey, e.target.value)}
                          placeholder="New URL or drag a variable"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        <input
                          type="text"
                          value={values[fieldKey] || ''}
                          onChange={(e) => setValue(fieldKey, e.target.value)}
                          placeholder="New value or drag a variable"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      )}
                    </div>
                  </div>

                  <p className="mt-1 text-xs text-gray-400">
                    Leave empty to keep the current value unchanged
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t px-6 py-4 flex justify-end space-x-3">
          <Button variant="outline" onClick={onCloseUpdateModal}>
            Cancel
          </Button>
          <Button onClick={onConfirmUpdate} className="bg-blue-600 hover:bg-blue-700">
            Confirm Update
          </Button>
        </div>
      </div>
    </div>
  );
}