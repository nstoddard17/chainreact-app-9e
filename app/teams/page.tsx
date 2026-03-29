import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { TeamsPublicView } from "@/components/new-design/TeamsPublicView"
import { AccessGuard } from "@/components/common/AccessGuard"

export default function TeamsPage() {
  return (
    <NewAppLayout title="Teams" subtitle="Browse Teams">
      <AccessGuard pathname="/teams">
        <TeamsPublicView />
      </AccessGuard>
    </NewAppLayout>
  )
}
