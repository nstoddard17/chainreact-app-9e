"use client"

import React from 'react';
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

interface ConfigurationContainerProps {
  children: React.ReactNode;
  onSubmit: (e: React.FormEvent) => void;
  onCancel?: () => void; // Kept for backwards compatibility but not used
  onBack?: () => void;
  isEditMode?: boolean;
  submitLabel?: string;
  showFooter?: boolean;
  isFormValid?: boolean;
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
  showFooter = true,
  isFormValid = true
}: ConfigurationContainerProps) {
  const handleFormSubmit = (e: React.FormEvent) => {
    console.log('🎯 [ConfigurationContainer] Form submit event triggered');
    if (onSubmit) {
      onSubmit(e);
    } else {
      console.error('❌ [ConfigurationContainer] onSubmit is not defined!');
    }
  };

  return (
    <form onSubmit={handleFormSubmit} className="flex flex-col h-full overflow-hidden">
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
        <div className="border-t border-border px-6 py-4">
          <div className="flex justify-between items-center">
            {/* Back button on the left */}
            <div>
              {onBack && (
                <Button type="button" variant="outline" onClick={onBack}>
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
              )}
            </div>

            {/* Save button on the right */}
            <div>
              <Button
                type="submit"
                onClick={() => {
                  console.log('💾 [ConfigurationContainer] Save button clicked, isFormValid:', isFormValid);
                }}
              >
                {submitLabel || (isEditMode ? 'Update Configuration' : 'Save Configuration')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}