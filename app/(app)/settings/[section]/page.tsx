import { Suspense } from "react"
import { SettingsContent } from "@/components/new-design/SettingsContentSidebar"
import { requireUsername } from "@/utils/checkUsername"
import { Loader2 } from "lucide-react"

export const dynamic = 'force-dynamic'

export default async function SettingsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>
}) {
  await requireUsername()
  const { section } = await params

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <SettingsContent initialSection={section} />
    </Suspense>
  )
}
