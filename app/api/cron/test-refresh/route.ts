import { type NextRequest, NextResponse } from "next/server"
import { createAdminSupabaseClient } from "@/lib/oauth/utils"
import { refreshTokenIfNeeded } from "@/lib/integrations/tokenRefresher"

export const dynamic = "force-dynamic"

// Test endpoint that doesn't require CRON_SECRET for easier manual testing
// Access at: https://chainreact.app/api/cron/test-refresh
export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    console.log("🧪 Starting manual token refresh test...")

    const supabase = createAdminSupabaseClient()
    if (!supabase) {
      return NextResponse.json({ error: "Failed to create Supabase client" }, { status: 500 })
    }

    // Get sample of integrations for testing
    const { data: integrations, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("status", "connected")
      .limit(5) // Limit to 5 for testing

    if (error) {
      return NextResponse.json(
        {
          error: "Database error",
          details: error.message,
        },
        { status: 500 },
      )
    }

    const testResults = {
      totalIntegrations: integrations?.length || 0,
      integrationsWithRefreshTokens: 0,
      testResults: [] as any[],
      databaseConnection: "✅ Connected",
      environmentVariables: checkEnvironmentVariables(),
    }

    if (!integrations || integrations.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No integrations found for testing",
        results: testResults,
        duration: `${Date.now() - startTime}ms`,
      })
    }

    // Test each integration
    for (const integration of integrations) {
      const testResult = {
        provider: integration.provider,
        userId: integration.user_id,
        hasRefreshToken: !!integration.refresh_token,
        expiresAt: integration.expires_at,
        status: integration.status,
        lastRefresh: integration.last_token_refresh,
        testStatus: "skipped",
        message: "",
        tokenPreview: integration.access_token ? `${integration.access_token.substring(0, 10)}...` : "none",
      }

      if (integration.refresh_token) {
        testResults.integrationsWithRefreshTokens++

        try {
          // Test token refresh logic (but don't actually refresh unless needed)
          const refreshResult = await refreshTokenIfNeeded(integration)

          testResult.testStatus = refreshResult.success ? "success" : "failed"
          testResult.message = refreshResult.message

          if (refreshResult.refreshed) {
            testResult.message += " (Token was refreshed)"
          }
        } catch (error: any) {
          testResult.testStatus = "error"
          testResult.message = error.message
        }
      } else {
        testResult.message = "No refresh token available"
      }

      testResults.testResults.push(testResult)
    }

    const duration = Date.now() - startTime

    return NextResponse.json({
      success: true,
      message: "Token refresh test completed",
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      results: testResults,
    })
  } catch (error: any) {
    const duration = Date.now() - startTime
    console.error("💥 Error in token refresh test:", error)

    return NextResponse.json(
      {
        success: false,
        error: "Token refresh test failed",
        details: error.message,
        timestamp: new Date().toISOString(),
        duration: `${duration}ms`,
      },
      { status: 500 },
    )
  }
}

function checkEnvironmentVariables() {
  const requiredVars = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "CRON_SECRET",
    "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "NEXT_PUBLIC_SLACK_CLIENT_ID",
    "SLACK_CLIENT_SECRET",
  ]

  const envStatus: Record<string, string> = {}

  for (const varName of requiredVars) {
    envStatus[varName] = process.env[varName] ? "✅ Set" : "❌ Missing"
  }

  return envStatus
}
