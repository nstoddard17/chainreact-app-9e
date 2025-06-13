import type { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { refreshTokenIfNeeded } from "@/lib/refresh"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const secret = url.searchParams.get("secret")

  if (secret !== process.env.CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 })
  }

  // Kick off refresh in background
  setTimeout(() => {
    refreshAllTokens().catch(console.error)
  }, 0)

  return new Response("Token refresh job started", { status: 200 })
}

async function refreshAllTokens() {
  console.log("🔄 Starting token refresh for all active integrations...")

  const { data: integrations, error } = await db.from("integrations").select("*").eq("status", "active")

  if (error) {
    console.error("❌ Failed to fetch integrations:", error)
    return
  }

  if (!integrations || integrations.length === 0) {
    console.log("ℹ️ No integrations found for refresh.")
    return
  }

  console.log(`📦 Found ${integrations.length} active integrations.`)

  for (const integration of integrations) {
    try {
      console.log(`🔍 Refreshing token for ${integration.provider} (user: ${integration.user_id})`)
      const result = await refreshTokenIfNeeded(integration)
      console.log(`✅ [${integration.provider}] ${integration.id}: ${result.message}`)
    } catch (err) {
      console.error(`💥 Error processing ${integration.provider} (${integration.id}):`, err)
    }
  }

  console.log("✅ Token refresh process complete.")
}

// Re-export the refreshTokenIfNeeded function
export { refreshTokenIfNeeded }
