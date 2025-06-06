"use client"

import type React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useUser } from "@clerk/nextjs"
import { useState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"

interface IntegrationCardProps {
  integrationName: string
  integrationDescription: string
  logoURL: string
  onConnect: () => Promise<void>
  isConnected: boolean
  loading: boolean
}

const IntegrationCard: React.FC<IntegrationCardProps> = ({
  integrationName,
  integrationDescription,
  logoURL,
  onConnect,
  isConnected,
  loading,
}) => {
  const { user } = useUser()
  const [isLoading, setIsLoading] = useState(false)

  const handleConnect = async () => {
    setIsLoading(true)
    try {
      await onConnect()
    } catch (error) {
      console.error("Failed to connect:", error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-[380px] shadow-md">
      <CardHeader>
        <div className="flex items-center space-x-4">
          <Avatar>
            <AvatarImage src={logoURL || "/placeholder.svg"} alt={`${integrationName} Logo`} />
            <AvatarFallback>{integrationName.substring(0, 2)}</AvatarFallback>
          </Avatar>
          <CardTitle>{integrationName}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <CardDescription>{integrationDescription}</CardDescription>
        <div className="flex justify-end mt-4">
          {isConnected ? (
            <Button variant="outline" disabled>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Connected
            </Button>
          ) : (
            <Button onClick={handleConnect} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                "Connect"
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default IntegrationCard
