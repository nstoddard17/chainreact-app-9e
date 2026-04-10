"use client"

import { Suspense } from "react"
import { SettingsContent } from "@/components/new-design/SettingsContentSidebar"
import { Loader2 } from "lucide-react"

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <SettingsContent />
    </Suspense>
  )
}
