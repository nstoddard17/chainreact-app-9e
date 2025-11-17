"use client"

import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Bot, X, FileText, File as FileIcon, Image as ImageIcon } from "lucide-react";
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
  onPersistedImageRemove?: (index: number, suggestion?: any) => void;
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
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isFileChooserOpen = useRef(false);

  // Check if field is in AI mode
  const isAIMode = aiFields?.[field.name] || (typeof value === 'string' && value.startsWith('{{AI_FIELD:'));

  const { localImages, savedImages } = React.useMemo(() => {
    const makeRecord = (img: any, origin: 'value' | 'persisted', sourceIndex: number) => {
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

      if (!url) return undefined;

      return {
        url,
        filename: img.filename || img.label || img.name || 'Image',
        id: img.id,
        size: img.size,
        type: img.type,
        isLocal: origin === 'value' || img.isLocal,
        origin,
        sourceIndex,
        raw: img
      };
    };

    const locals: any[] = [];
    const saved: any[] = [];

    if (Array.isArray(value)) {
      value.forEach((img, idx) => {
        const record = makeRecord(img, 'value', idx);
        if (record) locals.push(record);
      });
    } else if (value) {
      const record = makeRecord(value, 'value', 0);
      if (record) locals.push(record);
    }

    if (Array.isArray(persistedImages)) {
      persistedImages.forEach((img, idx) => {
        const record = makeRecord(img, 'persisted', idx);
        if (record) saved.push(record);
      });
    }

    return { localImages: locals, savedImages: saved };
  }, [value, persistedImages]);

  const previewImages = savedImages.length > 0 ? savedImages : localImages;
  const hasLocalFile = localImages.length > 0;

  // Determine if this is an image-only field or supports all file types
  const isImageOnly = field.airtableFieldType === 'image' || field.name?.toLowerCase().includes('image');
  const fileLabel = isImageOnly ? 'Image' : 'File';

  // Airtable attachment fields (multipleAttachments) support multiple files
  // For these fields, always show "Upload" instead of "Replace" since users can add more
  const supportsMultiple = field.airtableFieldType === 'multipleAttachments' || field.multiple;
  const uploadButtonText = supportsMultiple
    ? `Upload ${fileLabel}${field.multiple ? 's' : ''}`
    : (hasLocalFile ? `Replace ${fileLabel}` : `Upload ${fileLabel}`);

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
    // Prevent multiple simultaneous file choosers from opening
    if (isFileChooserOpen.current) {
      logger.debug('🚫 [AirtableImageField] File chooser already open, ignoring click');
      return;
    }

    isFileChooserOpen.current = true;

    // When replacing a file (files already exist), ensure we're ready for a clean replacement
    if (hasLocalFile && !field.multiple) {
      logger.debug('🔄 [AirtableImageField] Replacing existing file...');
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;

    // Reset the flag when file chooser closes
    isFileChooserOpen.current = false;

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

  const handleRemoveImage = (image: any) => {
    if (image.origin === 'persisted') {
      onPersistedImageRemove?.(image.sourceIndex, image.raw);
      return;
    }

    if (Array.isArray(value)) {
      const newValue = value.filter((_, idx) => idx !== image.sourceIndex);
      onChange(newValue.length > 0 ? newValue : null);
    } else {
      onChange(null);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const fileChangeEvent = {
        target: {
          files: e.dataTransfer.files
        }
      } as React.ChangeEvent<HTMLInputElement>;
      handleFileChange(fileChangeEvent);
    }
  };

  return (
    <div className="space-y-3">
      {previewImages.length > 0 && (
        <div className="space-y-2">
          {previewImages.map((img, index) => {
            const sizeInKb = img.size ? (img.size / 1024).toFixed(1) : null;
            const isImage = img.type?.startsWith('image/') || img.url?.startsWith('data:image/');
            const isPdf = img.type === 'application/pdf' || img.filename?.toLowerCase().endsWith('.pdf');
            const isDoc = img.type?.includes('document') || img.type?.includes('word') ||
                         img.filename?.toLowerCase().match(/\.(doc|docx|txt|rtf)$/);

            return (
              <div
                key={`${img.origin}-${img.id || img.filename || img.url}-${index}`}
                className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-card px-3 py-2"
              >
                <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                  {isImage ? (
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
                  ) : (
                    <div className="w-full h-full bg-muted rounded flex items-center justify-center">
                      {isPdf ? (
                        <FileText className="w-6 h-6 text-red-500" />
                      ) : isDoc ? (
                        <FileText className="w-6 h-6 text-blue-500" />
                      ) : (
                        <FileIcon className="w-6 h-6 text-slate-500" />
                      )}
                    </div>
                  )}
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
                    {img.origin === 'value' && (
                      <span className="text-blue-600 font-medium">New Upload</span>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveImage(img)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Dropzone Area */}
      <div
        className={cn(
          "relative border-2 border-dashed rounded-lg p-6 transition-colors",
          dragActive ? "border-primary bg-primary/5" : "border-border dark:border-slate-700",
          uploadingFile || field.disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-primary/50",
          error && "border-red-500"
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={handleFileSelect}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={isImageOnly ? "image/*" : "*"}
          multiple={field.multiple}
          onChange={handleFileChange}
          className="hidden"
          disabled={uploadingFile || field.disabled}
        />

        <div className="flex flex-col items-center justify-center space-y-2 text-center pointer-events-none">
          {uploadingFile ? (
            <>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              <p className="text-sm font-medium">Uploading...</p>
            </>
          ) : (
            <>
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  {field.placeholder || (supportsMultiple ? `Choose ${fileLabel.toLowerCase()}s to upload...` : `Choose a ${fileLabel.toLowerCase()} to upload...`)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Drag and drop {supportsMultiple ? `${fileLabel.toLowerCase()}s` : `a ${fileLabel.toLowerCase()}`} here or click to browse
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {isImageOnly ? (
                    field.multiple
                      ? `Supported formats: JPG, PNG, GIF, WebP`
                      : `Supported formats: JPG, PNG, GIF, WebP`
                  ) : (
                    `All file types supported`
                  )}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
}
