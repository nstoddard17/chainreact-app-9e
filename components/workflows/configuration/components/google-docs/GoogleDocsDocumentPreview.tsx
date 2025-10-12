"use client"

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

import { logger } from '@/lib/utils/logger'

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
  integrationId
}: GoogleDocsDocumentPreviewProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<{
    title: string;
    paragraphs: string[];
  } | null>(null);

  useEffect(() => {
    if (showPreview && documentId) {
      loadDocumentPreview();
    }
  }, [showPreview, documentId]);

  const loadDocumentPreview = async () => {
    if (!documentId) {
      setError("Please select a document first");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/integrations/google-docs/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documentId,
          integrationId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to load document preview");
      }

      const data = await response.json();
      setPreviewContent(data);
    } catch (err: any) {
      logger.error("Error loading document preview:", err);
      setError(err.message || "Failed to load document preview");
    } finally {
      setLoading(false);
    }
  };

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
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              <span className="ml-2 text-sm text-slate-500">Loading document preview...</span>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          ) : previewContent ? (
            <div className="p-4">
              {/* Document Title */}
              <h3 className="text-lg font-semibold text-slate-900 mb-3">
                {previewContent.title}
              </h3>
              
              {/* Document Content */}
              <ScrollArea className="h-48">
                <div className="space-y-2 text-sm text-slate-700">
                  {previewContent.paragraphs.length > 0 ? (
                    previewContent.paragraphs.map((paragraph, index) => (
                      <p key={index} className="leading-relaxed">
                        {paragraph}
                      </p>
                    ))
                  ) : (
                    <p className="text-slate-500 italic">
                      This document appears to be empty.
                    </p>
                  )}
                </div>
              </ScrollArea>

              {/* Preview Notice */}
              <div className="mt-3 pt-3 border-t border-slate-200">
                <p className="text-xs text-slate-500">
                  Showing first 2 paragraphs of the document
                </p>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center">
              <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">
                Select a document and click "Show Preview" to see its content
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}