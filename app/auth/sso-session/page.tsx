"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import { Loader2 } from "lucide-react"

function SSOSessionContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const hasFetchedRef = useRef(false)

  useEffect(() => {
    if (hasFetchedRef.current) return
    hasFetchedRef.current = true

    const handleSSOSession = async () => {
      try {
        const token = searchParams.get("token")
        const returnUrl = searchParams.get("returnUrl") || "/workflows"

        if (!token) {
          throw new Error("No session token provided")
        }

        // Verify token server-side and get session credentials
        const response = await fetch("/api/auth/sso/verify-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || "Failed to verify SSO session")
        }

        // User needs to complete signup first
        if (data.needsSignup) {
          const signupParams = new URLSearchParams({
            email: data.email || "",
            firstName: data.firstName || "",
            lastName: data.lastName || "",
            orgId: data.orgId || "",
            returnUrl,
          })
          router.push(`/auth/sso-signup?${signupParams.toString()}`)
          return
        }

        // Set the Supabase session with the tokens from the server
        if (data.accessToken && data.refreshToken) {
          const supabase = createClient()
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: data.accessToken,
            refresh_token: data.refreshToken,
          })

          if (sessionError) {
            throw new Error("Failed to establish session")
          }

          router.push(returnUrl)
          return
        }

        throw new Error("Invalid response from session verification")
      } catch (err: any) {
        const message = err?.message || "An error occurred during SSO authentication"
        setError(message)
        // Redirect to error page after a brief delay so user sees the message
        setTimeout(() => {
          router.push(`/auth/sso-error?error=${encodeURIComponent(message)}`)
        }, 2000)
      }
    }

    handleSSOSession()
  }, [searchParams, router])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-600 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-200">Completing SSO authentication...</p>
      </div>
    </div>
  )
}

export default function SSOSessionPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-orange-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-200">Loading...</p>
        </div>
      </div>
    }>
      <SSOSessionContent />
    </Suspense>
  )
}
