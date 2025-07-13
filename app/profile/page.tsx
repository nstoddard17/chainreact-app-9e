import { redirect } from "next/navigation"
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import ProfileContent from "@/components/profile/ProfileContent"
import { UserProfile } from "@/stores/userProfileStore"

// Server Component to prefetch data
export default async function ProfilePage() {
  let serverProfile: UserProfile | undefined = undefined

  try {
    const supabase = createServerComponentClient({ cookies })
    
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      redirect("/auth/login")
    }
    
    if (user?.id) {
      // Fetch user profile data
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, username, full_name, first_name, last_name, avatar_url, company, job_title, role, updated_at')
        .eq('id', user.id)
        .single()
        
      if (!error && data) {
        serverProfile = data
      }
    }
  } catch (error) {
    console.error("Error fetching server profile:", error)
  }

  // Pass the prefetched data to the client component
  return <ProfileContent serverProfile={serverProfile} />
} 