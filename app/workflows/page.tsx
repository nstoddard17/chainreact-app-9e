import { requireUsername } from "@/utils/checkUsername"
import WorkflowsContent from "@/components/workflows/WorkflowsContent"

export default async function WorkflowsPage() {
  // This will check for username and redirect if needed
  await requireUsername()
  
  return <WorkflowsContent />
}
