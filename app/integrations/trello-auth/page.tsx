"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { createBrowserClient } from "@supabase/ssr"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { redirect } from "next/navigation"

export default function TrelloAuthPage() {
  const [processing, setProcessing] = useState(true)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    const handleTrelloCallback = async () => {
      try {
        // Get current user from Supabase with proper session handling
        const {
          data: { user: authUser },
          error: userError,
        } = await supabase.auth.getUser()

        if (userError || !authUser) {
          console.error("No authenticated user found")
          notifyParentAndClose("error", "Please log in to connect integrations")
          return
        }

        // Get session for access token
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) {
          console.error("No valid session found")
          notifyParentAndClose("error", "Session expired. Please log in again")
          return
        }

        // Get the state from URL params
        const state = searchParams.get("state")
        if (!state) {
          console.error("No state parameter found in URL")
          notifyParentAndClose("error", "Invalid authentication request")
          return
        }

        // Get the token from the URL fragment
        const hash = window.location.hash
        if (!hash) {
          console.error("No hash fragment found in URL")
          notifyParentAndClose("error", "No token received from Trello")
          return
        }

        const urlParams = new URLSearchParams(hash.substring(1)) // Remove the # and parse
        const token = urlParams.get("token")

        if (!token) {
          console.error("No token found in URL fragment")
          notifyParentAndClose("error", "No token received from Trello")
          return
        }

        console.log("Processing Trello token")
        const response = await fetch("/api/integrations/trello/process-token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token: token,
            userId: authUser.id,
          }),
        })

        const result = await response.json()

        if (!response.ok) {
          throw new Error(result.error || "Failed to process Trello token")
        }

        // Notify parent window of success and close this popup
        notifyParentAndClose("success", "Trello connected successfully!")
      } catch (error: any) {
        console.error("Error processing Trello callback:", error)
        notifyParentAndClose("error", error.message || "Failed to connect Trello integration")
      } finally {
        setProcessing(false)
      }
    }

    // Function to notify parent window and close this popup
    const notifyParentAndClose = (type: "success" | "error", message: string) => {
      const baseUrl = getBaseUrl()
      
      if (window.opener) {
        // Use the format that IntegrationsContent.tsx expects
        window.opener.postMessage({ 
          type: `oauth-${type}`,
          status: type,  // This is what the parent window checks for
          provider: "trello", 
          message 
        }, baseUrl)
        
        // Short delay before closing to ensure message is received
        setTimeout(() => window.close(), 300)
      } else {
        // If there's no opener, we need to redirect back to integrations page
        const status = type === "success" ? "success=true" : "error=trello_auth_failed"
        const encodedMsg = encodeURIComponent(message)
        router.replace(`/integrations?${status}&provider=trello&message=${encodedMsg}&t=${Date.now()}`)
      }
    }

    // Add a small delay to ensure the page is fully loaded
    const timer = setTimeout(handleTrelloCallback, 100)
    return () => clearTimeout(timer)
  }, [router, searchParams, toast, supabase.auth])

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
              : "Connecting to integrations..."}
          </p>
        </div>
      </div>
    </div>
  )
}
