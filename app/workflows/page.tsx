import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { HomeContent } from "@/components/new-design/HomeContent"
import { requireUsername } from "@/utils/checkUsername"

export const dynamic = 'force-dynamic'

export default async function NewHomePage() {
  await requireUsername()

  return (
    <NewAppLayout title="Workflows" subtitle="Build and manage your automations">
      <HomeContent />
    </NewAppLayout>
  )
}
