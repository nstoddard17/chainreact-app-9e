"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { disconnectIntegration } from "@/lib/api"

interface IntegrationCardProps {
  provider: any // Replace 'any' with a more specific type if available
  onDisconnect?: () => void
}

const IntegrationCard: React.FC<IntegrationCardProps> = ({ provider, onDisconnect }) => {
  const { toast } = useToast()
  const [isDisconnecting, setIsDisconnecting] = useState(false)

  const handleDisconnect = async () => {
    try {
      setIsDisconnecting(true)
      await disconnectIntegration(provider.integration!.id)

      toast({
        title: "Integration Disconnected",
        description: `${provider.name} has been disconnected successfully.`,
        duration: 4000,
      })
    } catch (error: any) {
      console.error(`Failed to disconnect ${provider.name}:`, error)
      toast({
        title: "Disconnection Failed",
        description: error.message || `Failed to disconnect ${provider.name}. Please try again.`,
        variant: "destructive",
        duration: 6000,
      })
    } finally {
      setIsDisconnecting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{provider.name}</CardTitle>
        <CardDescription>{provider.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-center space-x-4">
          <Avatar>
            <AvatarImage src={provider.logo || "/placeholder.svg"} alt={provider.name} />
            <AvatarFallback>{provider.name.substring(0, 2)}</AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <p className="text-sm font-medium leading-none">{provider.name}</p>
            <p className="text-sm text-muted-foreground">{provider.integration ? "Connected" : "Not Connected"}</p>
          </div>
        </div>
        {provider.integration && (
          <div className="flex items-center space-x-2">
            <Label htmlFor={`integration-${provider.id}`}>Enabled</Label>
            <Switch id={`integration-${provider.id}`} defaultChecked={provider.integration.enabled} disabled />
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        {provider.integration ? (
          <Button variant="destructive" onClick={handleDisconnect} disabled={isDisconnecting}>
            {isDisconnecting ? "Disconnecting..." : "Disconnect"}
          </Button>
        ) : (
          <Button>Connect</Button>
        )}
      </CardFooter>
    </Card>
  )
}

export default IntegrationCard
