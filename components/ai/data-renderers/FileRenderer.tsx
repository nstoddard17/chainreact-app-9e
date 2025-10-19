"use client"

import React from "react"
import { FileText, File, Image, Video, Music, Archive, Code, FileSpreadsheet, FileType, Download, ExternalLink, Folder } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface FileData {
  id?: string
  name: string
  mimeType?: string
  type?: string
  size?: number
  modifiedTime?: string
  modified?: string
  webViewLink?: string
  webLink?: string
  downloadLink?: string
  provider?: string
  path?: string
  parentPath?: string
  isFolder?: boolean
  owner?: string
  sharedWith?: string[]
  thumbnailLink?: string
}

interface FileRendererProps {
  files: FileData[]
  maxDisplay?: number
  showThumbnails?: boolean
  className?: string
}

export function FileRenderer({ files, maxDisplay = 20, showThumbnails = true, className }: FileRendererProps) {
  const displayFiles = files.slice(0, maxDisplay)
  const hasMore = files.length > maxDisplay

  const getFileIcon = (file: FileData) => {
    const mimeType = file.mimeType || file.type || ""
    const name = file.name.toLowerCase()

    if (file.isFolder) {
      return <Folder className="w-5 h-5 text-blue-500" />
    }

    // Images
    if (mimeType.startsWith("image/") || /\.(jpg|jpeg|png|gif|bmp|svg|webp)$/.test(name)) {
      return <Image className="w-5 h-5 text-green-500" />
    }

    // Videos
    if (mimeType.startsWith("video/") || /\.(mp4|avi|mov|wmv|flv|webm)$/.test(name)) {
      return <Video className="w-5 h-5 text-purple-500" />
    }

    // Audio
    if (mimeType.startsWith("audio/") || /\.(mp3|wav|ogg|flac|aac)$/.test(name)) {
      return <Music className="w-5 h-5 text-pink-500" />
    }

    // Archives
    if (/\.(zip|rar|7z|tar|gz|bz2)$/.test(name)) {
      return <Archive className="w-5 h-5 text-orange-500" />
    }

    // Code files
    if (/\.(js|jsx|ts|tsx|py|java|c|cpp|cs|rb|php|go|rs|swift)$/.test(name)) {
      return <Code className="w-5 h-5 text-blue-600" />
    }

    // Spreadsheets
    if (mimeType.includes("spreadsheet") || /\.(xls|xlsx|csv)$/.test(name)) {
      return <FileSpreadsheet className="w-5 h-5 text-green-600" />
    }

    // Documents
    if (mimeType.includes("document") || mimeType.includes("text") || /\.(doc|docx|txt|pdf)$/.test(name)) {
      return <FileText className="w-5 h-5 text-blue-500" />
    }

    return <File className="w-5 h-5 text-gray-500" />
  }

  const getFileTypeLabel = (file: FileData) => {
    const mimeType = file.mimeType || file.type || ""
    const name = file.name.toLowerCase()

    if (file.isFolder) return "Folder"
    if (mimeType.startsWith("image/")) return "Image"
    if (mimeType.startsWith("video/")) return "Video"
    if (mimeType.startsWith("audio/")) return "Audio"
    if (mimeType.includes("pdf")) return "PDF"
    if (mimeType.includes("document")) return "Document"
    if (mimeType.includes("spreadsheet")) return "Spreadsheet"
    if (mimeType.includes("presentation")) return "Presentation"

    const ext = name.split('.').pop()
    return ext ? ext.toUpperCase() : "File"
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return ""
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return ""
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffDays === 0) return "Today"
    if (diffDays === 1) return "Yesterday"
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    })
  }

  if (files.length === 0) {
    return (
      <div className={cn("mt-3 p-4 bg-muted/50 rounded-lg border text-center", className)}>
        <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No files found</p>
      </div>
    )
  }

  return (
    <div className={cn("mt-3 space-y-3", className)}>
      <div className="flex items-center gap-2 mb-2">
        <FileText className="w-5 h-5 text-primary" />
        <span className="font-medium text-lg">Files</span>
        <Badge variant="secondary" className="ml-auto">{files.length}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {displayFiles.map((file, index) => (
          <Card
            key={file.id || index}
            className="p-3 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-start gap-3">
              {/* Icon or Thumbnail */}
              <div className="flex-shrink-0">
                {showThumbnails && file.thumbnailLink ? (
                  <img
                    src={file.thumbnailLink}
                    alt={file.name}
                    className="w-12 h-12 object-cover rounded border"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                      e.currentTarget.nextElementSibling?.classList.remove('hidden')
                    }}
                  />
                ) : null}
                <div className={cn(
                  "w-12 h-12 flex items-center justify-center bg-muted/50 rounded border",
                  showThumbnails && file.thumbnailLink && "hidden"
                )}>
                  {getFileIcon(file)}
                </div>
              </div>

              {/* File Details */}
              <div className="flex-1 min-w-0">
                {/* Name */}
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className="font-medium text-sm line-clamp-2">{file.name}</h4>
                  <Badge variant="outline" className="flex-shrink-0 text-xs">
                    {getFileTypeLabel(file)}
                  </Badge>
                </div>

                {/* Metadata */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-1">
                  {file.size && (
                    <span>{formatFileSize(file.size)}</span>
                  )}
                  {(file.modifiedTime || file.modified) && (
                    <>
                      <span>•</span>
                      <span>{formatDate(file.modifiedTime || file.modified)}</span>
                    </>
                  )}
                  {file.provider && (
                    <>
                      <span>•</span>
                      <span className="capitalize">{file.provider.replace(/-/g, ' ')}</span>
                    </>
                  )}
                </div>

                {/* Path */}
                {(file.path || file.parentPath) && (
                  <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                    <Folder className="w-3 h-3" />
                    <span className="truncate">{file.path || file.parentPath}</span>
                  </div>
                )}

                {/* Owner & Sharing */}
                {(file.owner || file.sharedWith) && (
                  <div className="text-xs text-muted-foreground mb-2">
                    {file.owner && <span>Owner: {file.owner}</span>}
                    {file.sharedWith && file.sharedWith.length > 0 && (
                      <span className="ml-2">
                        Shared with {file.sharedWith.length} {file.sharedWith.length === 1 ? 'person' : 'people'}
                      </span>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 mt-2">
                  {file.webViewLink && (
                    <a
                      href={file.webViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      <span>View</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {file.webLink && !file.webViewLink && (
                    <a
                      href={file.webLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      <span>Open</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {file.downloadLink && (
                    <a
                      href={file.downloadLink}
                      download={file.name}
                      className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      <span>Download</span>
                      <Download className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {hasMore && (
        <div className="text-center py-2">
          <p className="text-sm text-muted-foreground">
            Showing {maxDisplay} of {files.length} files
          </p>
        </div>
      )}
    </div>
  )
}
