"use client"

import React from "react"
import { useAuthStore } from "@/stores/authStore"
import { PageLoadingSpinner } from "./PageLoadingSpinner"

interface AuthReadyGuardProps {
  children: React.ReactNode
  /** Custom loading message */
  loadingMessage?: string
  /** Whether to require a logged-in user (default: true) */
  requireUser?: boolean
}

/**
 * Guards content rendering until auth state is fully loaded.
 * Prevents flash of placeholder content by waiting for:
 * 1. Store hydration from localStorage
 * 2. Auth initialization completion
 * 3. Profile data to be available (if user is logged in)
 *
 * Use this component to wrap any content that depends on user/profile data.
 */
export function AuthReadyGuard({
  children,
  loadingMessage = "Loading...",
  requireUser = true
}: AuthReadyGuardProps) {
  const { hydrated, initialized, user, profile, loading } = useAuthStore()

  // Wait for hydration first
  if (!hydrated) {
    return <PageLoadingSpinner message={loadingMessage} />
  }

  // Wait for initialization to complete
  if (!initialized || loading) {
    return <PageLoadingSpinner message={loadingMessage} />
  }

  // If we require a user, wait for profile to be loaded
  if (requireUser && user && !profile) {
    return <PageLoadingSpinner message={loadingMessage} />
  }

  // Auth is ready, render children
  return <>{children}</>
}
