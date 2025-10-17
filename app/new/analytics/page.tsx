import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { AnalyticsContent } from "@/components/new-design/AnalyticsContent"
import { requireUsername } from "@/utils/checkUsername"

export const dynamic = 'force-dynamic'

export default async function AnalyticsPage() {
  await requireUsername()

  return (
    <NewAppLayout title="Analytics" subtitle="Monitor your workflow performance">
      <AnalyticsContent />
    </NewAppLayout>
  )
}
