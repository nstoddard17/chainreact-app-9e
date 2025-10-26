import { Suspense } from "react"
import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { OrganizationSettingsContent } from "@/components/new-design/OrganizationSettingsContent"
import { Loader2 } from "lucide-react"
import { requireUsername } from "@/utils/checkUsername"

export const dynamic = 'force-dynamic'

export default async function OrganizationSettingsPage() {
  await requireUsername()

  return (
    <NewAppLayout title="Organization Settings" subtitle="Manage your organization and team settings">
      <Suspense fallback={
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      }>
        <OrganizationSettingsContent />
      </Suspense>
    </NewAppLayout>
  )
}
