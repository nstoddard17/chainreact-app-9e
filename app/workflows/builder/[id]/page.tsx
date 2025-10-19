import { requireUsername } from "@/utils/checkUsername"
import { NewWorkflowBuilderClient } from "@/components/workflows/NewWorkflowBuilderClient"

export const dynamic = 'force-dynamic'

export default async function WorkflowBuilderPage() {
  await requireUsername()

  return <NewWorkflowBuilderClient />
}
