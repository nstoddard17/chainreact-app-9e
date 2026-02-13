import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { TeamsPublicView } from "@/components/new-design/TeamsPublicView"
import { PageAccessGuard } from "@/components/common/PageAccessGuard"

export default function TeamsPage() {
  return (
    <NewAppLayout title="Teams" subtitle="Browse Teams">
      <PageAccessGuard page="teams">
        <TeamsPublicView />
      </PageAccessGuard>
    </NewAppLayout>
  )
}
