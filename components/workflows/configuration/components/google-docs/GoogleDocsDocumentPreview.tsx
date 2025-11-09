"use client"

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";

interface GoogleDocsDocumentPreviewProps {
  documentId: string;
  showPreview: boolean;
  onTogglePreview: () => void;
  integrationId?: string;
}

export function GoogleDocsDocumentPreview({
  documentId,
  showPreview,
  onTogglePreview,
}: GoogleDocsDocumentPreviewProps) {
  const [iframeLoading, setIframeLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);

  // Google Docs embed URL
  const embedUrl = documentId
    ? `https://docs.google.com/document/d/${documentId}/preview`
    : null;

  return (
    <div className="space-y-3">
      {/* Toggle Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-700">Document Preview</span>
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
          {!documentId ? (
            <div className="p-8 text-center">
              <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">
                Select a document to see its preview
              </p>
            </div>
          ) : iframeError ? (
            <div className="flex flex-col items-center gap-3 p-8 bg-red-50">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <div className="text-center">
                <p className="text-sm font-medium text-red-700 mb-1">
                  Unable to load document preview
                </p>
                <p className="text-xs text-red-600">
                  The document may be private or the link may be invalid.
                </p>
                <a
                  href={`https://docs.google.com/document/d/${documentId}/edit`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-700 underline mt-2 inline-block"
                >
                  Open in Google Docs
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
                    <span className="text-sm text-slate-500">Loading document...</span>
                  </div>
                </div>
              )}

              {/* Google Docs iframe */}
              <iframe
                src={embedUrl || undefined}
                className="w-full h-[600px] border-0"
                onLoad={() => setIframeLoading(false)}
                onError={() => {
                  setIframeLoading(false);
                  setIframeError(true);
                }}
                title="Google Docs Preview"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              />

              {/* Info footer */}
              <div className="px-4 py-2 bg-slate-50 border-t border-slate-200">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Full document preview</span>
                  <a
                    href={`https://docs.google.com/document/d/${documentId}/edit`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700 underline"
                  >
                    Open in Google Docs
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