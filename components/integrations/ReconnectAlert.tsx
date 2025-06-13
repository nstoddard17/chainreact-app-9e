"use client"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ReconnectAlertProps {
  provider: string
  onReconnect: () => void
}

export function ReconnectAlert({ provider, onReconnect }: ReconnectAlertProps) {
  return (
    <Alert variant="destructive" className="mb-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Authentication Required</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <p>
          Your {provider} integration needs to be reconnected. This happens when access is revoked or the refresh token
          expires.
        </p>
        <Button onClick={onReconnect} variant="outline" size="sm" className="w-fit">
          Reconnect {provider}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
