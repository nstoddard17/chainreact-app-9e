"use client"

import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"

/**
 * Lazy-loaded admin components
 * Only admins access these, so no point loading for regular users
 */
export const BetaTestersContentLazy = dynamic(
  () => import("./BetaTestersContent"),
  {
    loading: () => (
      <div className="flex items-center justify-center p-12">
        <div className="text-center space-y-2">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">Loading admin panel...</p>
        </div>
      </div>
    ),
    ssr: false
  }
)
