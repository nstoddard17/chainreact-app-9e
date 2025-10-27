import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { OrganizationPublicView } from "@/components/new-design/OrganizationPublicView"
import { requireUsername } from "@/utils/checkUsername"

export const dynamic = 'force-dynamic'

export default async function OrganizationPage() {
  await requireUsername()

  return (
    <NewAppLayout title="Organization" subtitle="View your organization details">
      <OrganizationPublicView />
    </NewAppLayout>
  )
}
