import { AppsContentV2 } from "@/components/apps/AppsContentV2"
import { PagePreloader } from "@/components/common/PagePreloader"

export default function AppsPage() {
  return (
    <PagePreloader
      pageType="apps"
      loadingTitle="Loading Apps"
      loadingDescription="Loading available integrations and your connections..."
      skipWorkflows={true}
    >
      <AppsContentV2 />
    </PagePreloader>
  )
}
