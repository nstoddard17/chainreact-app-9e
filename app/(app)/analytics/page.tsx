import { AnalyticsContent } from "@/components/new-design/AnalyticsContent"
import { PagePreloader } from "@/components/common/PagePreloader"
import { AccessGuard } from "@/components/common/AccessGuard"

export default function AnalyticsPage() {
  return (
    <AccessGuard pathname="/analytics">
      <PagePreloader
        pageType="analytics"
        loadingTitle="Loading Analytics"
        loadingDescription="Loading your workflow performance data..."
        skipWorkflows={true}
        skipIntegrations={true}
      >
        <AnalyticsContent />
      </PagePreloader>
    </AccessGuard>
  )
}
