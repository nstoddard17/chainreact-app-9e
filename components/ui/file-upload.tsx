import React, { useRef, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { X, Upload, File, AlertCircle, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FileUploadProps {
  value?: FileList | File[]
  onChange: (files: FileList | File[]) => void
  accept?: string
  maxSize?: number
  maxFiles?: number
  className?: string
  placeholder?: string
  disabled?: boolean
}

interface UploadedFile {
  file: File
  id: string
  progress: number
  error?: string
  isFileId?: boolean
  previewUrl?: string
}

export function FileUpload({
  value,
  onChange,
  accept = "*/*",
  maxSize = 10 * 1024 * 1024, // 10MB default
  maxFiles = 5,
  className,
  placeholder = "Choose files to upload...",
  disabled = false
}: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [errors, setErrors] = useState<string[]>([])

  // Initialize uploaded files from value prop
  useEffect(() => {
    if (value && value.length > 0) {
      const initialFiles: UploadedFile[] = Array.from(value).map((file, index) => {
        // Check if it's a file ID string (from storage API)
        if (typeof file === 'string') {
          return {
            file: new Blob([], { type: 'application/octet-stream' }) as File,
            id: file,
            progress: 100,
            isFileId: true // Flag to indicate this is a file ID
          }
        }
        // It's a File object
        const uploadedFile: UploadedFile = {
          file,
          id: (file as any)._fileId || `${file.name}-${file.size}-${index}`,
          progress: 100,
        }
        
        // Generate preview URL for image files
        if (file.type.startsWith('image/')) {
          uploadedFile.previewUrl = URL.createObjectURL(file)
        }
        
        return uploadedFile
      })
      
      // Remove duplicates based on ID
      const uniqueFiles = initialFiles.filter((file, index, self) => 
        index === self.findIndex(f => f.id === file.id)
      )
      
      setUploadedFiles(uniqueFiles)
    } else {
      setUploadedFiles([])
    }
  }, [value])

  // Cleanup preview URLs when component unmounts
  useEffect(() => {
    return () => {
      uploadedFiles.forEach(file => {
        if (file.previewUrl) {
          URL.revokeObjectURL(file.previewUrl)
        }
      })
    }
  }, [])

  const handleFiles = (fileList: FileList) => {
    const newErrors: string[] = []
    const validFiles: File[] = []
    const newUploadedFiles: UploadedFile[] = []

    Array.from(fileList).forEach((file, index) => {
      // Check for duplicate files (same name and size)
      const isDuplicate = uploadedFiles.some(uploaded => 
        uploaded.file.name === file.name && uploaded.file.size === file.size
      )
      
      if (isDuplicate) {
        newErrors.push(`${file.name} is already attached.`)
        return
      }
      
      // Check file size
      if (file.size > maxSize) {
        newErrors.push(`${file.name} is too large. Maximum size is ${formatFileSize(maxSize)}.`)
        return
      }

      // Check file count
      if (uploadedFiles.length + validFiles.length >= maxFiles) {
        newErrors.push(`Maximum ${maxFiles} files allowed.`)
        return
      }

      validFiles.push(file)
      
      const uploadedFile: UploadedFile = {
        file,
        id: `${file.name}-${file.size}-${Date.now()}-${index}`, // More unique ID
        progress: 100, // For now, we'll set to 100% immediately
      }
      
      // Generate preview URL for image files
      if (file.type.startsWith('image/')) {
        uploadedFile.previewUrl = URL.createObjectURL(file)
      }
      
      newUploadedFiles.push(uploadedFile)
    })

    setErrors(newErrors)
    
    if (validFiles.length > 0) {
      const combinedFiles = [...uploadedFiles, ...newUploadedFiles]
      setUploadedFiles(combinedFiles)
      
      // Convert to FileList-like structure for onChange
      const dataTransfer = new DataTransfer()
      combinedFiles.forEach(({ file }) => dataTransfer.items.add(file))
      onChange(dataTransfer.files)
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (disabled) return
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files)
      // Reset the input to allow selecting the same file again if needed
      e.target.value = ''
    }
  }

  const removeFile = (fileId: string) => {
    const fileToRemove = uploadedFiles.find(f => f.id === fileId)
    if (fileToRemove?.previewUrl) {
      URL.revokeObjectURL(fileToRemove.previewUrl)
    }
    
    const updatedFiles = uploadedFiles.filter(f => f.id !== fileId)
    setUploadedFiles(updatedFiles)
    
    // Update onChange with remaining files
    const dataTransfer = new DataTransfer()
    updatedFiles.forEach(({ file }) => dataTransfer.items.add(file))
    onChange(dataTransfer.files)
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const isImageFile = (file: File): boolean => {
    return file.type.startsWith('image/')
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Upload Area */}
      <div
        className={cn(
          "relative border-2 border-dashed rounded-lg p-6 transition-colors",
          dragActive ? "border-primary bg-primary/5" : "border-border",
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-primary/50",
          errors.length > 0 ? "border-red-500" : ""
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple={maxFiles > 1}
          onChange={handleInputChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={disabled}
        />
        
        <div className="flex flex-col items-center justify-center space-y-2 text-center">
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{placeholder}</p>
            <p className="text-xs text-muted-foreground">
              Drag and drop files here or click to browse
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Max {maxFiles} files, {formatFileSize(maxSize)} each
            </p>
          </div>
        </div>
      </div>

      {/* Error Messages */}
      {errors.length > 0 && (
        <div className="space-y-1">
          {errors.map((error, index) => (
            <div key={index} className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          ))}
        </div>
      )}

      {/* Uploaded Files List */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Attached Files:</p>
          {uploadedFiles.map((uploadedFile) => (
            <div
              key={uploadedFile.id}
              className="flex items-center justify-between p-3 border rounded-lg bg-card"
            >
              <div className="flex items-center space-x-3 flex-1">
                {/* File Icon or Image Preview */}
                {uploadedFile.isFileId ? (
                  <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                    <ImageIcon className="w-5 h-5 text-muted-foreground" />
                  </div>
                ) : isImageFile(uploadedFile.file) && uploadedFile.previewUrl ? (
                  <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0">
                    <img
                      src={uploadedFile.previewUrl}
                      alt={uploadedFile.file.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <File className="h-4 w-4 text-muted-foreground" />
                )}
                
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {uploadedFile.isFileId ? 'File uploaded successfully' : uploadedFile.file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {uploadedFile.isFileId ? `File ID: ${uploadedFile.id}` : formatFileSize(uploadedFile.file.size)}
                  </p>
                </div>
              </div>
              
              {uploadedFile.progress < 100 && (
                <div className="w-20 mr-3">
                  <Progress value={uploadedFile.progress} className="h-2" />
                </div>
              )}
              
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  removeFile(uploadedFile.id)
                }}
                disabled={disabled}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
} 