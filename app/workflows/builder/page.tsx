import { requireUsername } from "@/utils/checkUsername"
import WorkflowBuilderClient from "@/components/workflows/WorkflowBuilderClient"

// Force dynamic rendering since workflow builder uses auth and real-time data
export const dynamic = 'force-dynamic'

export default async function WorkflowBuilderPage() {
  // This will check for username and redirect if needed
  await requireUsername()

  return <WorkflowBuilderClient />
}