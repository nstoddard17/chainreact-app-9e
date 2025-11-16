"use client"

import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"

/**
 * Lazy-loaded AirtableConfiguration component (3723 lines!)
 * This is one of the largest components - code-split for better performance
 */
export const AirtableConfigurationLazy = dynamic(
  () => import("./AirtableConfiguration"),
  {
    loading: () => (
      <div className="flex items-center justify-center p-8">
        <div className="text-center space-y-2">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">Loading Airtable configuration...</p>
        </div>
      </div>
    ),
    ssr: false
  }
)
