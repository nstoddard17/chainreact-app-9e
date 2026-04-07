import { OrganizationPublicView } from "@/components/new-design/OrganizationPublicView"
import { AccessGuard } from "@/components/common/AccessGuard"

export default function OrgPage() {
  return (
    <AccessGuard pathname="/org">
      <OrganizationPublicView />
    </AccessGuard>
  )
}
