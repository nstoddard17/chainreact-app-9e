import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { AnalyticsContent } from "@/components/new-design/AnalyticsContent"
import { PagePreloader } from "@/components/common/PagePreloader"
import { PageAccessGuard } from "@/components/common/PageAccessGuard"

export default function AnalyticsPage() {
  return (
    <PageAccessGuard page="analytics">
      <NewAppLayout title="Analytics" subtitle="Monitor your workflow performance">
        <PagePreloader
          pageType="analytics"
          loadingTitle="Loading Analytics"
          loadingDescription="Loading your workflow performance data..."
          skipWorkflows={true}
          skipIntegrations={true}
        >
          <AnalyticsContent />
        </PagePreloader>
      </NewAppLayout>
    </PageAccessGuard>
  )
}
