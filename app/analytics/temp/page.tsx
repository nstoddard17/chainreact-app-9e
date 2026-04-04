"use client"

import { TempAppLayout } from "@/components/temp-redesign/layout/TempAppLayout"
import { PagePreloader } from "@/components/common/PagePreloader"
import { AccessGuard } from "@/components/common/AccessGuard"
import { AnalyticsContent } from "@/components/new-design/AnalyticsContent"

export default function AnalyticsTempPage() {
  return (
    <TempAppLayout title="Analytics">
      <AccessGuard pathname="/analytics">
        <PagePreloader
          pageType="analytics"
          loadingTitle="Loading Analytics"
          loadingDescription="Loading your workflow analytics..."
          skipWorkflows={true}
          skipIntegrations={true}
        >
          <AnalyticsContent />
        </PagePreloader>
      </AccessGuard>
    </TempAppLayout>
  )
}
