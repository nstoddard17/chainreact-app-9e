import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { OrganizationPublicView } from "@/components/new-design/OrganizationPublicView"
import { PageAccessGuard } from "@/components/common/PageAccessGuard"

export default function OrganizationPage() {
  return (
    <PageAccessGuard page="organization">
      <NewAppLayout title="Organization" subtitle="View your organization details">
        <OrganizationPublicView />
      </NewAppLayout>
    </PageAccessGuard>
  )
}
