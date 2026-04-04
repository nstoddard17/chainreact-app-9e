"use client"

import { TempAppLayout } from "@/components/temp-redesign/layout/TempAppLayout"
import { PagePreloader } from "@/components/common/PagePreloader"
import { AppsContentV2 } from "@/components/apps/AppsContentV2"

export default function AppsTempPage() {
  return (
    <TempAppLayout title="Apps">
      <PagePreloader
        pageType="apps"
        loadingTitle="Loading Apps"
        loadingDescription="Loading available integrations and your connections..."
        skipWorkflows={true}
      >
        <AppsContentV2 />
      </PagePreloader>
    </TempAppLayout>
  )
}
