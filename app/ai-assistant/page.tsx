import AIAssistantContent from "@/components/ai/AIAssistantContent"
import { NewSidebar } from "@/components/new-design/layout/NewSidebar"
import { NewHeader } from "@/components/new-design/layout/NewHeader"
import { NewFooter } from "@/components/new-design/layout/NewFooter"
import { requireUsername } from "@/utils/checkUsername"
import { PagePreloader } from "@/components/common/PagePreloader"

export const dynamic = 'force-dynamic'

export default async function AIAssistantPage() {
  await requireUsername()

  return (
    <PagePreloader
      pageType="ai-assistant"
      loadingTitle="Loading AI Assistant"
      loadingDescription="Setting up your AI assistant..."
      skipConversations={true}
      skipIntegrations={true}
      skipWorkflows={true}
    >
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Sidebar */}
        <NewSidebar />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <NewHeader title="AI Assistant" subtitle="Get help building and optimizing your workflows" />

          {/* Page Content - Full height without padding/max-width */}
          <main className="flex-1 overflow-hidden">
            <AIAssistantContent />
          </main>

          {/* Footer */}
          <NewFooter />
        </div>
      </div>
    </PagePreloader>
  )
}
