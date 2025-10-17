import AppLayout from "@/components/layout/AppLayout"
import { requireUsername } from "@/utils/checkUsername"
import { WorkflowsContentRedesign } from "@/components/workflows/WorkflowsContentRedesign"

// Force dynamic rendering
export const dynamic = 'force-dynamic'

export default async function WorkflowsNewPage() {
  await requireUsername()

  return (
    <AppLayout
      title="Workflows"
      subtitle="Create and manage your automation workflows"
    >
      <WorkflowsContentRedesign />
    </AppLayout>
  )
}
