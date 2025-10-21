import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { AppsContent } from "@/components/new-design/AppsContent"
import { requireUsername } from "@/utils/checkUsername"
import { PagePreloader } from "@/components/common/PagePreloader"

export const dynamic = 'force-dynamic'

export default async function AppsPage() {
  await requireUsername()

  return (
    <PagePreloader
      pageType="apps"
      loadingTitle="Loading Apps"
      loadingDescription="Loading available integrations and your connections..."
      skipWorkflows={true}
    >
      <NewAppLayout title="Apps & Integrations" subtitle="Connect your favorite tools">
        <AppsContent />
      </NewAppLayout>
    </PagePreloader>
  )
}
