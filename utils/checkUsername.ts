import { createSupabaseServerClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"

export async function requireUsername() {
  const supabase = await createSupabaseServerClient()
  
  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  
  // If not logged in, redirect to login
  if (userError || !user) {
    redirect("/auth/login")
  }
  
  // ALWAYS fetch fresh profile data - no caching
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('username, provider')
    .eq('id', user.id)
    .single()
  
  console.log('[Username Check]', {
    userId: user.id,
    email: user.email,
    provider: profile?.provider,
    username: profile?.username,
    hasUsername: !!(profile?.username && profile.username.trim() !== ''),
    isGoogleUser: profile?.provider === 'google'
  })
  
  // If profile doesn't exist, create it (for Google users)
  if (profileError && profileError.code === 'PGRST116') {
    // Check if this is a Google user
    const isGoogleUser = user.app_metadata?.provider === 'google' || 
                        user.app_metadata?.providers?.includes('google') ||
                        user.identities?.some(id => id.provider === 'google')
    
    if (isGoogleUser) {
      // Create profile for Google user
      const metadata = user.user_metadata
      const fullName = metadata?.full_name || metadata?.name || ''
      const nameParts = fullName.split(' ')
      
      await supabase.from('user_profiles').insert({
        id: user.id,
        email: user.email,
        first_name: metadata?.given_name || nameParts[0] || '',
        last_name: metadata?.family_name || nameParts.slice(1).join(' ') || '',
        full_name: fullName,
        avatar_url: metadata?.avatar_url || metadata?.picture,
        provider: 'google',
        role: 'free',
        username: null, // Explicitly NULL for Google users
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      
      // Redirect to username setup
      redirect("/auth/setup-username")
    }
  }
  
  // Check if username is missing (for any user, but especially Google users)
  if (!profile?.username || profile.username.trim() === '') {
    console.log('[Username Check] No username found, checking if Google user...')
    
    // For Google users, always redirect to setup
    if (profile?.provider === 'google') {
      console.log('[Username Check] Google user without username, redirecting to setup')
      redirect("/auth/setup-username")
    }
    
    // For other providers, this shouldn't happen, but handle it
    console.log('[Username Check] Non-Google user without username, redirecting to setup')
    redirect("/auth/setup-username")
  }
  
  return { user, profile }
}