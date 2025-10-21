import { AuroraWorkflowsContent } from "@/components/workflows/AuroraWorkflowsContent"
import { requireUsername } from "@/utils/checkUsername"

export const dynamic = "force-dynamic"

export default async function WorkflowsNewPage() {
  await requireUsername()

  return <AuroraWorkflowsContent />
}
