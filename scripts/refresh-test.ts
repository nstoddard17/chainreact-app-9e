import { createAdminClient } from "../lib/supabase/admin";
import { refreshTokenIfNeeded } from "../lib/integrations/tokenRefresher";

// This script can be run manually to test token refresh logic

async function main() {
  console.log("Token refresh test script starting...");
  const supabase = createAdminClient();
  
  if (!supabase) {
    console.error("Failed to create admin client");
    return;
  }
  
  // Get expired or soon-to-expire integrations
  const now = new Date().toISOString();
  const { data: integrations, error } = await supabase
    .from("integrations")
    .select("*")
    .or(`status.eq.expired,status.eq.needs_reauthorization,and(expires_at.lt.${now},status.eq.connected)`)
    .not("refresh_token", "is", null)
    .limit(10);
  
  if (error) {
    console.error("Error fetching integrations:", error);
    return;
  }
  
  console.log(`Found ${integrations?.length || 0} expired/expiring integrations with refresh tokens`);
  
  // Process each integration
  for (const integration of integrations || []) {
    console.log("\n-------------------------------------------");
    console.log(`Processing ${integration.provider} integration (${integration.id})`);
    console.log(`Current status: ${integration.status}`);
    console.log(`Expires at: ${integration.expires_at || "No expiry"}`);
    console.log(`Has refresh token: ${!!integration.refresh_token}`);
    
    try {
      console.log("Attempting to refresh token...");
      const result = await refreshTokenIfNeeded(integration);
      
      console.log("Refresh result:", {
        success: result.success,
        refreshed: result.refreshed,
        recovered: result.recovered,
        message: result.message,
        hasNewToken: !!result.newToken,
        hasNewRefreshToken: !!result.newRefreshToken
      });
      
      if (result.updatedIntegration) {
        console.log("Updated integration status:", result.updatedIntegration.status);
        console.log("New expiry:", result.updatedIntegration.expires_at);
      }
    } catch (error) {
      console.error("Error refreshing token:", error);
    }
  }
  
  console.log("\nScript complete!");
}

main().catch(console.error); 