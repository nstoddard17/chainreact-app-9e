import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs"

export async function middleware(request: NextRequest) {
  const res = NextResponse.next()

  try {
    const url = request.nextUrl.pathname

    // Skip middleware for static files and API routes (except protected ones)
    if (
      url.startsWith("/_next") ||
      url.startsWith("/api/auth") ||
      url.includes("/callback") ||
      url.startsWith("/auth/")
    ) {
      return res
    }

    // Create middleware client
    const supabase = createMiddlewareClient({ req: request, res })

    // Check if user is authenticated
    const {
      data: { session },
    } = await supabase.auth.getSession()

    // Define protected routes
    const isProtectedRoute =
      url.startsWith("/dashboard") ||
      url.startsWith("/workflows") ||
      url.startsWith("/integrations") ||
      url.startsWith("/analytics") ||
      url.startsWith("/settings") ||
      url.startsWith("/teams") ||
      url.startsWith("/templates") ||
      url.startsWith("/enterprise") ||
      url.startsWith("/learn") ||
      url.startsWith("/community")

    // For development, be more lenient
    const isDevelopment = process.env.NODE_ENV === "development"

    // Only redirect if we're absolutely sure there's no session and it's a protected route
    if (!session && isProtectedRoute && !isDevelopment) {
      console.log("Middleware: No session found, redirecting to login")
      return NextResponse.redirect(new URL("/auth/login", request.url))
    }

    // Track API usage if session exists
    if (session && url.startsWith("/api/")) {
      if (url.startsWith("/api/workflows/execute")) {
        await trackUsage(supabase, session.user.id, "execution", "run")
      } else if (url.startsWith("/api/workflows") && request.method === "POST") {
        await trackUsage(supabase, session.user.id, "workflow", "create")
      } else if (url.startsWith("/api/integrations") && request.method === "POST") {
        await trackUsage(supabase, session.user.id, "integration", "connect")
      }
    }
  } catch (error) {
    console.error("Middleware error:", error)
    // In case of error, don't redirect - let client handle auth
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg).*)"],
}
