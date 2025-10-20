import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { AppsContent } from "@/components/new-design/AppsContent"
import { requireUsername } from "@/utils/checkUsername"

export const dynamic = 'force-dynamic'

export default async function AppsPage() {
  await requireUsername()

  return (
    <NewAppLayout title="Apps & Integrations" subtitle="Connect your favorite tools">
      <AppsContent />
    </NewAppLayout>
  )
}
