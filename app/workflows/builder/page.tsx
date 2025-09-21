import { requireUsername } from "@/utils/checkUsername"
import WorkflowBuilderClient from "@/components/workflows/WorkflowBuilderClient"

export default async function WorkflowBuilderPage() {
  // This will check for username and redirect if needed
  await requireUsername()

  return <WorkflowBuilderClient />
}