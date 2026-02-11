import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { TeamsPublicView } from "@/components/new-design/TeamsPublicView"
import { requireUsername } from "@/utils/checkUsername"
import { PageAccessGuard } from "@/components/common/PageAccessGuard"

export const dynamic = 'force-dynamic'

export default async function TeamsPage() {
  await requireUsername()

  return (
    <PageAccessGuard page="teams">
      <NewAppLayout title="Teams" subtitle="Browse Teams">
        <TeamsPublicView />
      </NewAppLayout>
    </PageAccessGuard>
  )
}
