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
 * Guards content rendering until boot reaches 'ready' phase.
 */
export function AuthReadyGuard({
  children,
  loadingMessage = "Loading...",
  requireUser = true
}: AuthReadyGuardProps) {
  const { phase, user, profile } = useAuthStore()

  if (phase !== 'ready') {
    return <PageLoadingSpinner message={loadingMessage} />
  }

  // If we require a user, wait for profile to be loaded
  if (requireUser && user && !profile) {
    return <PageLoadingSpinner message={loadingMessage} />
  }

  return <>{children}</>
}
