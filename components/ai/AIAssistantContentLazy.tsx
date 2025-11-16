"use client"

import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"

/**
 * Lazy-loaded AI Assistant content (1881 lines)
 * Only loads when user navigates to AI Assistant page
 */
export const AIAssistantContentLazy = dynamic(
  () => import("./AIAssistantContent"),
  {
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <div className="space-y-1">
            <p className="text-lg font-medium">Loading AI Assistant...</p>
            <p className="text-sm text-muted-foreground">Preparing your workflow assistant</p>
          </div>
        </div>
      </div>
    ),
    ssr: false
  }
)
