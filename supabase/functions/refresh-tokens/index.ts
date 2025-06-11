import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const VERCEL_URL = Deno.env.get("VERCEL_URL") || "https://your-app.vercel.app"
const CRON_SECRET = Deno.env.get("CRON_SECRET")

serve(async (req) => {
  try {
    // Verify request is authorized (optional additional security)
    const authHeader = req.headers.get("authorization")
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }

    console.log("🔄 Supabase Edge Function: Starting token refresh job...")

    // Call your existing token refresh endpoint
    const response = await fetch(`${VERCEL_URL}/api/cron/refresh-tokens`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${CRON_SECRET}`,
        "Content-Type": "application/json",
      },
    })

    const result = await response.json()

    console.log("✅ Token refresh job completed via Supabase")

    // Return the result from your API
    return new Response(
      JSON.stringify({
        success: true,
        message: "Token refresh job triggered successfully",
        result,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    )
  } catch (error) {
    console.error("💥 Error in Supabase token refresh function:", error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Unknown error",
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    )
  }
})
