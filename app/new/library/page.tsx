import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { LibraryContent } from "@/components/new-design/LibraryContent"
import { requireUsername } from "@/utils/checkUsername"

export const dynamic = 'force-dynamic'

export default async function LibraryPage() {
  await requireUsername()

  return (
    <NewAppLayout title="Template Library" subtitle="Pre-built workflows ready to use">
      <LibraryContent />
    </NewAppLayout>
  )
}
