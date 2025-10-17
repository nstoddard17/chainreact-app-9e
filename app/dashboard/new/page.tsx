import AppLayout from "@/components/layout/AppLayout"
import { DashboardContentRedesign } from "@/components/dashboard/DashboardContentRedesign"
import { requireUsername } from "@/utils/checkUsername"

// Force dynamic rendering
export const dynamic = 'force-dynamic'

export default async function DashboardNewPage() {
  await requireUsername()

  return (
    <AppLayout
      title="Dashboard"
      subtitle="Overview of your automation workflows and activity"
    >
      <DashboardContentRedesign />
    </AppLayout>
  )
}
