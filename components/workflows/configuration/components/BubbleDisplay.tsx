"use client"

import React from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BubbleSuggestion {
  value: any;
  label: string;
  fieldName?: string;
  recordId?: string;
  hasChanged?: boolean;
  isImage?: boolean;
  thumbnailUrl?: string;
  fullUrl?: string;
  filename?: string;
  size?: number;
  isNewUpload?: boolean;
}

interface BubbleDisplayProps {
  fieldName: string;
  suggestions: BubbleSuggestion[];
  onBubbleRemove: (index: number, suggestion: BubbleSuggestion) => void;
  onClearAll?: () => void;
  onBubbleUndo?: (index: number, suggestion: BubbleSuggestion, originalValue: any) => void;
  originalValues?: Record<string, any>;
}

export function BubbleDisplay({
  fieldName,
  suggestions,
  onBubbleRemove,
  onClearAll,
  onBubbleUndo,
  originalValues = {}
}: BubbleDisplayProps) {
  if (!suggestions || suggestions.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 space-y-2">
      {/* Header with Clear All button */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {suggestions.length} {suggestions.length === 1 ? 'value' : 'values'}
        </span>
        {onClearAll && suggestions.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            Clear all
          </Button>
        )}
      </div>

      {/* Bubbles */}
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion, idx) => {
          // Render image bubble differently
          if (suggestion.isImage) {
            return (
              <div
                key={`${fieldName}-suggestion-${idx}-${suggestion.value}`}
                className="group relative rounded-md"
                title={`${suggestion.filename || suggestion.label} ${
                  suggestion.size ? `(${(suggestion.size / 1024).toFixed(1)}KB)` : ''
                }`}
              >
                <img
                  src={suggestion.thumbnailUrl || suggestion.value}
                  alt={suggestion.label}
                  className="w-16 h-16 object-cover rounded-md border border-slate-200"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjRTJFOEYwIi8+CjxwYXRoIGQ9Ik0yOCA0MEgyMkMxOS43OTA5IDQwIDE4IDM4LjIwOTEgMTggMzZWMjRDMTggMjEuNzkwOSAxOS43OTA5IDIwIDIyIDIwSDQyQzQ0LjIwOTEgMjAgNDYgMjEuNzkwOSA0NiAyNFYzNkM0NiAzOC4yMDkxIDQ0LjIwOTEgNDAgNDIgNDBIMzYiIHN0cm9rZT0iIzk0QTNCOCIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KPGNpcmNsZSBjeD0iMjYiIGN5PSIyOCIgcj0iMiIgZmlsbD0iIzk0QTNCOCIvPgo8cGF0aCBkPSJNNDYgMzJMMzguNSAyNC41TDI4IDM1IiBzdHJva2U9IiM5NEEzQjgiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+Cjwvc3ZnPg==';
                  }}
                />

                {/* Undo button for uploaded images */}
                {suggestion.isNewUpload && originalValues[`${fieldName}-${idx}`] && onBubbleUndo && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onBubbleUndo(idx, suggestion, originalValues[`${fieldName}-${idx}`]);
                    }}
                    className="absolute -bottom-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-yellow-100 rounded-full p-0.5 shadow-md hover:bg-yellow-200"
                    title="Undo upload - revert to previous image"
                  >
                    <svg className="h-3 w-3 text-yellow-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                  </button>
                )}

                {/* Delete button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onBubbleRemove(idx, suggestion);
                  }}
                  className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-full p-0.5 shadow-md"
                >
                  <X className="h-3 w-3 text-red-500 hover:text-red-700" />
                </button>
              </div>
            );
          }

          // Regular text bubble - simplified to single style
          return (
            <div
              key={`${fieldName}-suggestion-${idx}-${suggestion.value}`}
              className="group relative flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors"
            >
              <span className="text-sm text-blue-700">
                {suggestion.label}
              </span>

              {/* Undo button for changed bubbles */}
              {suggestion.hasChanged && originalValues[`${fieldName}-${idx}`] && onBubbleUndo && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onBubbleUndo(idx, suggestion, originalValues[`${fieldName}-${idx}`]);
                  }}
                  className="absolute -top-1 -left-1 opacity-0 group-hover:opacity-100 transition-opacity bg-yellow-100 rounded-full p-0.5 shadow-md hover:bg-yellow-200"
                  title="Undo change"
                >
                  <svg className="h-3 w-3 text-yellow-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                </button>
              )}

              {/* Delete button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onBubbleRemove(idx, suggestion);
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3.5 w-3.5 text-gray-400 hover:text-red-600" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}