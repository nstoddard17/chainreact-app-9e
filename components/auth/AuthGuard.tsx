"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/stores/authStore"
import { Loader2 } from "lucide-react"

interface AuthGuardProps {
  children: React.ReactNode
  fallback?: React.ReactNode
  redirectTo?: string
}

export function AuthGuard({ children, fallback, redirectTo = "/auth/login" }: AuthGuardProps) {
  const { user, loading, initialized } = useAuthStore()
  const [isChecking, setIsChecking] = useState(true)
  const router = useRouter()

  useEffect(() => {
    if (initialized) {
      setIsChecking(false)

      if (!user) {
        console.log("🔒 User not authenticated, redirecting to login...")
        router.push(redirectTo)
      }
    }
  }, [user, initialized, router, redirectTo])

  // Show loading state while checking authentication
  if (loading || isChecking || !initialized) {
    return (
      fallback || (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600" />
            <p className="text-slate-600">Checking authentication...</p>
          </div>
        </div>
      )
    )
  }

  // Show nothing while redirecting
  if (!user) {
    return null
  }

  // User is authenticated, show children
  return <>{children}</>
}
