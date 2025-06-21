"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { createBrowserClient } from "@supabase/ssr"

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
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession()

        if (sessionError) {
          console.error("Session error:", sessionError)
        }

        if (!session?.user) {
          console.error("No authenticated user found")
          toast({
            title: "Authentication Required",
            description: "Please log in to connect integrations",
            variant: "destructive",
          })
          router.push("/auth/login?redirect=/integrations")
          return
        }

        const user = session.user

        // Get the token from the URL fragment
        const hash = window.location.hash
        const urlParams = new URLSearchParams(hash.substring(1)) // Remove the # and parse
        const token = urlParams.get("token")

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

        console.log("Processing Trello token")
        const response = await fetch("/api/integrations/trello/process-token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token: token,
            userId: user.id,
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

        // Use replace instead of push to avoid back button issues
        router.replace("/integrations?success=true&provider=trello&t=" + Date.now())
      } catch (error: any) {
        console.error("Error processing Trello callback:", error)
        toast({
          title: "Authentication Failed",
          description: error.message || "Failed to connect Trello integration",
          variant: "destructive",
        })
        router.replace(`/integrations?error=trello_process_failed&message=${encodeURIComponent(error.message)}`)
      } finally {
        setProcessing(false)
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
              : "Redirecting you back to integrations..."}
          </p>
        </div>
      </div>
    </div>
  )
}
