"use client"

import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"

/**
 * Lazy-loaded ConfigurationForm component
 * This component is code-split to reduce initial bundle size
 * It will only load when a user opens a node configuration
 */
export const ConfigurationFormLazy = dynamic(
  () => import("./ConfigurationForm").then(mod => ({ default: mod.ConfigurationForm })),
  {
    loading: () => (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    ),
    ssr: false // Configuration forms are client-only
  }
)
