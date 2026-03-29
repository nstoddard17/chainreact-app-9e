import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { OrganizationPublicView } from "@/components/new-design/OrganizationPublicView"
import { AccessGuard } from "@/components/common/AccessGuard"

export default function OrganizationPage() {
  return (
    <NewAppLayout title="Organization" subtitle="View your organization details">
      <AccessGuard pathname="/organization">
        <OrganizationPublicView />
      </AccessGuard>
    </NewAppLayout>
  )
}
