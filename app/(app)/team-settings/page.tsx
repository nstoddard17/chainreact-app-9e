import { TeamSettingsContent } from "@/components/new-design/TeamSettingsContent"
import { requireUsername } from "@/utils/checkUsername"

export const dynamic = 'force-dynamic'

export default async function TeamSettingsPage() {
  await requireUsername()

  return <TeamSettingsContent />
}
