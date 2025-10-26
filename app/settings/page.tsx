import { Suspense } from "react"
import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { SettingsContent } from "@/components/new-design/SettingsContentSidebar"
import { requireUsername } from "@/utils/checkUsername"
import { Loader2 } from "lucide-react"

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  await requireUsername()

  return (
    <NewAppLayout title="Settings" subtitle="Manage your account and preferences">
      <Suspense fallback={
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      }>
        <SettingsContent />
      </Suspense>
    </NewAppLayout>
  )
}
