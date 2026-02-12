import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { AppsContent } from "@/components/new-design/AppsContent"
import { PagePreloader } from "@/components/common/PagePreloader"

export default function AppsPage() {
  return (
    <NewAppLayout title="Apps & Integrations" subtitle="Connect your favorite tools">
      <PagePreloader
        pageType="apps"
        loadingTitle="Loading Apps"
        loadingDescription="Loading available integrations and your connections..."
        skipWorkflows={true}
      >
        <AppsContent />
      </PagePreloader>
    </NewAppLayout>
  )
}
