import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'
  const type = searchParams.get('type') // Check if this is an email confirmation

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            cookieStore.set({ name, value, ...options })
          },
          remove(name: string, options: any) {
            cookieStore.set({ name, value: '', ...options })
          },
        },
      }
    )

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('Auth callback error:', error)
      
      // Check for specific error types
      if (error.message.includes('expired') || error.message.includes('invalid')) {
        // Token expired or invalid
        return NextResponse.redirect(`${origin}/auth/error?type=expired-link&message=${encodeURIComponent('Your confirmation link has expired or is invalid. Please request a new one.')}`)
      }
      
      // Generic error
      return NextResponse.redirect(`${origin}/auth/auth-code-error?error=${encodeURIComponent(error.message)}`)
    }

    if (!error && data.user) {
      // Debug logging to understand the auth flow
      console.log('Auth callback - User data:', {
        id: data.user.id,
        email: data.user.email,
        email_confirmed_at: data.user.email_confirmed_at,
        created_at: data.user.created_at,
        last_sign_in_at: data.user.last_sign_in_at,
        type_param: type,
      })

      // Check if this is an email confirmation
      // Supabase automatically signs the user in when they click the confirmation link
      // The session is already established via exchangeCodeForSession above
      
      // Check if user profile exists - if not, it's likely a new signup
      const { data: existingProfile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('id', data.user.id)
        .single()
      
      const isNewUser = !existingProfile
      
      // Check if this is a recent email confirmation (within last 15 minutes of creation)
      const userCreatedRecently = data.user.created_at && 
        (new Date().getTime() - new Date(data.user.created_at).getTime() < 900000) // 15 minutes
      
      // Check if the email was recently confirmed (within last minute)
      const emailJustConfirmed = data.user.email_confirmed_at &&
        (new Date().getTime() - new Date(data.user.email_confirmed_at).getTime() < 60000) // 1 minute
      
      const isEmailConfirmation = type === 'email-confirmation' || 
        (data.user.email_confirmed_at && (isNewUser || userCreatedRecently || emailJustConfirmed))

      console.log('Auth callback - Email confirmation check:', {
        isNewUser,
        userCreatedRecently,
        emailJustConfirmed,
        isEmailConfirmation,
      })

      if (isEmailConfirmation) {
        // Email confirmation successful - user is now automatically signed in
        // Create profile if it doesn't exist
        if (isNewUser) {
          const metadata = data.user.user_metadata
          const { error: insertError } = await supabase
            .from('user_profiles')
            .insert({
              id: data.user.id,
              email: data.user.email,
              first_name: metadata?.first_name,
              last_name: metadata?.last_name,
              full_name: metadata?.full_name,
              username: metadata?.username,
              provider: 'email',
              role: 'free',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
          
          if (insertError) {
            console.error('Error creating profile during email confirmation:', insertError)
          }
        }

        // User is already signed in via exchangeCodeForSession
        // Redirect directly to dashboard
        console.log('Email confirmation successful, redirecting to dashboard')
        return NextResponse.redirect(`${origin}/dashboard`)
      }

      // For regular OAuth login (Google, etc)
      // Check if this is a Google sign-in
      const isGoogleAuth = data.user.app_metadata?.provider === 'google' || 
                          data.user.app_metadata?.providers?.includes('google') ||
                          data.user.identities?.some(id => id.provider === 'google')
      
      console.log('OAuth callback - Is Google auth:', isGoogleAuth, {
        provider: data.user.app_metadata?.provider,
        providers: data.user.app_metadata?.providers,
        identities: data.user.identities?.map(id => id.provider)
      })
      
      if (isGoogleAuth) {
        // Always check for username for Google users
        const { data: profileData, error: profileError } = await supabase
          .from('user_profiles')
          .select('username, provider')
          .eq('id', data.user.id)
          .single()
        
        console.log('Profile check result:', { profileData, profileError })
        
        // If profile doesn't exist, create it first
        if (profileError && profileError.code === 'PGRST116') {
          // Extract user info from Google metadata
          const metadata = data.user.user_metadata
          let firstName = metadata?.given_name || ''
          let lastName = metadata?.family_name || ''
          const fullName = metadata?.full_name || metadata?.name || ''
          
          // If we don't have first/last name but have full name, split it
          if ((!firstName || !lastName) && fullName) {
            const nameParts = fullName.split(' ')
            firstName = firstName || nameParts[0] || ''
            lastName = lastName || nameParts.slice(1).join(' ') || ''
          }
          
          console.log('Creating new Google user profile:', {
            id: data.user.id,
            email: data.user.email,
            firstName,
            lastName,
            fullName
          })
          
          // Create the profile WITHOUT a username
          const { error: createError } = await supabase
            .from('user_profiles')
            .insert({
              id: data.user.id,
              email: data.user.email,
              first_name: firstName,
              last_name: lastName,
              full_name: fullName,
              avatar_url: metadata?.avatar_url || metadata?.picture,
              provider: 'google',
              role: 'free',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              // Explicitly set username to null for Google users
              username: null
            })
          
          if (createError) {
            console.error('Error creating Google user profile:', createError)
          }
          
          // Always redirect to username setup for new Google users
          console.log('New Google user created, redirecting to username setup')
          return NextResponse.redirect(`${origin}/auth/setup-username`)
        }
        
        // Check if this is a Google user without username
        // This check should catch ALL Google users without usernames
        if (!profileData?.username || profileData.username === '' || profileData.username === null) {
          console.log('Google user without username detected, redirecting to setup:', {
            hasUsername: !!profileData?.username,
            provider: profileData?.provider
          })
          return NextResponse.redirect(`${origin}/auth/setup-username`)
        }
        
        // Google user has a username, proceed normally
        console.log('Google user has username, proceeding to dashboard')
      }
      
      // User has username or is not Google auth, proceed to dashboard
      return NextResponse.redirect(`${origin}${next}`)
    }

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}