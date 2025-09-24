import WorkflowsContent from "@/components/workflows/WorkflowsContent"
import { requireUsername } from "@/utils/checkUsername"

// Main page component
export default async function WorkflowsPage() {
  // This will check for username and redirect if needed
  await requireUsername()

  return <WorkflowsContent />
}
