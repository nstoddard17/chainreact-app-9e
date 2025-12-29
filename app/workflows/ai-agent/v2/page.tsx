import { AIAgentV2Content } from "@/components/workflows/ai-builder/AIAgentV2Content"
import { requireUsername } from "@/utils/checkUsername"

export const dynamic = 'force-dynamic'

export default async function AIAgentV2Page() {
  await requireUsername()

  return <AIAgentV2Content />
}
