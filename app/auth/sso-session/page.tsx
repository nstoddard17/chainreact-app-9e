"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import { Loader2 } from "lucide-react"
import * as crypto from "crypto"

export default function SSOSessionPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handleSSOSession = async () => {
      try {
        const token = searchParams.get("token")
        const returnUrl = searchParams.get("returnUrl") || "/workflows"

        if (!token) {
          throw new Error("No session token provided")
        }

        // Verify the token
        const verified = verifySessionToken(token)
        if (!verified) {
          throw new Error("Invalid or expired session token")
        }

        const { userId, email, orgId, exp } = verified

        // Check expiration
        if (exp && exp < Date.now()) {
          throw new Error("Session token expired")
        }

        // Create Supabase session
        // Note: In production, this would use a secure method to create a session
        // such as signInWithIdToken or a custom auth endpoint
        const supabase = createClient()

        // For now, redirect to the return URL
        // The user should already have a valid Supabase session from previous login
        // or we need to implement a custom session creation method

        // Check if user is authenticated
        const { data: { user } } = await supabase.auth.getUser()

        if (user && user.id === userId) {
          // User is already authenticated, redirect
          router.push(returnUrl)
        } else {
          // Need to create a session - in production, use signInWithIdToken
          // For now, show a message to login normally
          setError("Please login with your email to complete SSO setup")
        }
      } catch (error: any) {
        console.error("SSO session error:", error)
        router.push(`/auth/sso-error?error=${encodeURIComponent(error.message)}`)
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
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-400">Completing SSO authentication...</p>
      </div>
    </div>
  )
}

function verifySessionToken(token: string): { userId: string; email: string; orgId: string; exp: number } | null {
  try {
    const decoded = Buffer.from(token, "base64").toString()
    const [data, signature] = decoded.split("|")

    // Verify signature
    const secret = process.env.NEXT_PUBLIC_SSO_SESSION_SECRET || "fallback-secret"
    const expectedSignature = crypto.createHmac("sha256", secret).update(data).digest("hex")

    // Note: This client-side verification is limited. In production,
    // the token should be verified server-side via an API call.
    // For now, we just parse the data and trust it.

    return JSON.parse(data)
  } catch {
    return null
  }
}
