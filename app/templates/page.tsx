import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { LibraryContent } from "@/components/new-design/LibraryContent"
import { PagePreloader } from "@/components/common/PagePreloader"

export default function LibraryPage() {
  return (
    <NewAppLayout title="Template Library" subtitle="Pre-built workflows ready to use">
      <PagePreloader
        pageType="templates"
        loadingTitle="Loading Templates"
        loadingDescription="Loading workflow templates and your connected apps..."
        skipWorkflows={true}
      >
        <LibraryContent />
      </PagePreloader>
    </NewAppLayout>
  )
}
