"use client"

import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import ProfileSettings from "@/components/settings/ProfileSettings"
import { useEffect } from "react"
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
  
  useEffect(() => {
    // Redirect to login if not authenticated
    if (!isAuthenticated && !user) {
      router.push('/auth/login')
      return
    }
    
    // Load profile from API when authenticated
    if (user) {
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
    logger.error("Error in getServerSideProps:", error)
    return { props: {} }
  }
} 