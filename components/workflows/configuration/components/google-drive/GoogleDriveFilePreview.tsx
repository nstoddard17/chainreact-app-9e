"use client"

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { File, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";

interface GoogleDriveFilePreviewProps {
  fileId: string;
  showPreview: boolean;
  onTogglePreview: () => void;
  integrationId?: string;
}

export function GoogleDriveFilePreview({
  fileId,
  showPreview,
  onTogglePreview,
}: GoogleDriveFilePreviewProps) {
  const [iframeLoading, setIframeLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);

  // Google Drive embed URL - works for docs, sheets, slides, pdfs, images, etc.
  const embedUrl = fileId
    ? `https://drive.google.com/file/d/${fileId}/preview`
    : null;

  return (
    <div className="space-y-3">
      {/* Toggle Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <File className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-700">File Preview</span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onTogglePreview}
          className="gap-2"
        >
          {showPreview ? (
            <>
              <EyeOff className="h-4 w-4" />
              Hide Preview
            </>
          ) : (
            <>
              <Eye className="h-4 w-4" />
              Show Preview
            </>
          )}
        </Button>
      </div>

      {/* Preview Content */}
      {showPreview && (
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
          {!fileId ? (
            <div className="p-8 text-center">
              <File className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">
                Select a file to see its preview
              </p>
            </div>
          ) : iframeError ? (
            <div className="flex flex-col items-center gap-3 p-8 bg-red-50">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <div className="text-center">
                <p className="text-sm font-medium text-red-700 mb-1">
                  Unable to load file preview
                </p>
                <p className="text-xs text-red-600">
                  The file may be private, unsupported for preview, or the link may be invalid.
                </p>
                <a
                  href={`https://drive.google.com/file/d/${fileId}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-700 underline mt-2 inline-block"
                >
                  Open in Google Drive
                </a>
              </div>
            </div>
          ) : (
            <div className="relative">
              {/* Loading overlay */}
              {iframeLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                    <span className="text-sm text-slate-500">Loading file...</span>
                  </div>
                </div>
              )}

              {/* Google Drive iframe */}
              <iframe
                src={embedUrl || undefined}
                className="w-full h-[600px] border-0"
                onLoad={() => setIframeLoading(false)}
                onError={() => {
                  setIframeLoading(false);
                  setIframeError(true);
                }}
                title="Google Drive File Preview"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              />

              {/* Info footer */}
              <div className="px-4 py-2 bg-slate-50 border-t border-slate-200">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Full file preview</span>
                  <a
                    href={`https://drive.google.com/file/d/${fileId}/view`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700 underline"
                  >
                    Open in Google Drive
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
