"use client"

import AppLayout from "@/components/layout/AppLayout"
import ProfileSettings from "@/components/settings/ProfileSettings"
import { useEffect } from "react"
import { useUserProfileStore, loadUserProfile, UserProfile } from "@/stores/userProfileStore"
import useCacheManager from "@/hooks/use-cache-manager"

export default function ProfileContent({ serverProfile }: { serverProfile?: UserProfile }) {
  // Setup cache manager to handle auth state changes
  useCacheManager()
  
  // Get profile from store
  const { data: profile, loading, error } = useUserProfileStore()
  
  useEffect(() => {
    // If we have server-side data, hydrate the store
    if (serverProfile) {
      useUserProfileStore.getState().setData(serverProfile)
    } else {
      // Otherwise load from API
      loadUserProfile()
    }
  }, [serverProfile])

  // Handle loading state
  if (loading && !profile) {
    return <div className="p-8">Loading profile...</div>
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
    <AppLayout title="Profile">
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Profile</h1>
          <p className="text-muted-foreground mt-2">Manage your profile information and preferences.</p>
        </div>

        <ProfileSettings />
      </div>
    </AppLayout>
  )
}

// Optional: Server component to prefetch data
export async function getServerSideProps() {
  try {
    // This example uses Next.js Pages Router
    // For App Router, you would use a Server Component instead
    const { createServerComponentClient } = await import("@supabase/auth-helpers-nextjs")
    const { cookies } = await import("next/headers")
    
    const supabase = createServerComponentClient({ cookies })
    
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      throw new Error("Not authenticated")
    }
    
    // Fetch user profile
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, username, full_name, first_name, last_name, avatar_url, company, job_title, role, updated_at')
      .eq('id', user.id)
      .single()
      
    if (error || !data) {
      return { props: {} }
    }
    
    // Pass data to client
    return {
      props: {
        serverProfile: data
      }
    }
  } catch (error) {
    console.error("Error in getServerSideProps:", error)
    return { props: {} }
  }
} 