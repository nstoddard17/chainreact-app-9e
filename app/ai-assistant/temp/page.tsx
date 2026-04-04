"use client"

import { Suspense, lazy } from "react"
import { TempSidebar } from "@/components/temp-redesign/layout/TempSidebar"
import { TempHeader } from "@/components/temp-redesign/layout/TempHeader"
import { PagePreloader } from "@/components/common/PagePreloader"
import { AccessGuard } from "@/components/common/AccessGuard"
import { AuthReadyGuard } from "@/components/common/AuthReadyGuard"

const AIAssistantContentLazy = lazy(() =>
  import("@/components/ai/AIAssistantContentLazy").then((m) => ({
    default: m.AIAssistantContentLazy,
  }))
)

export default function AIAssistantTempPage() {
  return (
    <AuthReadyGuard>
      <div className="flex h-screen overflow-hidden bg-white dark:bg-slate-950">
        <TempSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TempHeader title="AI Assistant" />
          <main className="flex-1 overflow-hidden relative">
            <AccessGuard pathname="/ai-assistant">
              <PagePreloader
                pageType="ai-assistant"
                loadingTitle="Loading AI Assistant"
                loadingDescription="Setting up your AI assistant..."
                skipConversations={true}
                skipIntegrations={true}
                skipWorkflows={true}
              >
                <Suspense fallback={<div className="animate-pulse h-full bg-slate-100 dark:bg-slate-900" />}>
                  <AIAssistantContentLazy />
                </Suspense>
              </PagePreloader>
            </AccessGuard>
          </main>
        </div>
      </div>
    </AuthReadyGuard>
  )
}
