import { AIAssistantContentLazy } from "@/components/ai/AIAssistantContentLazy"
import { NewSidebar } from "@/components/new-design/layout/NewSidebar"
import { NewHeader } from "@/components/new-design/layout/NewHeader"
import { NewFooter } from "@/components/new-design/layout/NewFooter"
import { PagePreloader } from "@/components/common/PagePreloader"
import { AccessGuard } from "@/components/common/AccessGuard"

export default function AIAssistantPage() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <NewSidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <NewHeader title="AI Assistant" subtitle="Get help building and optimizing your workflows" />

        {/* Page Content - Full height without padding/max-width */}
        {/* Note: 'relative' is required for AccessGuard's absolute positioning to be contained within main */}
        <main className="flex-1 overflow-hidden relative">
          <AccessGuard pathname="/ai-assistant">
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
          </AccessGuard>
        </main>

        {/* Footer */}
        <NewFooter />
      </div>
    </div>
  )
}
