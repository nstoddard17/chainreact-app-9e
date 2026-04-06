import { LibraryContent } from "@/components/new-design/LibraryContent"
import { PagePreloader } from "@/components/common/PagePreloader"

export default function LibraryPage() {
  return (
    <PagePreloader
      pageType="templates"
      loadingTitle="Loading Templates"
      loadingDescription="Loading workflow templates and your connected apps..."
      skipWorkflows={true}
    >
      <LibraryContent />
    </PagePreloader>
  )
}
