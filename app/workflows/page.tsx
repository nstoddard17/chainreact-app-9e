import WorkflowsContent from "@/components/workflows/WorkflowsContent"
import { requireUsername } from "@/utils/checkUsername"

// Force dynamic rendering since workflows uses auth and real-time data
export const dynamic = 'force-dynamic'

// Main page component
export default async function WorkflowsPage() {
  // This will check for username and redirect if needed
  await requireUsername()

  return <WorkflowsContent />
}
