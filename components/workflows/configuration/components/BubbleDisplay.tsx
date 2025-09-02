"use client"

import React from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

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
  activeBubbles: number | number[] | undefined;
  isMultiple: boolean;
  onBubbleClick: (index: number, suggestion: BubbleSuggestion) => void;
  onBubbleRemove: (index: number, suggestion: BubbleSuggestion) => void;
  onBubbleUndo?: (index: number, suggestion: BubbleSuggestion, originalValue: any) => void;
  originalValues?: Record<string, any>;
  values?: Record<string, any>;
  handleFieldChange?: (fieldName: string, value: any, skipBubbleCreation?: boolean) => void;
}

export function BubbleDisplay({
  fieldName,
  suggestions,
  activeBubbles,
  isMultiple,
  onBubbleClick,
  onBubbleRemove,
  onBubbleUndo,
  originalValues = {},
  values = {},
  handleFieldChange
}: BubbleDisplayProps) {
  if (!suggestions || suggestions.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion, idx) => {
          // Check if this bubble is active
          const isActive = Array.isArray(activeBubbles)
            ? activeBubbles.includes(idx)
            : activeBubbles === idx;

          // Render image bubble differently
          if (suggestion.isImage) {
            return (
              <div
                key={`${fieldName}-suggestion-${idx}-${suggestion.value}`}
                className={cn(
                  "group relative rounded-md cursor-pointer transition-all",
                  isActive
                    ? "ring-2 ring-green-400 ring-offset-2"
                    : "hover:ring-2 hover:ring-blue-400 hover:ring-offset-2"
                )}
                onClick={() => onBubbleClick(idx, suggestion)}
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

          // Regular text bubble
          return (
            <div
              key={`${fieldName}-suggestion-${idx}-${suggestion.value}`}
              className={cn(
                "group relative flex items-center gap-1 px-2 py-1 rounded-md cursor-pointer transition-colors",
                isActive
                  ? "bg-green-100 hover:bg-green-200 border border-green-300"
                  : "bg-blue-50 hover:bg-blue-100 border border-blue-200"
              )}
              onClick={() => {
                // Handle active bubble selection
                if (isMultiple && handleFieldChange) {
                  // For multi-value fields, handle the toggle here
                  const currentValue = values[fieldName];
                  const currentArray = Array.isArray(currentValue) ? currentValue : [];
                  let newValue;

                  if (currentArray.includes(suggestion.value)) {
                    newValue = currentArray.filter(v => v !== suggestion.value);
                  } else {
                    newValue = [...currentArray, suggestion.value];
                  }
                  handleFieldChange(fieldName, newValue, true); // Skip bubble creation when clicking existing bubble
                }
                
                // Also call the click handler for state management
                onBubbleClick(idx, suggestion);
              }}
              title={`Click to ${isActive ? 'deselect' : 'select'}: ${suggestion.label}`}
            >
              <span
                className={cn(
                  "text-sm flex items-center gap-1",
                  isActive ? "text-green-700 font-medium" : "text-blue-700"
                )}
              >
                {suggestion.label}
                {isActive && " ✓"}
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
                className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-full p-0.5 shadow-md hover:bg-white/90"
              >
                <X className="h-3 w-3 text-red-500 hover:text-red-700" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}