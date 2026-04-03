"use client"

import React from "react"
import { useAuthStore } from "@/stores/authStore"
import { PageLoadingSpinner } from "./PageLoadingSpinner"

interface AuthReadyGuardProps {
  children: React.ReactNode
  loadingMessage?: string
  requireUser?: boolean
}

/**
 * Guards content rendering until boot reaches a usable phase.
 * - 'ready' → render children normally
 * - 'degraded' → render children with a retry banner
 * - 'error' → redirect to login
 */
export function AuthReadyGuard({
  children,
  loadingMessage = "Loading...",
  requireUser = true
}: AuthReadyGuardProps) {
  const { phase, user, profile, bootError, retryBoot } = useAuthStore()

  // Error state — redirect to login
  if (phase === 'error') {
    if (typeof window !== 'undefined') {
      window.location.href = '/auth/login?error=boot_failed'
    }
    return <PageLoadingSpinner message="Redirecting to login..." />
  }

  // Still booting
  if (phase !== 'ready' && phase !== 'degraded') {
    return <PageLoadingSpinner message={loadingMessage} />
  }

  // If we require a user, wait for profile to be loaded (unless degraded)
  if (requireUser && user && !profile && phase !== 'degraded') {
    return <PageLoadingSpinner message={loadingMessage} />
  }

  return (
    <>
      {phase === 'degraded' && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-4 py-2 text-sm text-amber-800 dark:text-amber-200 flex items-center justify-between">
          <span>
            {bootError || "We couldn't load your full profile. Some features may be limited."}
          </span>
          <button
            onClick={() => retryBoot()}
            className="ml-4 px-3 py-1 rounded text-xs font-medium bg-amber-200 dark:bg-amber-800 hover:bg-amber-300 dark:hover:bg-amber-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}
      {children}
    </>
  )
}
