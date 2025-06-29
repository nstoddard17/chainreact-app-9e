import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { updateSession } from "@/utils/supabase/middleware"

// Define page access rules
const pageAccessRules = {
  '/dashboard': ['free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin'],
  '/workflows': ['free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin'],
  '/integrations': ['free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin'],
  '/learn': ['free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin'],
  '/community': ['free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin'],
  '/analytics': ['pro', 'beta-pro', 'business', 'enterprise', 'admin'],
  '/teams': ['business', 'enterprise', 'admin'],
  '/enterprise': ['enterprise', 'admin'],
  '/admin': ['admin'],
  '/setup-username': ['free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin'],
  '/profile': ['free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin'],
  '/settings': ['free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin'],
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  // Check if user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // If no user, allow the request (auth pages will handle redirect)
  if (!user) {
    return res
  }

  // Get user profile to check role
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const userRole = profile?.role || 'free'
  const pathname = req.nextUrl.pathname

  // Check if the page has access rules
  const allowedRoles = pageAccessRules[pathname as keyof typeof pageAccessRules]
  
  if (allowedRoles && !allowedRoles.includes(userRole)) {
    // Redirect to dashboard if user doesn't have access
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return res
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
    console.error("Usage tracking error:", error)
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
    '/dashboard/:path*',
    '/workflows/:path*',
    '/integrations/:path*',
    '/analytics/:path*',
    '/teams/:path*',
    '/enterprise/:path*',
    '/admin/:path*',
    '/learn/:path*',
    '/community/:path*',
    '/setup-username',
    '/profile',
    '/settings/:path*',
  ],
}
