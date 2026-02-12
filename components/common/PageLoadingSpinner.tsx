"use client"

import { Loader2 } from "lucide-react"

interface PageLoadingSpinnerProps {
  message?: string
}

/**
 * Full-page loading spinner shown instantly when navigating between pages.
 * Used by Next.js loading.tsx files to provide immediate feedback.
 */
export function PageLoadingSpinner({ message = "Loading..." }: PageLoadingSpinnerProps) {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}
