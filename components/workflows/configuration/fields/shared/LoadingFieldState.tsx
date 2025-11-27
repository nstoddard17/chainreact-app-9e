"use client"

import React from "react";
import { Loader2 } from "lucide-react";

interface LoadingFieldStateProps {
  message?: string;
  className?: string;
}

/**
 * Standardized loading state for all field components
 * Shows a blue placeholder box with spinning wheel and loading text
 * This completely replaces the field while loading for consistent UX
 */
export function LoadingFieldState({
  message = "Loading options...",
  className = ""
}: LoadingFieldStateProps) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 ${className}`}>
      <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      <span className="text-sm text-blue-600 dark:text-blue-400">{message}</span>
    </div>
  );
}
