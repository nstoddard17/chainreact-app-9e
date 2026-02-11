import { AIAssistantContentLazy } from "@/components/ai/AIAssistantContentLazy"
import { NewSidebar } from "@/components/new-design/layout/NewSidebar"
import { NewHeader } from "@/components/new-design/layout/NewHeader"
import { NewFooter } from "@/components/new-design/layout/NewFooter"
import { requireUsername } from "@/utils/checkUsername"
import { PagePreloader } from "@/components/common/PagePreloader"
import { PageAccessGuard } from "@/components/common/PageAccessGuard"

export const dynamic = 'force-dynamic'

export default async function AIAssistantPage() {
  await requireUsername()

  return (
    <PageAccessGuard page="ai-assistant">
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Sidebar */}
        <NewSidebar />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <NewHeader title="AI Assistant" subtitle="Get help building and optimizing your workflows" />

          {/* Page Content - Full height without padding/max-width */}
          <main className="flex-1 overflow-hidden">
            <PagePreloader
              pageType="ai-assistant"
              loadingTitle="Loading AI Assistant"
              loadingDescription="Setting up your AI assistant..."
              skipConversations={true}
              skipIntegrations={true}
              skipWorkflows={true}
            >
              <AIAssistantContentLazy />
            </PagePreloader>
          </main>

          {/* Footer */}
          <NewFooter />
        </div>
      </div>
    </PageAccessGuard>
  )
}
