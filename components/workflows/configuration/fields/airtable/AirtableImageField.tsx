"use client"

import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

import { logger } from '@/lib/utils/logger'

interface AirtableImageFieldProps {
  field: any;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  aiFields?: Record<string, boolean>;
  setAiFields?: (fields: Record<string, boolean>) => void;
  persistedImages?: any[];
  onPersistedImageRemove?: (index: number, image?: any) => void;
}

/**
 * Airtable image field component that shows preview and allows upload
 * Also supports AI mode where the AI can provide file URLs from previous nodes
 */
export function AirtableImageField({
  field,
  value,
  onChange,
  error,
  aiFields,
  setAiFields,
  persistedImages = [],
  onPersistedImageRemove,
}: AirtableImageFieldProps) {
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if field is in AI mode
  const isAIMode = aiFields?.[field.name] || (typeof value === 'string' && value.startsWith('{{AI_FIELD:'));

  // Parse the value - must be called before any conditional returns to maintain hook order
  // This could be:
  // 1. Array of attachment objects from Airtable
  // 2. A file object from local upload
  // 3. A base64 string
  // 4. null/undefined
  const images = React.useMemo(() => {
    const normalized: Array<any> = [];

    const pushNormalized = (img: any, source: 'value' | 'persisted', sourceIndex: number) => {
      if (!img) return;
      let url: string | undefined;
      if (typeof img === 'string') {
        url = img;
      } else {
        url =
          img.url ||
          img.thumbnailUrl ||
          img.thumbnails?.small?.url ||
          img.thumbnails?.large?.url ||
          img.fullUrl ||
          img.value;
      }

      if (!url) return;

      normalized.push({
        url,
        filename: img.filename || img.label || img.name || 'Image',
        id: img.id,
        size: img.size,
        type: img.type,
        isLocal: img.isLocal,
        origin: source,
        sourceIndex,
        raw: img
      });
    };

    if (Array.isArray(value)) {
      value.forEach((img, idx) => pushNormalized(img, 'value', idx));
    } else if (value) {
      pushNormalized(value, 'value', 0);
    }

    if (normalized.length === 0 && typeof value === 'string' && value.startsWith('data:')) {
      pushNormalized(value, 'value', 0);
    }

    if (Array.isArray(persistedImages) && persistedImages.length > 0) {
      persistedImages.forEach((img, idx) => pushNormalized(img, 'persisted', idx));
    }

    return normalized;
  }, [value, persistedImages]);

  // If in AI mode, show the AI UI
  if (isAIMode) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium flex items-center gap-2">
            {field.label || field.name}
            {field.required && <span className="text-red-500">*</span>}
          </label>
        </div>
        <div className="bg-gray-700 text-gray-300 rounded-md px-3 py-2 flex items-center gap-2">
          <Bot className="h-4 w-4 text-gray-400" />
          <span className="text-sm flex-1">
            Defined automatically by the model
          </span>
          <span className="text-xs text-gray-400">
            (AI can use file URLs from previous nodes)
          </span>
          {setAiFields && (
            <button
              type="button"
              onClick={() => {
                // Remove from AI fields
                const newAiFields = { ...aiFields };
                delete newAiFields[field.name];
                setAiFields(newAiFields);
                // Clear the value
                onChange(null);
              }}
              className="text-gray-400 hover:text-gray-200 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    );
  }

  const handleFileSelect = () => {
    // When replacing an image (images already exist), ensure we're ready for a clean replacement
    if (images.length > 0 && !field.multiple) {
      logger.debug('🔄 [AirtableImageField] Replacing existing image...');
    }
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
          logger.debug('📎 [AirtableImageField] Adding image to multiple:', newImage.filename);
          onChange([...value, newImage]);
        } else {
          // Single image - completely replace existing
          logger.debug('🔄 [AirtableImageField] Replacing image. Old:', value?.filename || 'none', '→ New:', newImage.filename);

          // First clear the old value to ensure clean replacement
          onChange(null);

          // Then set the new value after a microtask to ensure React processes the clear
          setTimeout(() => {
            onChange(newImage);
            logger.debug('✅ [AirtableImageField] Image replaced successfully');
          }, 0);
        }

        setUploadingFile(false);
      };

      reader.onerror = () => {
        logger.error('Error reading file');
        setUploadingFile(false);
      };

      reader.readAsDataURL(file);
    } catch (error) {
      logger.error('Error uploading file:', error);
      setUploadingFile(false);
    }

    // Reset input to ensure it can detect the same file being selected again
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

  return (
    <div className="space-y-3">
      {/* Compact preview rows */}
      {images.length > 0 && (
        <div className="space-y-2">
          {images.map((img, index) => {
            const sizeInKb = img.size ? (img.size / 1024).toFixed(1) : null;
            return (
              <div
                key={`${img.id || img.filename || 'image'}-${index}`}
                className="flex items-center gap-3 rounded-lg border border-slate-200 bg-card px-3 py-2"
              >
                <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                  <img
                    src={img.url}
                    alt={img.filename}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      const parent = e.currentTarget.parentElement;
                      if (parent && !parent.querySelector('.fallback-icon')) {
                        const icon = document.createElement('div');
                        icon.className = 'fallback-icon w-full h-full bg-muted rounded flex items-center justify-center';
                        icon.innerHTML = '<svg class="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>';
                        parent.appendChild(icon);
                      }
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{img.filename}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {sizeInKb && <span>{sizeInKb} KB</span>}
                    {img.type && (
                      <span className="uppercase">
                        {img.type.split("/")[1]}
                      </span>
                    )}
                    {img.isLocal && (
                      <span className="text-blue-600 font-medium">New Upload</span>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (img.origin === 'persisted') {
                      onPersistedImageRemove?.(img.sourceIndex ?? index, img.raw);
                    } else {
                      handleRemoveImage(img.sourceIndex ?? index);
                    }
                  }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
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

        {images.length === 0 && (
          <p className="text-xs text-slate-500">
            {field.multiple
              ? `Select multiple images to upload. Supported formats: JPG, PNG, GIF, WebP`
              : `Select an image to upload. Supported formats: JPG, PNG, GIF, WebP`}
          </p>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
}
