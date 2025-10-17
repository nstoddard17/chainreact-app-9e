import AppLayout from "@/components/layout/AppLayout"
import { HomeContent } from "@/components/new-design/HomeContent"
import { requireUsername } from "@/utils/checkUsername"

export const dynamic = 'force-dynamic'

export default async function NewHomePage() {
  await requireUsername()

  return (
    <AppLayout title="Workflows" subtitle="Build and manage your automations">
      <HomeContent />
    </AppLayout>
  )
}
