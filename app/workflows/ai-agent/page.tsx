import { AIAgentBuilderContent } from "@/components/workflows/ai-builder/AIAgentBuilderContent"
import { requireUsername } from "@/utils/checkUsername"

export const dynamic = 'force-dynamic'

export default async function AIAgentPage() {
  await requireUsername()

  return <AIAgentBuilderContent />
}
