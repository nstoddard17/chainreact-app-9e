"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/ui/use-toast"
import { useIntegrationStore } from "@/stores/integrationStore"

export default function IntegrationsContent() {
  const [loading, setLoading] = useState(false)
  const {
    integrations,
    providers,
    loading: storeLoading,
    refreshing,
    error,
    fetchIntegrations,
    refreshTokens,
  } = useIntegrationStore()

  useEffect(() => {
    fetchIntegrations()
  }, [fetchIntegrations])

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const success = searchParams.get("success")
    const provider = searchParams.get("provider")

    if (success === "true") {
      console.log("OAuth success detected:", {
        provider,
        success,
        searchParams: Object.fromEntries(searchParams.entries()),
      })

      // Always refresh integrations on success
      setTimeout(() => {
        fetchIntegrations()
      }, 500)

      // Show success toast
      toast({
        title: "Integration Connected",
        description: `Successfully connected ${provider}`,
      })
    }
  }, [fetchIntegrations])

  const handleConnect = async (provider: string) => {
    setLoading(true)
    try {
      window.location.href = `/api/oauth/connect?provider=${provider}`
    } catch (error: any) {
      toast({
        title: "Something went wrong.",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async (provider: string) => {
    setLoading(true)
    try {
      await fetch(`/api/oauth/disconnect?provider=${provider}`)
      await fetchIntegrations()
      toast({
        title: "Integration Disconnected",
        description: `Successfully disconnected ${provider}`,
      })
    } catch (error: any) {
      toast({
        title: "Something went wrong.",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Google Drive</CardTitle>
          <CardDescription>Connect to your Google Drive account.</CardDescription>
        </CardHeader>
        <CardContent>
          <p>
            Automatically backup your files to Google Drive. Keep your important documents safe and accessible from
            anywhere.
          </p>
        </CardContent>
        <CardFooter className="flex justify-between">
          {integrations.find((i) => i.provider === "google-drive" && i.status === "connected") ? (
            <Button variant="destructive" onClick={() => handleDisconnect("google-drive")} disabled={loading}>
              Disconnect
            </Button>
          ) : (
            <Button onClick={() => handleConnect("google-drive")} disabled={loading}>
              Connect
            </Button>
          )}
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Dropbox</CardTitle>
          <CardDescription>Connect to your Dropbox account.</CardDescription>
        </CardHeader>
        <CardContent>
          <p>
            Sync your files to Dropbox for easy sharing and collaboration. Access your documents on any device, ensuring
            you're always up-to-date.
          </p>
        </CardContent>
        <CardFooter className="flex justify-between">
          {integrations.find((i) => i.provider === "dropbox" && i.status === "connected") ? (
            <Button variant="destructive" onClick={() => handleDisconnect("dropbox")} disabled={loading}>
              Disconnect
            </Button>
          ) : (
            <Button onClick={() => handleConnect("dropbox")} disabled={loading}>
              Connect
            </Button>
          )}
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>OneDrive</CardTitle>
          <CardDescription>Connect to your OneDrive account.</CardDescription>
        </CardHeader>
        <CardContent>
          <p>
            Integrate with OneDrive to streamline your file management. Securely store and share your files, making
            collaboration seamless and efficient.
          </p>
        </CardContent>
        <CardFooter className="flex justify-between">
          {integrations.find((i) => i.provider === "onedrive" && i.status === "connected") ? (
            <Button variant="destructive" onClick={() => handleDisconnect("onedrive")} disabled={loading}>
              Disconnect
            </Button>
          ) : (
            <Button onClick={() => handleConnect("onedrive")} disabled={loading}>
              Connect
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
