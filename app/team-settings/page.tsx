import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { TeamSettingsContent } from "@/components/new-design/TeamSettingsContent"
import { requireUsername } from "@/utils/checkUsername"

export const dynamic = 'force-dynamic'

export default async function TeamSettingsPage() {
  await requireUsername()

  return (
    <NewAppLayout
      title="Team Settings"
      subtitle="Manage team members and settings"
    >
      <TeamSettingsContent />
    </NewAppLayout>
  )
}
