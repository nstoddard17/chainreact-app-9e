import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs"

export async function middleware(request: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req: request, res })

  try {
    // Check if user is authenticated
    const {
      data: { session },
    } = await supabase.auth.getSession()

    // If no session and trying to access protected routes, redirect to login
    const url = request.nextUrl.pathname
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

    // For development, allow access to protected routes even without a session
    const isDevelopment = process.env.NODE_ENV === "development"

    if (!session && isProtectedRoute && !isDevelopment) {
      return NextResponse.redirect(new URL("/auth/login", request.url))
    }

    // If session exists, track API usage for specific endpoints
    if (session && url.startsWith("/api/")) {
      if (url.startsWith("/api/workflows/execute")) {
        // Track workflow execution
        await trackUsage(supabase, session.user.id, "execution", "run")
      } else if (url.startsWith("/api/workflows") && request.method === "POST") {
        // Track workflow creation
        await trackUsage(supabase, session.user.id, "workflow", "create")
      } else if (url.startsWith("/api/integrations") && request.method === "POST") {
        // Track integration creation
        await trackUsage(supabase, session.user.id, "integration", "connect")
      }
    }
  } catch (error) {
    console.error("Middleware error:", error)
    // Continue without tracking or redirecting in case of error
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
