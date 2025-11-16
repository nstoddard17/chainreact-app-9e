import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { LibraryContent } from "@/components/new-design/LibraryContent"
import { requireUsername } from "@/utils/checkUsername"
import { PagePreloader } from "@/components/common/PagePreloader"

export const dynamic = 'force-dynamic'

export default async function LibraryPage() {
  await requireUsername()

  return (
    <PagePreloader
      pageType="templates"
      loadingTitle="Loading Templates"
      loadingDescription="Loading workflow templates and your connected apps..."
      skipWorkflows={true}
    >
      <NewAppLayout title="Template Library" subtitle="Pre-built workflows ready to use">
        <LibraryContent />
      </NewAppLayout>
    </PagePreloader>
  )
}
