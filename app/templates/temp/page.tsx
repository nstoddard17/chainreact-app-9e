"use client"

import { TempAppLayout } from "@/components/temp-redesign/layout/TempAppLayout"
import { PagePreloader } from "@/components/common/PagePreloader"
import { LibraryContent } from "@/components/new-design/LibraryContent"

export default function TemplatesTempPage() {
  return (
    <TempAppLayout title="Templates">
      <PagePreloader
        pageType="templates"
        loadingTitle="Loading Templates"
        loadingDescription="Loading workflow templates and your connected apps..."
        skipWorkflows={true}
      >
        <LibraryContent />
      </PagePreloader>
    </TempAppLayout>
  )
}
