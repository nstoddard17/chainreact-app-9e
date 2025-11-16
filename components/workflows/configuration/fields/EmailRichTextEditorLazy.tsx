"use client"

import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"

/**
 * Lazy-loaded EmailRichTextEditor component (2387 lines)
 * This component contains rich text editing functionality
 * Code-split since it's only needed when configuring email actions
 */
export const EmailRichTextEditorLazy = dynamic(
  () => import("./EmailRichTextEditor").then(mod => ({ default: mod.EmailRichTextEditor })),
  {
    loading: () => (
      <div className="flex items-center justify-center p-8 border rounded-lg bg-muted/50">
        <div className="text-center space-y-2">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">Loading rich text editor...</p>
        </div>
      </div>
    ),
    ssr: false
  }
)
