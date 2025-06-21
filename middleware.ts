import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { updateSession } from "@/utils/supabase/middleware"

export async function middleware(request: NextRequest) {
  try {
    const url = request.nextUrl
    const hostname = request.headers.get("host") || ""
    const pathname = request.nextUrl.pathname

    // Handle www to non-www redirect
    if (hostname.startsWith("www.")) {
      const newHostname = hostname.replace(/^www\./, "")
      return NextResponse.redirect(new URL(url.pathname + url.search, `https://${newHostname}`), 301)
    }

    // The new matcher in config is good, but this is an extra layer of safety
    if (
      pathname.startsWith("/_next") ||
      pathname.startsWith("/auth") ||
      pathname.includes(".")
    ) {
      return NextResponse.next()
    }

    const { response, supabase, user } = await updateSession(request)

    // Protected routes
    const protectedRoutes = [
      "/dashboard",
      "/workflows",
      "/integrations",
      "/analytics",
      "/settings",
      "/teams",
      "/templates",
      "/enterprise",
      "/learn",
      "/community",
    ]

    const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route))

    // Only redirect if no user and accessing protected route
    if (!user && isProtectedRoute) {
      const redirectUrl = new URL("/auth/login", request.url)
      redirectUrl.searchParams.set("redirectTo", pathname)
      return NextResponse.redirect(redirectUrl)
    }

    // Track API usage if user exists
    // Note: The matcher for this middleware excludes /api routes, so this tracking logic might not be hit.
    // We may need to adjust the matcher if we want to track API usage here.
    if (user && pathname.startsWith("/api/")) {
      if (pathname.startsWith("/api/workflows/execute")) {
        await trackUsage(supabase, user.id, "execution", "run")
      } else if (pathname.startsWith("/api/workflows") && request.method === "POST") {
        await trackUsage(supabase, user.id, "workflow", "create")
      } else if (pathname.startsWith("/api/integrations") && request.method === "POST") {
        await trackUsage(supabase, user.id, "integration", "connect")
      }
    }

    return response
  } catch (error) {
    console.error("Middleware error:", error)
    // Don't redirect on middleware errors, let the app handle it
    return NextResponse.next()
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
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     *
     * We are explicitly NOT excluding /api routes here to allow for usage tracking,
     * but we are excluding static assets and auth routes.
     */
    "/((?!_next/static|_next/image|favicon.ico|auth/login).*)",
  ],
}
