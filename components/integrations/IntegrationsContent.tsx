"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import IntegrationCard from "./IntegrationCard"

export default function IntegrationsContent() {
  const [integrations, setIntegrations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const searchParams = useSearchParams()
  const supabase = createClientComponentClient()
  const { toast } = useToast()

  // Handle success and error messages from OAuth callbacks
  useEffect(() => {
    const success = searchParams.get("success")
    const error = searchParams.get("error")
    const provider = searchParams.get("provider")
    const message = searchParams.get("message")

    if (success) {
      const providerName = success.split("_")[0]
      toast({
        title: "Integration Connected",
        description: `Successfully connected ${providerName} integration.`,
        variant: "default",
      })

      // Force refresh after a successful connection with a delay to ensure DB is updated
      setTimeout(() => {
        console.log("Forcing refresh after successful connection")
        fetchIntegrations(true)
      }, 2000)
    }

    if (error) {
      toast({
        title: "Integration Error",
        description: message || `Failed to connect integration: ${error}`,
        variant: "destructive",
      })
    }
  }, [searchParams, toast])

  const fetchIntegrations = async (forceRefresh = false) => {
    try {
      if (forceRefresh) {
        setRefreshing(true)
        console.log("Clearing cache before fetching integrations")

        // Clear cache by invalidating the previous request
        await fetch("/api/integrations/clear-cache", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        })
      }

      setLoading(true)
      console.log("Fetching integrations...")

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        console.error("No session found")
        return
      }

      const { data, error } = await supabase.from("integrations").select("*").eq("user_id", session.user.id)

      if (error) {
        console.error("Error fetching integrations:", error)
        throw error
      }

      console.log("Fetched integrations:", data?.length)
      setIntegrations(data || [])
    } catch (error) {
      console.error("Failed to fetch integrations:", error)
      toast({
        title: "Error",
        description: "Failed to load integrations. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchIntegrations()
  }, [])

  const handleRefresh = () => {
    fetchIntegrations(true)
  }

  const getIntegrationStatus = (provider: string) => {
    const integration = integrations.find((i) => i.provider === provider)
    return integration ? integration.status : "disconnected"
  }

  const getIntegrationId = (provider: string) => {
    const integration = integrations.find((i) => i.provider === provider)
    return integration ? integration.id : null
  }

  // Debug component to show integration status (only in development)
  const DebugInfo = () => {
    if (process.env.NODE_ENV !== "development") return null

    return (
      <Card className="mb-6 border-dashed border-yellow-500">
        <CardHeader>
          <CardTitle className="text-yellow-600">Debug Information</CardTitle>
          <CardDescription>Integration status information (only visible in development)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div>
              <strong>Total Integrations:</strong> {integrations.length}
            </div>
            <div className="text-sm overflow-auto max-h-40 bg-gray-50 p-2 rounded">
              <pre>{JSON.stringify(integrations, null, 2)}</pre>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleRefresh} disabled={refreshing} variant="outline" size="sm">
            {refreshing ? "Refreshing..." : "Force Refresh"}
          </Button>
        </CardFooter>
      </Card>
    )
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Integrations</h1>
          <p className="text-gray-500">Connect your workflows with external services</p>
        </div>
        <Button onClick={handleRefresh} disabled={refreshing || loading}>
          {refreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      <DebugInfo />

      {loading && !refreshing ? (
        <div className="text-center py-10">Loading integrations...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <IntegrationCard
            name="GitHub"
            description="Connect to GitHub repositories"
            status={getIntegrationStatus("github")}
            integrationId={getIntegrationId("github")}
            provider="github"
          />
          <IntegrationCard
            name="Google"
            description="Connect to Google services"
            status={getIntegrationStatus("google")}
            integrationId={getIntegrationId("google")}
            provider="google"
          />
          <IntegrationCard
            name="Slack"
            description="Connect to Slack workspaces"
            status={getIntegrationStatus("slack")}
            integrationId={getIntegrationId("slack")}
            provider="slack"
          />
          <IntegrationCard
            name="Discord"
            description="Connect to Discord servers"
            status={getIntegrationStatus("discord")}
            integrationId={getIntegrationId("discord")}
            provider="discord"
          />
          <IntegrationCard
            name="Airtable"
            description="Connect to Airtable bases"
            status={getIntegrationStatus("airtable")}
            integrationId={getIntegrationId("airtable")}
            provider="airtable"
          />
          <IntegrationCard
            name="Dropbox"
            description="Connect to Dropbox files"
            status={getIntegrationStatus("dropbox")}
            integrationId={getIntegrationId("dropbox")}
            provider="dropbox"
          />
          {/* Add more integration cards as needed */}
        </div>
      )}
    </div>
  )
}
