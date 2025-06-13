import { db } from "@/lib/db"
import { refreshTokenIfNeeded } from "@/lib/refresh"

/**
 * Script to manually refresh tokens for specific providers
 */
async function manualTokenRefresh() {
  const providers = ["hubspot", "onedrive", "gitlab"]

  console.log(`Starting manual token refresh for providers: ${providers.join(", ")}`)

  for (const provider of providers) {
    console.log(`\n--- Processing ${provider} tokens ---`)

    // Get all integrations for this provider
    const { data: integrations, error } = await db
      .from("integrations")
      .select("*")
      .eq("provider", provider)
      .not("refresh_token", "is", null)

    if (error) {
      console.error(`Error fetching ${provider} integrations:`, error)
      continue
    }

    if (!integrations || integrations.length === 0) {
      console.log(`No ${provider} integrations found with refresh tokens`)
      continue
    }

    console.log(`Found ${integrations.length} ${provider} integrations to refresh`)

    // Process each integration
    for (const integration of integrations) {
      try {
        console.log(`\nRefreshing ${provider} token for user ${integration.user_id}:`)
        console.log(`- Integration ID: ${integration.id}`)
        console.log(`- Status: ${integration.status}`)
        console.log(`- Expires at: ${integration.expires_at || "Not set"}`)

        const result = await refreshTokenIfNeeded(integration)

        console.log(`- Result: ${result.success ? "Success" : "Failed"}`)
        console.log(`- Message: ${result.message}`)

        if (result.refreshed) {
          console.log(`✅ Successfully refreshed ${provider} token`)
        } else if (!result.success) {
          console.log(`❌ Failed to refresh ${provider} token`)
        }
      } catch (error) {
        console.error(`Error processing ${provider} integration ${integration.id}:`, error)
      }
    }
  }

  console.log("\nManual token refresh completed")
}

// Run the script
manualTokenRefresh()
  .then(() => {
    console.log("Script execution completed")
    process.exit(0)
  })
  .catch((error) => {
    console.error("Script execution failed:", error)
    process.exit(1)
  })
