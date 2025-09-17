"use client"

import React from 'react';
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

interface ConfigurationContainerProps {
  children: React.ReactNode;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  onBack?: () => void;
  isEditMode?: boolean;
  submitLabel?: string;
  showFooter?: boolean;
}

/**
 * Standard container for configuration forms that ensures content stays within the left column.
 *
 * This component implements the correct overflow pattern to prevent content from
 * extending under the variable picker panel (right column).
 *
 * Pattern:
 * 1. Form with overflow-hidden to clip all overflow
 * 2. Scrollable div with overflow-y-auto and overflow-x-hidden
 * 3. Content div for spacing
 *
 * Use this instead of ScrollArea for all configuration providers.
 */
export function ConfigurationContainer({
  children,
  onSubmit,
  onCancel,
  onBack,
  isEditMode = false,
  submitLabel,
  showFooter = true
}: ConfigurationContainerProps) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col h-full overflow-hidden">
      {/* Main content area with vertical scroll only */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full overflow-y-auto overflow-x-hidden px-6 py-4">
          <div className="space-y-3 pb-4 pr-4">
            {children}
          </div>
        </div>
      </div>

      {/* Footer */}
      {showFooter && (
        <div className="border-t border-slate-200 dark:border-slate-700 px-6 py-4 bg-white dark:bg-slate-900">
          <div className="flex justify-end gap-3">
            {onBack && (
              <Button type="button" variant="outline" onClick={onBack}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit">
              {submitLabel || (isEditMode ? 'Update Configuration' : 'Save Configuration')}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}