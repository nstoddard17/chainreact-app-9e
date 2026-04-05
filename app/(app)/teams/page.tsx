import { TeamsPublicView } from "@/components/new-design/TeamsPublicView"
import { AccessGuard } from "@/components/common/AccessGuard"

export default function TeamsPage() {
  return (
    <AccessGuard pathname="/teams">
      <TeamsPublicView />
    </AccessGuard>
  )
}
