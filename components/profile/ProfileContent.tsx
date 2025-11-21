"use client"

import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import ProfileSettings from "@/components/settings/ProfileSettings"
import { useEffect, useRef } from "react"
import { useUserProfileStore, loadUserProfile, UserProfile } from "@/stores/userProfileStore"
import { useAuthStore } from "@/stores/authStore"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { logger } from '@/lib/utils/logger'

export default function ProfileContent() {

  // Get auth state and profile from stores
  const { user, isAuthenticated } = useAuthStore()
  const { data: profile, loading, error } = useUserProfileStore()
  const router = useRouter()

  // Prevent double-fetch in React Strict Mode
  const hasFetchedRef = useRef(false)

  useEffect(() => {
    // Redirect to login if not authenticated
    if (!isAuthenticated && !user) {
      router.push('/auth/login')
      return
    }

    // Load profile from API when authenticated (only once)
    if (user && !hasFetchedRef.current) {
      hasFetchedRef.current = true
      loadUserProfile()
    }
  }, [user, isAuthenticated, router])

  // Handle loading state
  if (loading && !profile) {
    return (
      <NewAppLayout title="Profile">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <p className="text-lg text-muted-foreground">Loading profile...</p>
          </div>
        </div>
      </NewAppLayout>
    )
  }

  // Handle error state
  if (error && !profile) {
    return (
      <div className="p-8 text-red-500">
        Error loading profile: {error}
      </div>
    )
  }

  // No profile available
  if (!profile) {
    return <div className="p-8">No profile found</div>
  }

  return (
    <NewAppLayout title="Profile">
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Profile</h1>
          <p className="text-muted-foreground mt-2">Manage your profile information and preferences.</p>
        </div>

        <ProfileSettings />
      </div>
    </NewAppLayout>
  )
}

// Note: This component uses App Router client component pattern
// Server-side data fetching should be done in a parent Server Component if needed 