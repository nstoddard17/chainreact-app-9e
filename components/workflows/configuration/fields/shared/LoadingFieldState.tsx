"use client"

import React from "react";

interface LoadingFieldStateProps {
  message?: string;
  className?: string;
}

/**
 * Standardized loading state for all field components
 * Shows a spinning wheel animation with loading text
 */
export function LoadingFieldState({
  message = "Loading options...",
  className = ""
}: LoadingFieldStateProps) {
  return (
    <div className={`flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 ${className}`}>
      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
      <span>{message}</span>
    </div>
  );
}
