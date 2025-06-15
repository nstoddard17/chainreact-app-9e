"use client"

import { Button } from "@/components/ui/button"

import { useIntegrations } from "@/hooks/use-integrations"

export function IntegrationsContent() {
  const { integrations, loading, error, connectIntegration, disconnectIntegration, refreshIntegrations } =
    useIntegrations()

  const handleConnect = async (providerId: string) => {
    await connectIntegration(providerId)
  }

  const handleDisconnect = async (providerId: string) => {
    await disconnectIntegration(providerId)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading integrations...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={refreshIntegrations} variant="outline">
            Try Again
          </Button>
        </div>
      </div>
    )
  }

  // Rest of the component remains the same...
}
