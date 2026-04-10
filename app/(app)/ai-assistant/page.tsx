import { AIAssistantContentLazy } from "@/components/ai/AIAssistantContentLazy"
import { PagePreloader } from "@/components/common/PagePreloader"
import { AccessGuard } from "@/components/common/AccessGuard"

export default function AIAssistantPage() {
  return (
    <AccessGuard pathname="/ai-assistant">
      <PagePreloader
        pageType="ai-assistant"
        loadingTitle="Loading Assistant"
        loadingDescription="Setting up your assistant..."
        skipConversations={true}
        skipIntegrations={true}
        skipWorkflows={true}
      >
        <AIAssistantContentLazy />
      </PagePreloader>
    </AccessGuard>
  )
}
