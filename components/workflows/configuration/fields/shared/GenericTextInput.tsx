"use client"

import React, { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FileUpload } from "@/components/ui/file-upload";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useDragDrop } from "@/hooks/use-drag-drop";
import { FullscreenTextArea } from "../FullscreenTextEditor";
import { formatVariableForDisplay } from "@/lib/utils/variableDisplay";
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/nodes";

interface GenericTextInputProps {
  field: any;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  dynamicOptions?: Array<{value: string; label: string;}>;
  onDynamicLoad?: (fieldName: string) => void;
  workflowNodes?: any[];
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
  workflowNodes,
}: GenericTextInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<Array<{value: string; label: string;}>>([]);
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  
  // Format variable for display - convert workflow nodes to the format expected by formatVariableForDisplay
  const nodeInfo = workflowNodes?.map((node: any) => {
    // Get the node component definition to access outputSchema
    const nodeComponent = ALL_NODE_COMPONENTS.find(comp => comp.type === node.data?.type);
    
    return {
      id: node.id,
      title: node.data?.title || node.data?.label || nodeComponent?.title || 'Custom',
      type: node.data?.type || 'unknown',
      outputSchema: nodeComponent?.outputSchema || node.data?.outputSchema
    };
  });
  const { display: displayValue, actual: actualValue } = formatVariableForDisplay(value || "", nodeInfo);

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
    value: isEditing ? (value || "") : displayValue,
    onChange: handleChange,
    onDragOver: handleDragOver,
    onDrop: handleDrop,
    onFocus: () => setIsEditing(true),
    onBlur: () => setIsEditing(false),
    className: cn(
      error && "border-red-500",
      !isEditing && displayValue !== value && "text-blue-600" // Show in blue when displaying human-readable format
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
      // Check if this field should be displayed as a slider
      const hasSliderConfig = (field as any).min !== undefined &&
                             (field as any).max !== undefined &&
                             (field as any).step !== undefined;
      const showUnit = (field as any).unit;

      if (hasSliderConfig) {
        // Display as slider with value label
        return (
          <div className="space-y-2">
            <div className="flex items-center space-x-4">
              <Slider
                value={[value || (field as any).defaultValue || (field as any).min || 0]}
                onValueChange={(values) => onChange(values[0])}
                min={(field as any).min}
                max={(field as any).max}
                step={(field as any).step}
                className="flex-1"
                disabled={field.disabled}
              />
              <div className="flex items-center space-x-1 min-w-[80px]">
                <Input
                  type="number"
                  value={value || (field as any).defaultValue || 0}
                  onChange={(e) => {
                    const newValue = parseFloat(e.target.value);
                    if (!isNaN(newValue)) {
                      onChange(Math.min((field as any).max, Math.max((field as any).min, newValue)));
                    }
                  }}
                  min={(field as any).min}
                  max={(field as any).max}
                  step={(field as any).step}
                  className="w-16 text-center"
                  disabled={field.disabled}
                />
                {showUnit && (
                  <span className="text-sm text-muted-foreground">{showUnit}</span>
                )}
              </div>
            </div>
            {(field as any).helpText && (
              <p className="text-xs text-muted-foreground">{(field as any).helpText}</p>
            )}
          </div>
        );
      }

      // Default number input
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
      // If field accepts variables, we need to handle both file uploads and variable text
      if (field.acceptsVariables) {
        // Check if value is a variable string (e.g., {{node.output.file}})
        const isVariable = typeof value === 'string' && value.includes('{{') && value.includes('}}');

        if (isVariable) {
          // Show the variable as text input with drag support
          return (
            <div className="relative">
              <Input
                type="text"
                value={value || ""}
                onChange={(e) => onChange(e.target.value)}
                placeholder={field.placeholder || "Upload files or drag variables..."}
                className={cn(
                  "pr-10",
                  error && "border-red-500"
                )}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                disabled={field.disabled}
              />
              {value && (
                <button
                  type="button"
                  onClick={() => onChange("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              )}
            </div>
          );
        }

        // Check if value contains uploaded files
        if (value && Array.isArray(value)) {
          // Show uploaded files
          return (
            <div className="space-y-2">
              <div className="text-sm text-gray-600">
                {value.length} file(s) attached
              </div>
              <div className="space-y-1">
                {value.map((file: any, index: number) => (
                  <div key={index} className="flex items-center justify-between p-2 border rounded">
                    <span className="text-sm">{file.name || file.fileName || `File ${index + 1}`}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const newValue = value.filter((_: any, i: number) => i !== index);
                        onChange(newValue.length > 0 ? newValue : null);
                      }}
                      className="text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => onChange(null)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Clear all files
              </button>
            </div>
          );
        }
      }

      // Standard file upload
      // Pass the value directly to FileUpload - it handles both File objects and saved metadata
      // Ensure value is always an array for FileUpload component
      const fileValue = value ? (Array.isArray(value) ? value : [value]) : undefined;
      console.log('📎 [GenericTextInput] Passing file value to FileUpload:', {
        value,
        fileValue,
        isArray: Array.isArray(value),
        firstFile: fileValue?.[0]
      });
      return (
        <FileUpload
          value={fileValue}
          onChange={async (files) => {
            // Convert FileList to array of file objects that can be stored
            if (files && files.length > 0) {
              // For all file uploads, upload to server immediately (same as Google Drive)
              console.log('📎 [GenericTextInput] Uploading files:', files.length);
              
              try {
                // Get auth token from Supabase
                let token = null;
                
                try {
                  // Import the app's Supabase client
                  const { supabase } = await import('@/utils/supabaseClient');
                  const { data: { session } } = await supabase.auth.getSession();
                  token = session?.access_token;
                  if (!token) {
                    console.error('No auth session found');
                    // Store file metadata without upload
                    const fileArray = Array.from(files).map(file => ({
                      name: file.name,
                      size: file.size,
                      type: file.type,
                      lastModified: file.lastModified
                    }));
                    onChange(field.multiple ? fileArray : fileArray[0]);
                    return;
                  }
                } catch (e) {
                  console.error('Failed to get auth token:', e);
                  // Store file metadata without upload
                  const fileArray = Array.from(files).map(file => ({
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    lastModified: file.lastModified
                  }));
                  onChange(field.multiple ? fileArray : fileArray[0]);
                  return;
                }
                
                // Get workflow and node IDs from context
                const workflowId = field.workflowId || 'temp';
                const nodeId = field.nodeId || `temp-${Date.now()}`;
                
                const uploadedFiles = [];
                
                for (const file of Array.from(files)) {
                  console.log('📎 [GenericTextInput] Uploading file:', file.name);
                  
                  const formData = new FormData();
                  formData.append('file', file);
                  formData.append('workflowId', workflowId);
                  formData.append('nodeId', nodeId);
                  
                  const response = await fetch('/api/workflows/files/upload', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${token}`
                    },
                    body: formData
                  });
                  
                  if (!response.ok) {
                    const error = await response.json();
                    console.error('📎 [GenericTextInput] Upload failed:', error);
                    throw new Error(error.error || 'Failed to upload file');
                  }
                  
                  const result = await response.json();
                  console.log('📎 [GenericTextInput] Upload successful:', result);
                  
                  // Store the file info - use the fileId as the identifier
                  uploadedFiles.push({
                    id: result.fileId,
                    fileName: result.fileName,
                    fileSize: result.fileSize,
                    fileType: result.fileType,
                    filePath: result.filePath,
                    isTemporary: result.isTemporary
                  });
                }
                
                // Store the uploaded file info
                console.log('📎 [GenericTextInput] Setting uploadedFiles value:', {
                  multiple: field.multiple,
                  uploadedFilesCount: uploadedFiles.length,
                  uploadedFiles: uploadedFiles,
                  valueToSet: field.multiple ? uploadedFiles : uploadedFiles[0]
                });
                onChange(field.multiple ? uploadedFiles : uploadedFiles[0]);
                
              } catch (error) {
                console.error('📎 [GenericTextInput] Error uploading files:', error);
                // Fallback to storing file metadata
                const fileArray = Array.from(files).map(file => ({
                  name: file.name,
                  size: file.size,
                  type: file.type,
                  lastModified: file.lastModified
                }));
                onChange(field.multiple ? fileArray : fileArray[0]);
              }
            } else {
              onChange(null);
            }
          }}
          accept={field.accept || "*/*"}
          maxSize={field.maxSize || 25 * 1024 * 1024} // 25MB default
          maxFiles={field.multiple ? 10 : 1}
          placeholder={field.placeholder || "Choose files to attach..."}
          disabled={field.disabled}
          hideUploadedFiles={false} // Show the uploaded files
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