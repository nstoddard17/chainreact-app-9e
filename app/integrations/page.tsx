import { createSupabaseServerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import IntegrationsContent from "@/components/integrations/IntegrationsContent"
import { INTEGRATION_CONFIGS } from "@/lib/integrations/availableIntegrations"

export default async function IntegrationsPage() {
  const supabase = createSupabaseServerClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect("/auth/login")
  }

  const configuredClients: Record<string, boolean> = {}
  for (const key in INTEGRATION_CONFIGS) {
    const config = INTEGRATION_CONFIGS[key]
    if (config.requiresClientId) {
      configuredClients[config.id] = !!process.env[config.requiresClientId]
    }
  }

  return <IntegrationsContent configuredClients={configuredClients} />
}
