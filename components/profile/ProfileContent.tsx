"use client"

import ProfileSettings from "@/components/settings/ProfileSettings"
import { useEffect, useRef } from "react"
import { useUserProfileStore, loadUserProfile } from "@/stores/userProfileStore"
import { useAuthStore } from "@/stores/authStore"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

export default function ProfileContent() {
  const { user, isAuthenticated } = useAuthStore()
  const { data: profile, loading, error } = useUserProfileStore()
  const router = useRouter()
  const hasFetchedRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated && !user) {
      router.push('/auth/login')
      return
    }
    if (user && !hasFetchedRef.current) {
      hasFetchedRef.current = true
      loadUserProfile()
    }
  }, [user, isAuthenticated, router])

  if (loading && !profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error && !profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-sm text-red-500">Error loading profile: {error}</p>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-sm text-gray-500">No profile found</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Profile</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage your profile information and preferences.</p>
      </div>

      <ProfileSettings />
    </div>
  )
}
