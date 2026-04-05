import { FlowV2AIAgentBuilderContent } from "@/components/workflows/builder/FlowV2AIAgentBuilderContent"
import { requireUsername } from "@/utils/checkUsername"

export const dynamic = 'force-dynamic'

export default async function AIAgentPage() {
  await requireUsername()

  return <FlowV2AIAgentBuilderContent />
}
