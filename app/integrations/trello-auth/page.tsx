"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export default function TrelloAuthPage() {
  const [processing, setProcessing] = useState(true)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  useEffect(() => {
    const handleTrelloCallback = async () => {
      try {
        // Get the token from the URL fragment
        const hash = window.location.hash
        const urlParams = new URLSearchParams(hash.substring(1)) // Remove the # and parse
        const token = urlParams.get("token")
        const state = searchParams.get("state")

        if (!token) {
          console.error("No token found in URL fragment")
          toast({
            title: "Authentication Failed",
            description: "No token received from Trello",
            variant: "destructive",
          })
          router.push("/integrations?error=trello_no_token")
          return
        }

        if (!state) {
          console.error("No state found in URL")
          toast({
            title: "Authentication Failed",
            description: "Invalid authentication state",
            variant: "destructive",
          })
          router.push("/integrations?error=trello_no_state")
          return
        }

        console.log("Processing Trello token:", token.substring(0, 10) + "...")

        // Send the token to our server-side callback handler
        const response = await fetch("/api/integrations/trello/process-token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token,
            state,
          }),
        })

        const result = await response.json()

        if (!response.ok) {
          throw new Error(result.error || "Failed to process Trello token")
        }

        toast({
          title: "Success!",
          description: "Trello integration connected successfully",
        })

        router.push("/integrations?success=true&provider=trello&t=" + Date.now())
      } catch (error: any) {
        console.error("Error processing Trello callback:", error)
        toast({
          title: "Authentication Failed",
          description: error.message || "Failed to connect Trello integration",
          variant: "destructive",
        })
        router.push(`/integrations?error=trello_process_failed&message=${encodeURIComponent(error.message)}`)
      } finally {
        setProcessing(false)
      }
    }

    handleTrelloCallback()
  }, [router, searchParams, toast])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-md w-full mx-4">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900">
            {processing ? "Connecting Trello..." : "Processing Complete"}
          </h2>
          <p className="text-slate-600">
            {processing
              ? "Please wait while we complete your Trello integration setup."
              : "Redirecting you back to integrations..."}
          </p>
        </div>
      </div>
    </div>
  )
}
