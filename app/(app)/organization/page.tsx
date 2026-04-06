import { OrganizationPublicView } from "@/components/new-design/OrganizationPublicView"
import { AccessGuard } from "@/components/common/AccessGuard"

export default function OrganizationPage() {
  return (
    <AccessGuard pathname="/organization">
      <OrganizationPublicView />
    </AccessGuard>
  )
}
