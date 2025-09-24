import { Suspense } from "react"
import { requireUsername } from "@/utils/checkUsername"
import SettingsContent from "@/components/settings/SettingsContent"

// Force dynamic rendering since settings uses auth
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  // This will check for username and redirect if needed
  await requireUsername()

  return (
    <Suspense fallback={null}>
      <SettingsContent />
    </Suspense>
  )
}
