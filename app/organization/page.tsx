import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { OrganizationPublicView } from "@/components/new-design/OrganizationPublicView"
import { requireUsername } from "@/utils/checkUsername"
import { PageAccessGuard } from "@/components/common/PageAccessGuard"

export const dynamic = 'force-dynamic'

export default async function OrganizationPage() {
  await requireUsername()

  return (
    <PageAccessGuard page="organization">
      <NewAppLayout title="Organization" subtitle="View your organization details">
        <OrganizationPublicView />
      </NewAppLayout>
    </PageAccessGuard>
  )
}
