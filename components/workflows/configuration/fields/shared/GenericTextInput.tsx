"use client"

import React, { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FileUpload } from "@/components/ui/file-upload";
import { cn } from "@/lib/utils";
import { useDragDrop } from "@/hooks/use-drag-drop";
import { FullscreenTextArea } from "../FullscreenTextEditor";

interface GenericTextInputProps {
  field: any;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  dynamicOptions?: Array<{value: string; label: string;}>;
  onDynamicLoad?: (fieldName: string) => void;
}

/**
 * Generic text input field for basic text, email, number, and textarea fields
 * Supports drag and drop for variables
 */
export function GenericTextInput({
  field,
  value,
  onChange,
  error,
  dynamicOptions,
  onDynamicLoad,
}: GenericTextInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<Array<{value: string; label: string;}>>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Load suggestions when field has dynamic options
  useEffect(() => {
    if (field.dynamic && onDynamicLoad && !dynamicOptions?.length) {
      onDynamicLoad(field.name);
    }
  }, [field.dynamic, field.name, onDynamicLoad, dynamicOptions]);

  // Drag and drop functionality
  const { handleDragOver, handleDrop } = useDragDrop({
    onVariableDrop: (variable: string) => {
      if (typeof value === 'string') {
        const newValue = value + variable;
        onChange(newValue);
      } else {
        onChange(variable);
      }
    }
  });

  // Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const inputValue = e.target.value;
    onChange(inputValue);

    // Show suggestions if we have dynamic options and user is typing
    if (field.dynamic && dynamicOptions && inputValue.length > 0) {
      const lastCommaIndex = inputValue.lastIndexOf(',');
      const currentInput = lastCommaIndex >= 0 
        ? inputValue.substring(lastCommaIndex + 1).trim()
        : inputValue.trim();

      if (currentInput.length > 0) {
        const filtered = dynamicOptions.filter(option => 
          (option.label || '').toLowerCase().includes(currentInput.toLowerCase()) ||
          (option.value || '').toLowerCase().includes(currentInput.toLowerCase())
        ).slice(0, 5); // Limit to 5 suggestions

        setFilteredSuggestions(filtered);
        setShowSuggestions(filtered.length > 0);
      } else {
        setShowSuggestions(false);
      }
    } else {
      setShowSuggestions(false);
    }
  };

  // Handle suggestion click
  const handleSuggestionClick = (suggestion: {value: string; label: string;}) => {
    const currentValue = value || '';
    const lastCommaIndex = currentValue.lastIndexOf(',');
    
    let newValue;
    if (lastCommaIndex >= 0) {
      // Replace the text after the last comma
      newValue = currentValue.substring(0, lastCommaIndex + 1) + ' ' + suggestion.value;
    } else {
      // Replace the entire value
      newValue = suggestion.value;
    }
    
    onChange(newValue);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node) &&
          inputRef.current && !inputRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const commonProps = {
    id: field.name,
    placeholder: field.placeholder || `Enter ${field.label || field.name}...`,
    value: value || "",
    onChange: handleChange,
    onDragOver: handleDragOver,
    onDrop: handleDrop,
    className: cn(
      error && "border-red-500"
    ),
  };

  switch (field.type) {
    case "textarea":
      return (
        <FullscreenTextArea
          value={value || ""}
          onChange={onChange}
          placeholder={field.placeholder || `Enter ${field.label || field.name}...`}
          className={cn(
            error && "border-red-500"
          )}
          error={!!error}
          rows={(field as any).rows || 6}
          fieldLabel={field.label || field.name}
          disabled={field.disabled || false}
        />
      );

    case "number":
      return (
        <Input
          {...commonProps}
          type="number"
          min={(field as any).min}
          max={(field as any).max}
          step={(field as any).step || 1}
        />
      );

    case "email":
      return (
        <Input
          {...commonProps}
          type="email"
        />
      );

    case "time":
      return (
        <Input
          {...commonProps}
          type="time"
          className={cn(
            "w-auto max-w-[150px]",
            error && "border-red-500"
          )}
        />
      );

    case "file":
      return (
        <FileUpload
          value={value}
          onChange={onChange}
          accept={field.accept || "*/*"}
          maxSize={field.maxSize || 25 * 1024 * 1024} // 25MB default
          maxFiles={field.multiple ? 10 : 1}
          placeholder={field.placeholder || "Choose files to attach..."}
          disabled={field.disabled}
          hideUploadedFiles={true} // Hide the upload badge/banner
        />
      );

    case "text":
    default:
      return (
        <div className="relative">
          <Input
            {...commonProps}
            ref={inputRef}
            type="text"
          />
          {showSuggestions && (
            <div
              ref={suggestionsRef}
              className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-md shadow-lg max-h-48 overflow-auto"
            >
              {filteredSuggestions.map((suggestion, index) => (
                <div
                  key={index}
                  className="px-3 py-2 hover:bg-gray-700 cursor-pointer text-sm border-b border-gray-600 last:border-b-0"
                  onClick={() => handleSuggestionClick(suggestion)}
                >
                  <div className="font-medium text-white">{suggestion.label}</div>
                  {suggestion.label !== suggestion.value && (
                    <div className="text-xs text-gray-300">{suggestion.value}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      );
  }
}