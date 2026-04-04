"use client"

import { TempAppLayout } from "@/components/temp-redesign/layout/TempAppLayout"
import { PagePreloader } from "@/components/common/PagePreloader"
import { Suspense, lazy } from "react"

const WorkflowsContentInner = lazy(() =>
  import("@/components/workflows/WorkflowsPageContent").then((m) => ({
    default: m.WorkflowsContentInner,
  }))
)

export default function WorkflowsTempPage() {
  return (
    <TempAppLayout title="Workflows">
      <PagePreloader
        pageType="workflows"
        loadingTitle="Loading Workflows"
        loadingDescription="Fetching your workflows and execution stats..."
        skipIntegrations={true}
      >
        <Suspense fallback={<div className="animate-pulse h-64 bg-slate-100 dark:bg-slate-900 rounded-lg" />}>
          <WorkflowsContentInner />
        </Suspense>
      </PagePreloader>
    </TempAppLayout>
  )
}
