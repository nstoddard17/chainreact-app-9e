import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse } from 'next/server'

import { logger } from '@/lib/utils/logger'
import type { NextRequest } from 'next/server'

// Define page access rules
const pageAccessRules = {
  '/workflows': ['free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin'],
  '/integrations': ['free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin'],
  '/learn': ['free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin'],
  '/community': ['free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin'],
  '/analytics': ['pro', 'beta-pro', 'business', 'enterprise', 'admin'],
  '/teams': ['business', 'enterprise', 'admin'],
  '/enterprise': ['enterprise', 'admin'],
  '/admin': ['admin'],
  '/profile': ['free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin'],
  '/settings': ['free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin'],
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname

  // Security: Block potentially dangerous HTTP methods (TRACE, TRACK)
  // These methods can be used for XSS attacks and server fingerprinting
  const method = req.method.toUpperCase()
  if (method === 'TRACE' || method === 'TRACK') {
    return new NextResponse('Method Not Allowed', {
      status: 405,
      headers: {
        'Allow': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }

  // Skip middleware for auth pages, API routes, and static files
  if (pathname.startsWith('/auth/login') ||
      pathname.startsWith('/auth/register') ||
      pathname.startsWith('/api/') ||
      pathname.startsWith('/_next/') ||
      pathname === '/' ||
      pathname.includes('.')) {
    return NextResponse.next()
  }
  
  const res = NextResponse.next({
    request: {
      headers: req.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieEncoding: 'raw',
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value)
            res.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Create a service role client for reading user profiles (bypasses RLS)
  const supabaseAdmin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookieEncoding: 'raw',
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value)
            res.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  try {
    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser()

    // If no user, redirect to login (except for setup-username page)
    if (!user) {
      if (!pathname.startsWith('/auth/')) {
        return NextResponse.redirect(new URL('/auth/login', req.url))
      }
      return res
    }

    // ALWAYS fetch fresh profile data - no caching
    // Use admin client to bypass RLS
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('role, username, provider, admin')
      .eq('id', user.id)
      .single()

    const isBetaTester = profile?.role === 'beta-pro' || user.user_metadata?.is_beta_tester === true
    const accountAge = new Date().getTime() - new Date(user.created_at).getTime()
    const isNewBetaUser = isBetaTester && accountAge < 60000 // Less than 1 minute old

    logger.debug('[Middleware] Username check:', {
      path: pathname,
      userId: user.id,
      provider: profile?.provider,
      role: profile?.role,
      username: profile?.username,
      hasUsername: !!(profile?.username && profile.username.trim() !== ''),
      isBetaTester,
      isNewBetaUser,
      accountAge,
      profileError: profileError?.message
    })

    // If no profile exists, check user type
    if (profileError && profileError.code === 'PGRST116') {
      // Give new beta users a grace period for profile creation
      if (isNewBetaUser) {
        logger.debug('[Middleware] New beta user, profile still being created, allowing access')
        return res
      }

      const isGoogleUser = user.app_metadata?.provider === 'google' ||
                          user.app_metadata?.providers?.includes('google') ||
                          user.identities?.some(id => id.provider === 'google')

      if (isGoogleUser && !pathname.startsWith('/auth/setup-username')) {
        logger.debug('[Middleware] Google user without profile, redirecting to setup')
        return NextResponse.redirect(new URL('/auth/setup-username', req.url))
      }

      // For other users without profiles after grace period
      if (!pathname.startsWith('/auth/setup-username')) {
        logger.debug('[Middleware] User without profile, redirecting to setup')
        return NextResponse.redirect(new URL('/auth/setup-username', req.url))
      }
    }

    // CHECK USERNAME FOR ALL USERS
    // If username is missing or empty, redirect to setup (but give beta users grace period)
    if ((!profile?.username || profile.username.trim() === '' || profile.username === null) &&
        !pathname.startsWith('/auth/setup-username')) {

      // Give new beta users a grace period
      if (isNewBetaUser) {
        logger.debug('[Middleware] New beta user without username yet, allowing temporary access')
        // Set a temporary redirect after grace period
        if (accountAge > 30000) { // After 30 seconds
          logger.debug('[Middleware] Beta user grace period expired, redirecting to setup')
          return NextResponse.redirect(new URL('/auth/setup-username', req.url))
        }
        return res
      }

      logger.debug('[Middleware] User without username, redirecting to setup', {
        username: profile?.username,
        provider: profile?.provider
      })
      return NextResponse.redirect(new URL('/auth/setup-username', req.url))
    }

    // Check if user is admin - admins can access everything
    const isAdmin = profile?.admin === true
    const userRole = isAdmin ? 'admin' : (profile?.role || 'free')

    // DEBUG: Log admin check for /admin route
    if (pathname === '/admin') {
      console.log('🔍 MIDDLEWARE - Admin route check:', {
        pathname,
        profileAdmin: profile?.admin,
        profileRole: profile?.role,
        isAdmin,
        userRole,
        hasProfile: !!profile
      })
    }

    // Check if the page has access rules
    const allowedRoles = pageAccessRules[pathname as keyof typeof pageAccessRules]

    if (allowedRoles && !allowedRoles.includes(userRole)) {
      console.log('🚫 MIDDLEWARE - Access denied:', {
        pathname,
        userRole,
        allowedRoles,
        redirecting: true
      })
      // Redirect to workflows if user doesn't have access
      return NextResponse.redirect(new URL('/workflows', req.url))
    }

    return res
  } catch (error) {
    // If there's an error (like cookie parsing), just continue without authentication
    console.debug("Middleware auth error (expected):", error)
    return res
  }
}

async function trackUsage(supabase: any, userId: string, resourceType: string, action: string) {
  try {
    // Log the usage
    await supabase.from("usage_logs").insert({
      user_id: userId,
      resource_type: resourceType,
      action,
      quantity: 1,
    })

    // Update monthly usage
    const currentDate = new Date()
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth() + 1

    const updateField = getUsageField(resourceType)
    if (updateField) {
      await supabase.rpc("increment_monthly_usage", {
        p_user_id: userId,
        p_year: year,
        p_month: month,
        p_field: updateField,
        p_increment: 1,
      })
    }
  } catch (error) {
    logger.error("Usage tracking error:", error)
  }
}

function getUsageField(resourceType: string): string | null {
  const fieldMap: Record<string, string> = {
    workflow: "workflow_count",
    execution: "execution_count",
    integration: "integration_count",
    storage: "storage_used_mb",
    team_member: "team_member_count",
  }
  return fieldMap[resourceType] || null
}

export const config = {
  matcher: [
    '/workflows/:path*',
    '/integrations/:path*',
    '/analytics/:path*',
    '/teams/:path*',
    '/enterprise/:path*',
    '/admin/:path*',
    '/learn/:path*',
    '/community/:path*',
    '/profile',
    '/settings/:path*',
  ],
}
