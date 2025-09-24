import { requireUsername } from "@/utils/checkUsername"
import IntegrationsContent from "@/components/integrations/IntegrationsContent"
import { INTEGRATION_CONFIGS } from "@/lib/integrations/availableIntegrations"

// Main page component
export default async function IntegrationsPage() {
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
