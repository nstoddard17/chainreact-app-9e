import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')
  const origin = requestUrl.origin

  console.log('Auth callback received:', { code: !!code, error, origin })

  if (error) {
    console.error('OAuth error:', error)
    return NextResponse.redirect(`${origin}/auth/login?error=${error}`)
  }

  if (code) {
    const cookieStore = cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    
    try {
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
      
      if (exchangeError) {
        console.error('Exchange error:', exchangeError)
        return NextResponse.redirect(`${origin}/auth/login?error=exchange_failed`)
      }

      console.log('Session created successfully:', { user: !!data.user, session: !!data.session })
      
      // URL to redirect to after sign in process completes
      return NextResponse.redirect(`${origin}/dashboard`)
    } catch (error) {
      console.error('Error exchanging code for session:', error)
      return NextResponse.redirect(`${origin}/auth/login?error=auth_callback_error`)
    }
  }

  console.log('No code received, redirecting to login')
  return NextResponse.redirect(`${origin}/auth/login?error=no_code`)
}