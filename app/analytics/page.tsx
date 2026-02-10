import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { AnalyticsContent } from "@/components/new-design/AnalyticsContent"
import { requireUsername } from "@/utils/checkUsername"
import { PagePreloader } from "@/components/common/PagePreloader"

export const dynamic = 'force-dynamic'

export default async function AnalyticsPage() {
  await requireUsername()

  return (
    <PagePreloader
      pageType="analytics"
      loadingTitle="Loading Analytics"
      loadingDescription="Loading your workflow performance data..."
      skipWorkflows={true}
      skipIntegrations={true}
    >
      <NewAppLayout title="Analytics" subtitle="Monitor your workflow performance">
        <AnalyticsContent />
      </NewAppLayout>
    </PagePreloader>
  )
}
