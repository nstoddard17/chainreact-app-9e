import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { AIAssistantContent } from "@/components/new-design/AIAssistantContent"
import { requireUsername } from "@/utils/checkUsername"

export const dynamic = 'force-dynamic'

export default async function AIAssistantPage() {
  await requireUsername()

  return (
    <NewAppLayout title="AI Assistant" subtitle="Get help building and optimizing your workflows">
      <AIAssistantContent />
    </NewAppLayout>
  )
}
