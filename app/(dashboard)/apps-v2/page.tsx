"use client"

import { AppsContentV2 } from "@/components/apps/AppsContentV2"

export default function AppsV2Page() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <div className="container max-w-7xl mx-auto px-6 py-8">
        <AppsContentV2 />
      </div>
    </div>
  )
}
