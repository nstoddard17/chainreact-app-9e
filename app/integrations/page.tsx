"use client"

import { useEffect, useState } from "react"
import { useAuthStore } from "@/stores/authStore"
import { useRouter } from "next/navigation"
import IntegrationsContent from "@/components/integrations/IntegrationsContent"
import { isSupabaseConfigured } from "@/lib/supabase"
import { validateEnvironmentVariables } from "@/lib/integrations/integrationScopes"

export default function IntegrationsPage() {
  const [isClient, setIsClient] = useState(false)
  const [configStatus, setConfigStatus] = useState<{
    supabaseConfigured: boolean
    envValidation: ReturnType<typeof validateEnvironmentVariables>
  } | null>(null)

  const { user, initialized, loading } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    setIsClient(true)

    // Check configuration status
    const supabaseConfigured = isSupabaseConfigured()
    const envValidation = validateEnvironmentVariables()

    setConfigStatus({
      supabaseConfigured,
      envValidation,
    })

    // Log configuration status for debugging
    console.log("🔧 Configuration Status:", {
      supabaseConfigured,
      missingEnvVars: envValidation.missing,
      configuredIntegrations: envValidation.configured.filter((c) => c.includes("integration")).length,
      warnings: envValidation.warnings,
    })
  }, [])

  useEffect(() => {
    if (isClient && initialized && !loading && !user) {
      console.log("🔄 No user found, redirecting to login...")
      router.push("/auth/login")
    }
  }, [isClient, initialized, loading, user, router])

  if (!isClient || !initialized || loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading integrations...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Authentication Required</h2>
          <p className="text-gray-600">Redirecting to login...</p>
        </div>
      </div>
    )
  }

  // Show configuration warnings if there are issues
  if (configStatus && (!configStatus.supabaseConfigured || configStatus.envValidation.warnings.length > 0)) {
    return (
      <div className="min-h-screen bg-white p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-yellow-800 mb-4">⚠️ Configuration Issues Detected</h2>

            {!configStatus.supabaseConfigured && (
              <div className="mb-4">
                <h3 className="font-medium text-yellow-800 mb-2">Supabase Configuration Missing</h3>
                <p className="text-yellow-700 text-sm mb-2">Please set the following environment variables:</p>
                <ul className="list-disc list-inside text-yellow-700 text-sm space-y-1">
                  <li>NEXT_PUBLIC_SUPABASE_URL</li>
                  <li>NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
                  <li>SUPABASE_URL</li>
                  <li>SUPABASE_SERVICE_ROLE_KEY</li>
                </ul>
              </div>
            )}

            {configStatus.envValidation.warnings.length > 0 && (
              <div className="mb-4">
                <h3 className="font-medium text-yellow-800 mb-2">Integration Configuration Warnings</h3>
                <p className="text-yellow-700 text-sm mb-2">
                  Some integrations are missing required environment variables:
                </p>
                <ul className="list-disc list-inside text-yellow-700 text-sm space-y-1">
                  {configStatus.envValidation.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded">
              <h4 className="font-medium text-blue-800 mb-2">📋 Setup Instructions</h4>
              <ol className="list-decimal list-inside text-blue-700 text-sm space-y-1">
                <li>Set up your Supabase project and add the required environment variables</li>
                <li>Configure OAuth applications for each integration provider</li>
                <li>
                  Set redirect URIs to:{" "}
                  <code className="bg-blue-100 px-1 rounded">
                    https://chainreact.app/api/integrations/[provider]/callback
                  </code>
                </li>
                <li>Add the client IDs and secrets to your environment variables</li>
                <li>Restart your application</li>
              </ol>
            </div>
          </div>

          {configStatus.supabaseConfigured && <IntegrationsContent />}
        </div>
      </div>
    )
  }

  return <IntegrationsContent />
}
