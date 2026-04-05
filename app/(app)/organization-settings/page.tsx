import { Suspense } from "react"
import { OrganizationSettingsContent } from "@/components/new-design/OrganizationSettingsContent"
import { Loader2 } from "lucide-react"
import { requireUsername } from "@/utils/checkUsername"

export const dynamic = 'force-dynamic'

export default async function OrganizationSettingsPage() {
  await requireUsername()

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <OrganizationSettingsContent />
    </Suspense>
  )
}
