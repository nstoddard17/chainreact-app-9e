"use client"

import { useState, useEffect } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { AlertTriangle, RefreshCw, X } from "lucide-react"
import { useSearchParams } from "next/navigation"

export default function ScopeValidationAlert() {
  const [showAlert, setShowAlert] = useState(false)
  const [alertData, setAlertData] = useState<{
    type: "error" | "success"
    provider: string
    message: string
  } | null>(null)

  const searchParams = useSearchParams()

  useEffect(() => {
    const error = searchParams.get("error")
    const success = searchParams.get("success")
    const provider = searchParams.get("provider")
    const message = searchParams.get("message")
    const scopesValidated = searchParams.get("scopes_validated")

    if (error === "insufficient_scopes" && provider && message) {
      setAlertData({
        type: "error",
        provider,
        message: decodeURIComponent(message),
      })
      setShowAlert(true)
    } else if (success && provider && scopesValidated === "true") {
      setAlertData({
        type: "success",
        provider,
        message: `${provider} connected successfully with all required permissions!`,
      })
      setShowAlert(true)

      // Auto-hide success message after 5 seconds
      setTimeout(() => setShowAlert(false), 5000)
    }
  }, [searchParams])

  const handleReconnect = () => {
    if (alertData?.provider) {
      // Trigger reconnection for the specific provider
      window.location.href = `/integrations?reconnect=${alertData.provider}`
    }
  }

  if (!showAlert || !alertData) return null

  return (
    <Alert
      className={`mb-6 ${alertData.type === "error" ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3">
          {alertData.type === "error" ? (
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
          ) : (
            <div className="h-5 w-5 rounded-full bg-green-600 flex items-center justify-center mt-0.5">
              <div className="h-2 w-2 bg-white rounded-full" />
            </div>
          )}
          <div className="flex-1">
            <AlertDescription className={alertData.type === "error" ? "text-red-800" : "text-green-800"}>
              <strong className="font-semibold">
                {alertData.type === "error" ? "Connection Failed" : "Connection Successful"}
              </strong>
              <br />
              {alertData.message}
            </AlertDescription>
            {alertData.type === "error" && (
              <div className="mt-3 flex space-x-2">
                <Button size="sm" onClick={handleReconnect} className="bg-red-600 hover:bg-red-700 text-white">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reconnect with Full Permissions
                </Button>
              </div>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAlert(false)}
          className={
            alertData.type === "error" ? "text-red-600 hover:text-red-700" : "text-green-600 hover:text-green-700"
          }
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </Alert>
  )
}
