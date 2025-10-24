import { WorkflowsPageContent } from "@/components/workflows/WorkflowsPageContent"
import { requireUsername } from "@/utils/checkUsername"

export const dynamic = 'force-dynamic'

export default async function WorkflowsPage() {
  await requireUsername()

  return <WorkflowsPageContent />
}
