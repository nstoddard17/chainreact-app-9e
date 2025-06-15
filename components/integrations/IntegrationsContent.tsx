"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/ui/use-toast"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { getIntegrations, disconnectIntegration } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { Link } from "react-router-dom"

const IntegrationsContent = () => {
  const queryClient = useQueryClient()
  const [isMounted, setIsMounted] = useState(false)
  const {
    data: integrations,
    isLoading,
    refetch: fetchIntegrations,
  } = useQuery({
    queryKey: ["integrations"],
    queryFn: getIntegrations,
  })

  const disconnectMutation = useMutation({
    mutationFn: disconnectIntegration,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] })
      toast({
        title: "Integration Disconnected",
        description: "Successfully disconnected integration.",
      })
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Disconnect",
        description: error?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      })
    },
  })

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const handleDisconnect = async (provider: string) => {
    await disconnectMutation.mutateAsync(provider)
  }

  // Add this useEffect after existing ones
  useEffect(() => {
    // Handle post-redirect initialization
    const handlePostRedirect = () => {
      const urlParams = new URLSearchParams(window.location.search)
      const success = urlParams.get("success")
      const error = urlParams.get("error")
      const provider = urlParams.get("provider")

      if ((success || error) && provider) {
        if (success) {
          toast({
            title: "Integration Connected",
            description: `Successfully connected ${provider} integration.`,
            duration: 5000,
          })
        } else if (error) {
          toast({
            title: "Connection Failed",
            description: decodeURIComponent(error),
            variant: "destructive",
            duration: 8000,
          })
        }

        // Clean up URL parameters
        const cleanUrl = window.location.pathname
        window.history.replaceState({}, document.title, cleanUrl)

        // Refresh integrations
        fetchIntegrations()
      }
    }

    handlePostRedirect()
  }, [fetchIntegrations])

  if (!isMounted) {
    return <div>Loading...</div>
  }

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-6">Integrations</h1>
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <CardTitle>
                  <Skeleton />
                </CardTitle>
                <CardDescription>
                  <Skeleton />
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Skeleton height={20} />
              </CardContent>
              <CardFooter>
                <Skeleton width={100} height={30} />
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {integrations?.map((integration) => (
            <Card key={integration.provider}>
              <CardHeader>
                <CardTitle>{integration.provider}</CardTitle>
                <CardDescription>{integration.isConnected ? "Connected" : "Not Connected"}</CardDescription>
              </CardHeader>
              <CardContent>
                {integration.isConnected ? (
                  <p>Connected to {integration.provider}</p>
                ) : (
                  <p>Connect to {integration.provider} to enable features.</p>
                )}
              </CardContent>
              <CardFooter>
                {integration.isConnected ? (
                  <Button
                    variant="destructive"
                    onClick={() => handleDisconnect(integration.provider)}
                    disabled={disconnectMutation.isPending}
                  >
                    {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
                  </Button>
                ) : (
                  <Button asChild>
                    <Link to={`/integrations/connect/${integration.provider}`}>Connect</Link>
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export default IntegrationsContent
