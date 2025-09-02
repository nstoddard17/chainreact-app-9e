"use client"

import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ImageIcon, Upload, X, Eye, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AirtableImageFieldProps {
  field: any;
  value: any;
  onChange: (value: any) => void;
  error?: string;
}

/**
 * Airtable image field component that shows preview and allows upload
 */
export function AirtableImageField({
  field,
  value,
  onChange,
  error,
}: AirtableImageFieldProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse the value - it could be:
  // 1. Array of attachment objects from Airtable
  // 2. A file object from local upload
  // 3. A base64 string
  // 4. null/undefined
  const images = React.useMemo(() => {
    if (!value) return [];
    
    if (Array.isArray(value)) {
      // Airtable attachment format
      return value.map(img => ({
        url: img.url || img.thumbnails?.small?.url || img.thumbnails?.large?.url,
        filename: img.filename || 'Image',
        id: img.id,
        size: img.size,
        type: img.type
      }));
    }
    
    if (typeof value === 'object' && value.url) {
      // Single attachment object
      return [{
        url: value.url || value.thumbnails?.small?.url || value.thumbnails?.large?.url,
        filename: value.filename || 'Image',
        id: value.id,
        size: value.size,
        type: value.type
      }];
    }

    if (typeof value === 'string' && value.startsWith('data:')) {
      // Base64 string
      return [{
        url: value,
        filename: 'Uploaded Image',
        isLocal: true
      }];
    }

    return [];
  }, [value]);

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingFile(true);
    
    try {
      const file = files[0];
      
      // Convert to base64 for storage
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        
        // Store as an object that mimics Airtable format
        const newImage = {
          url: base64String,
          filename: file.name,
          size: file.size,
          type: file.type,
          isLocal: true // Flag to indicate this is a local upload
        };

        // If field allows multiple, append to existing
        if (field.multiple && Array.isArray(value)) {
          onChange([...value, newImage]);
        } else {
          // Single image - replace existing
          onChange(newImage);
        }
        
        setUploadingFile(false);
      };
      
      reader.onerror = () => {
        console.error('Error reading file');
        setUploadingFile(false);
      };
      
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading file:', error);
      setUploadingFile(false);
    }
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = (index: number) => {
    if (Array.isArray(value)) {
      const newValue = value.filter((_, i) => i !== index);
      onChange(newValue.length > 0 ? newValue : null);
    } else {
      onChange(null);
    }
  };

  const handleClearAll = () => {
    onChange(null);
  };

  return (
    <div className="space-y-3">
      {/* Current Images Preview */}
      {images.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">
              Current Image{images.length > 1 ? 's' : ''}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
                className="h-7 px-2 text-xs"
              >
                <Eye className="h-3 w-3 mr-1" />
                {showPreview ? 'Hide' : 'Preview'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                className="h-7 px-2 text-xs text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear
              </Button>
            </div>
          </div>

          {showPreview && (
            <div className="grid grid-cols-2 gap-2 mt-3">
              {images.map((img, index) => (
                <div key={index} className="relative group">
                  <img
                    src={img.url}
                    alt={img.filename}
                    className="w-full h-32 object-cover rounded border border-slate-200"
                    onError={(e) => {
                      e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIGZpbGw9IiNFMkU4RjAiLz48cGF0aCBkPSJNMjAgMTJDMTUuNTggMTIgMTIgMTUuNTggMTIgMjBDMTIgMjQuNDIgMTUuNTggMjggMjAgMjhDMjQuNDIgMjggMjggMjQuNDIgMjggMjBDMjggMTUuNTggMjQuNDIgMTIgMjAgMTJaTTIwIDI2QzE2LjY5IDI2IDE0IDIzLjMxIDE0IDIwQzE0IDE2LjY5IDE2LjY5IDE0IDIwIDE0QzIzLjMxIDE0IDI2IDE2LjY5IDI2IDIwQzI2IDIzLjMxIDIzLjMxIDI2IDIwIDI2WiIgZmlsbD0iIzk0QTNCOCIvPjwvc3ZnPg==';
                    }}
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity rounded flex items-center justify-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveImage(index)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mt-1">
                    <p className="text-xs text-slate-600 truncate">{img.filename}</p>
                    {img.size && (
                      <p className="text-xs text-slate-500">
                        {(img.size / 1024).toFixed(1)} KB
                      </p>
                    )}
                    {img.isLocal && (
                      <span className="text-xs text-blue-600 font-medium">Local Upload</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!showPreview && (
            <div className="flex flex-wrap gap-2">
              {images.map((img, index) => (
                <div key={index} className="flex items-center gap-2 bg-white px-2 py-1 rounded border border-slate-200">
                  <ImageIcon className="h-3 w-3 text-slate-400" />
                  <span className="text-xs text-slate-600 max-w-[150px] truncate">
                    {img.filename}
                  </span>
                  {img.isLocal && (
                    <span className="text-xs text-blue-600">(New)</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upload Button */}
      <div className="space-y-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple={field.multiple}
          onChange={handleFileChange}
          className="hidden"
        />
        
        <Button
          type="button"
          variant="outline"
          onClick={handleFileSelect}
          disabled={uploadingFile || field.disabled}
          className={cn(
            "w-full flex items-center justify-center gap-2",
            error && "border-red-500"
          )}
        >
          {uploadingFile ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              {images.length > 0 ? 'Replace Image' : 'Upload Image'}
            </>
          )}
        </Button>

        <p className="text-xs text-slate-500">
          {field.multiple 
            ? `Select multiple images to upload. Supported formats: JPG, PNG, GIF, WebP`
            : `Select an image to upload. Supported formats: JPG, PNG, GIF, WebP`}
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
}