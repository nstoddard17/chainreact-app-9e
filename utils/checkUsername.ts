import { createSupabaseServerClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"

import { logger } from '@/lib/utils/logger'

export async function requireUsername() {
  const supabase = await createSupabaseServerClient()

  // Get current user with increased timeout protection
  const userPromise = supabase.auth.getUser()
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Auth check timeout')), 10000) // Increased to 10 second timeout
  })

  let userResult
  try {
    userResult = await Promise.race([userPromise, timeoutPromise])
  } catch (error) {
    logger.error('[Username Check] Auth check timed out after 10 seconds:', error)
    logger.error('[Username Check] This may indicate Supabase connection issues')
    // On timeout, redirect to login
    redirect("/auth/login")
  }

  const { data: { user }, error: userError } = userResult
  
  // If not logged in, redirect to login
  if (userError || !user) {
    redirect("/auth/login")
  }
  
  // ALWAYS fetch fresh profile data - no caching with timeout
  let profile, profileError
  try {
    const profilePromise = supabase
      .from('user_profiles')
      .select('username, provider')
      .eq('id', user.id)
      .single()

    const profileTimeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Profile fetch timeout')), 5000) // Increased to 5 second timeout
    })

    const result = await Promise.race([profilePromise, profileTimeoutPromise])
    profile = result.data
    profileError = result.error
  } catch (error) {
    logger.error('[Username Check] Profile fetch timed out:', error)
    // On timeout, assume profile doesn't exist and continue with the flow
    profileError = { code: 'TIMEOUT', message: 'Profile fetch timed out' }
  }
  
  logger.debug('[Username Check]', {
    userId: user.id,
    hasEmail: !!user.email,
    provider: profile?.provider,
    hasUsername: !!(profile?.username && profile.username.trim() !== ''),
    isGoogleUser: profile?.provider === 'google'
  })
  
  // If profile doesn't exist, create it (for Google users)
  if (profileError && (profileError.code === 'PGRST116' || profileError.code === 'TIMEOUT')) {
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
    logger.debug('[Username Check] No username found, checking if Google user...')
    
    // For Google users, always redirect to setup
    if (profile?.provider === 'google') {
      logger.debug('[Username Check] Google user without username, redirecting to setup')
      redirect("/auth/setup-username")
    }
    
    // For other providers, this shouldn't happen, but handle it
    logger.debug('[Username Check] Non-Google user without username, redirecting to setup')
    redirect("/auth/setup-username")
  }
  
  return { user, profile }
}