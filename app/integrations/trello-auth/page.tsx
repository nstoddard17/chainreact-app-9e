"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, CheckCircle, XCircle } from "lucide-react"

export default function TrelloAuthPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")
  const [message, setMessage] = useState("")

  useEffect(() => {
    const handleTrelloAuth = async () => {
      try {
        // Check if we have a token in the URL hash
        const hash = window.location.hash
        const urlParams = new URLSearchParams(hash.substring(1))
        const token = urlParams.get("token")
        const state = searchParams.get("state")

        if (!token) {
          // Listen for postMessage from Trello popup
          const handleMessage = async (event: MessageEvent) => {
            if (event.origin !== "https://trello.com") return

            const { token: messageToken } = event.data
            if (messageToken) {
              await processToken(messageToken, state)
            }
          }

          window.addEventListener("message", handleMessage)

          // Cleanup listener after 5 minutes
          setTimeout(() => {
            window.removeEventListener("message", handleMessage)
            if (status === "loading") {
              setStatus("error")
              setMessage("Authorization timed out. Please try again.")
            }
          }, 300000)

          return () => window.removeEventListener("message", handleMessage)
        } else {
          await processToken(token, state)
        }
      } catch (error: any) {
        console.error("Trello auth error:", error)
        setStatus("error")
        setMessage(error.message || "Failed to authorize Trello")
      }
    }

    const processToken = async (token: string, state: string | null) => {
      try {
        if (!state) {
          throw new Error("Missing state parameter")
        }

        // Send the token to our callback endpoint
        const response = await fetch("/api/integrations/trello/callback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token,
            state,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || "Failed to process authorization")
        }

        const data = await response.json()

        if (data.success) {
          setStatus("success")
          setMessage("Trello connected successfully!")

          // Redirect to integrations page after a short delay
          setTimeout(() => {
            router.push("/integrations?success=trello_connected")
          }, 2000)
        } else {
          throw new Error(data.error || "Authorization failed")
        }
      } catch (error: any) {
        console.error("Token processing error:", error)
        setStatus("error")
        setMessage(error.message || "Failed to process authorization")
      }
    }

    handleTrelloAuth()
  }, [router, searchParams, status])

  const handleRetry = () => {
    router.push("/integrations")
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            {status === "loading" && <Loader2 className="h-5 w-5 animate-spin" />}
            {status === "success" && <CheckCircle className="h-5 w-5 text-green-600" />}
            {status === "error" && <XCircle className="h-5 w-5 text-red-600" />}
            Trello Authorization
          </CardTitle>
          <CardDescription>
            {status === "loading" && "Processing your Trello authorization..."}
            {status === "success" && "Authorization completed successfully!"}
            {status === "error" && "Authorization failed"}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-sm text-gray-600">{message}</p>

          {status === "loading" && (
            <div className="flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          )}

          {status === "success" && <p className="text-sm text-green-600">Redirecting you back to integrations...</p>}

          {status === "error" && (
            <Button onClick={handleRetry} className="w-full">
              Return to Integrations
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
