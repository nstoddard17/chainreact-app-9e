import { useCallback, useState } from 'react';

import { logger } from '@/lib/utils/logger'

interface FileFieldBubble {
  value: File | string;
  label: string;
  isImage: boolean;
  thumbnailUrl?: string;
  fullUrl?: string;
  filename: string;
  size: number;
  hasChanged?: boolean;
  isNewUpload?: boolean;
  previousBubble?: any;
}

interface ImagePreview {
  fieldName: string;
  url: string;
}

interface UseFileFieldHandlerProps {
  fieldSuggestions: Record<string, any[]>;
  setFieldSuggestions: (setter: any) => void;
  activeBubbles: Record<string, number | number[]>;
  setActiveBubbles: (setter: any) => void;
  originalBubbleValues: Record<string, any>;
  setOriginalBubbleValues: (setter: any) => void;
  setValue: (fieldName: string, value: any) => void;
}

export function useFileFieldHandler({
  fieldSuggestions,
  setFieldSuggestions,
  activeBubbles,
  setActiveBubbles,
  originalBubbleValues,
  setOriginalBubbleValues,
  setValue
}: UseFileFieldHandlerProps) {
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null);

  /**
   * Check if a field is a file/attachment field
   */
  const isFileField = useCallback((field: any, airtableFieldType?: string): boolean => {
    if (!field) return false;

    // Check standard field types
    if (field.type === 'file' || field.type === 'image' || field.type === 'attachment') {
      return true;
    }

    // Check Airtable field types
    if (airtableFieldType) {
      return airtableFieldType === 'multipleAttachments' || 
             airtableFieldType === 'attachment';
    }

    // Check field name patterns
    const fieldName = field.name?.toLowerCase() || '';
    return fieldName.includes('image') || 
           fieldName.includes('photo') || 
           fieldName.includes('attachment') ||
           fieldName.includes('file') ||
           fieldName.includes('upload');
  }, []);

  /**
   * Process file value and detect file type
   */
  const processFileValue = useCallback((value: any): { file: File | null, isDataUrl: boolean } => {
    let file: File | null = null;
    let isDataUrl = false;

    if (value instanceof FileList && value.length > 0) {
      file = value[0]; // Get the first file from FileList
      logger.debug('📸 Detected FileList with file:', file.name);
    } else if (value instanceof File) {
      file = value;
      logger.debug('📸 Detected File object:', file.name);
    } else if (Array.isArray(value) && value.length > 0 && value[0] instanceof File) {
      file = value[0]; // Handle array of File objects
      logger.debug('📸 Detected File array with file:', file.name);
    } else if (typeof value === 'string' && value.startsWith('data:')) {
      isDataUrl = true;
      logger.debug('📸 Detected data URL');
    }

    return { file, isDataUrl };
  }, []);

  /**
   * Create file bubble for uploaded file
   */
  const createFileBubble = useCallback((
    file: File | string,
    fieldName: string,
    previousBubble?: any
  ): FileFieldBubble => {
    const isFile = file instanceof File;
    
    return {
      value: file,
      label: isFile ? file.name : 'Uploaded Image',
      isImage: true,
      thumbnailUrl: isFile ? URL.createObjectURL(file) : file as string,
      fullUrl: isFile ? URL.createObjectURL(file) : file as string,
      filename: isFile ? file.name : 'image.png',
      size: isFile ? file.size : 0,
      hasChanged: true,
      isNewUpload: true,
      previousBubble
    };
  }, []);

  /**
   * Handle file field change
   */
  const handleFileFieldChange = useCallback((
    fieldName: string,
    value: any,
    field?: any,
    airtableFieldType?: string
  ): boolean => {
    // Check if this is a file field
    if (!isFileField(field, airtableFieldType)) {
      return false;
    }

    if (!value) {
      logger.debug('📸 File field cleared');
      // Clear image preview
      setImagePreview(null);
      
      // Clear bubbles for this field
      setFieldSuggestions(prev => {
        const newSuggestions = { ...prev };
        delete newSuggestions[fieldName];
        return newSuggestions;
      });
      
      setActiveBubbles(prev => {
        const newBubbles = { ...prev };
        delete newBubbles[fieldName];
        return newBubbles;
      });
      
      setValue(fieldName, '');
      return true;
    }

    logger.debug('📸 File field changed:', fieldName, value);

    // Process the file value
    const { file, isDataUrl } = processFileValue(value);

    if (file || isDataUrl) {
      logger.debug('📸 Processing file upload:', file ? file.name : 'data URL');
      
      // Store the previous bubble(s) before replacing
      const previousBubbles = fieldSuggestions[fieldName] || [];
      const previousActiveBubble = previousBubbles.find((_, idx) => 
        activeBubbles[fieldName] === idx || 
        (Array.isArray(activeBubbles[fieldName]) && (activeBubbles[fieldName] as number[]).includes(idx))
      );
      
      // Create a new image bubble for the uploaded file
      const newImageBubble = createFileBubble(
        file || value,
        fieldName,
        previousActiveBubble || previousBubbles[0]
      );
      
      // Store the original bubble value for undo functionality
      if (previousActiveBubble || previousBubbles[0]) {
        const originalBubble = previousActiveBubble || previousBubbles[0];
        setOriginalBubbleValues(prev => ({
          ...prev,
          [`${fieldName}-0`]: {
            value: originalBubble.value,
            label: originalBubble.label,
            thumbnailUrl: originalBubble.thumbnailUrl,
            fullUrl: originalBubble.fullUrl,
            filename: originalBubble.filename,
            size: originalBubble.size,
            isImage: true
          }
        }));
      }
      
      // Replace existing bubbles with the new one (for single image fields)
      setFieldSuggestions(prev => ({
        ...prev,
        [fieldName]: [newImageBubble]
      }));
      
      // Set as active bubble
      setActiveBubbles(prev => ({
        ...prev,
        [fieldName]: 0
      }));
      
      // Update the preview immediately
      setImagePreview({
        fieldName: fieldName,
        url: newImageBubble.fullUrl
      });
      
      logger.debug('📸 Created new image bubble for uploaded file:', newImageBubble);
      return true;
    }

    // If value is empty (user cleared the file), handle it
    if (!value || (value instanceof FileList && value.length === 0)) {
      logger.debug('📸 File field cleared');
      setImagePreview(null);
      return true;
    }

    return false;
  }, [
    isFileField,
    processFileValue,
    createFileBubble,
    fieldSuggestions,
    activeBubbles,
    setFieldSuggestions,
    setActiveBubbles,
    setOriginalBubbleValues,
    setValue
  ]);

  /**
   * Convert file to base64 for API submission
   */
  const fileToBase64 = useCallback(async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  /**
   * Process file bubbles for submission
   */
  const processFileBubblesForSubmission = useCallback(async (
    fieldName: string,
    bubbles: any[]
  ): Promise<any> => {
    if (!bubbles || bubbles.length === 0) return null;

    const processedFiles = await Promise.all(
      bubbles.map(async (bubble) => {
        if (bubble.isImage && bubble.value instanceof File) {
          // Convert File to base64
          const base64 = await fileToBase64(bubble.value);
          return {
            filename: bubble.filename,
            data: base64,
            size: bubble.size,
            type: bubble.value.type
          };
        } else if (bubble.isImage && typeof bubble.value === 'string') {
          // Already a data URL or URL
          return {
            filename: bubble.filename,
            data: bubble.value,
            size: bubble.size
          };
        }
        return bubble.value;
      })
    );

    // Return single file or array based on field type
    return processedFiles.length === 1 ? processedFiles[0] : processedFiles;
  }, [fileToBase64]);

  /**
   * Clean up object URLs when component unmounts
   */
  const cleanupObjectUrls = useCallback((fieldName?: string) => {
    const bubblesToClean = fieldName 
      ? { [fieldName]: fieldSuggestions[fieldName] }
      : fieldSuggestions;

    Object.entries(bubblesToClean).forEach(([field, bubbles]) => {
      if (Array.isArray(bubbles)) {
        bubbles.forEach(bubble => {
          if (bubble.thumbnailUrl?.startsWith('blob:')) {
            URL.revokeObjectURL(bubble.thumbnailUrl);
          }
          if (bubble.fullUrl?.startsWith('blob:')) {
            URL.revokeObjectURL(bubble.fullUrl);
          }
        });
      }
    });
  }, [fieldSuggestions]);

  return {
    imagePreview,
    setImagePreview,
    isFileField,
    processFileValue,
    createFileBubble,
    handleFileFieldChange,
    fileToBase64,
    processFileBubblesForSubmission,
    cleanupObjectUrls
  };
}