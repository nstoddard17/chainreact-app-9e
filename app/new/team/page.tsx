import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { TeamContent } from "@/components/new-design/TeamContent"
import { requireUsername } from "@/utils/checkUsername"

export const dynamic = 'force-dynamic'

export default async function TeamPage() {
  await requireUsername()

  return (
    <NewAppLayout title="Team" subtitle="Manage team members and collaboration">
      <TeamContent />
    </NewAppLayout>
  )
}
