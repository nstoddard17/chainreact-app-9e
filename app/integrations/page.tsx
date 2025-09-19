import { Suspense } from "react"
import { requireUsername } from "@/utils/checkUsername"
import IntegrationsContent from "@/components/integrations/IntegrationsContent"
import { INTEGRATION_CONFIGS } from "@/lib/integrations/availableIntegrations"

// Server component that handles auth check and data fetching
async function IntegrationsPageContent() {
  // This will check for username and redirect if needed
  await requireUsername()

  const configuredClients: Record<string, boolean> = {}
  for (const key in INTEGRATION_CONFIGS) {
    const config = INTEGRATION_CONFIGS[key]
    if (config.requiresClientId) {
      configuredClients[config.id] = !!process.env[config.requiresClientId]
    }
  }

  return <IntegrationsContent configuredClients={configuredClients} />
}

// Main page component - not async to fix navigation
export default function IntegrationsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
        <div className="p-8 max-w-7xl mx-auto">
          <div className="animate-pulse">
            <div className="h-10 w-48 bg-gray-200 rounded mb-2" />
            <div className="h-6 w-96 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    }>
      <IntegrationsPageContent />
    </Suspense>
  )
}
