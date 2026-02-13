import { NewSidebar } from "@/components/new-design/layout/NewSidebar"
import { NewHeader } from "@/components/new-design/layout/NewHeader"
import { NewFooter } from "@/components/new-design/layout/NewFooter"
import { PageLoadingSpinner } from "@/components/common/PageLoadingSpinner"

export default function Loading() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <NewSidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <NewHeader title="AI Assistant" subtitle="Get help building and optimizing your workflows" />

        {/* Page Content */}
        <main className="flex-1 overflow-hidden relative">
          <PageLoadingSpinner message="Loading AI Assistant..." />
        </main>

        {/* Footer */}
        <NewFooter />
      </div>
    </div>
  )
}
