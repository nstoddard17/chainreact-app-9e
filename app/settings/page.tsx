import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { SettingsContent } from "@/components/new-design/SettingsContent"
import { requireUsername } from "@/utils/checkUsername"

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  await requireUsername()

  return (
    <NewAppLayout title="Settings" subtitle="Manage your account and preferences">
      <SettingsContent />
    </NewAppLayout>
  )
}
