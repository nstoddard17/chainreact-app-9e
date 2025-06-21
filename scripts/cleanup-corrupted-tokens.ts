import { createAdminClient } from "../lib/supabase/admin";
import { decrypt } from "../lib/security/encryption";
import { getSecret } from "../lib/secrets";

/**
 * This script identifies and fixes corrupted tokens in the database
 * by marking them as "needs_reauthorization" instead of "expired"
 */
async function cleanupCorruptedTokens() {
  console.log("🧹 Starting token cleanup process...");
  
  // Get the encryption key
  const secret = await getSecret("encryption_key");
  if (!secret) {
    console.error("❌ Failed to get encryption key");
    return;
  }
  
  // Connect to database
  const supabase = createAdminClient();
  if (!supabase) {
    console.error("❌ Failed to create database client");
    return;
  }
  
  console.log("📊 Fetching integrations with refresh tokens...");
  
  // Get all integrations with refresh tokens
  const { data: integrations, error } = await supabase
    .from("integrations")
    .select("*")
    .not("refresh_token", "is", null);
  
  if (error) {
    console.error("❌ Failed to fetch integrations:", error);
    return;
  }
  
  console.log(`✅ Found ${integrations?.length || 0} integrations with refresh tokens`);
  
  // Track stats
  let processed = 0;
  let corrupted = 0;
  let fixed = 0;
  let errors = 0;
  
  // Process each integration
  for (const integration of integrations || []) {
    processed++;
    
    if (processed % 10 === 0) {
      console.log(`📈 Progress: ${processed}/${integrations?.length || 0} integrations processed`);
    }
    
    try {
      // Try to decrypt the refresh token
      try {
        const decryptedToken = decrypt(integration.refresh_token, secret);
        
        // If decryption succeeded and token looks valid, continue to next integration
        if (decryptedToken && decryptedToken.length >= 10) {
          continue;
        }
        
        // If we got here, the token decrypted but is invalid
        corrupted++;
        console.log(`⚠️ Integration ${integration.id} (${integration.provider}) has an invalid token`);
      } catch (decryptError) {
        // Decryption failed, token is corrupted
        corrupted++;
        console.log(`⚠️ Integration ${integration.id} (${integration.provider}) has a corrupted token: ${(decryptError as Error).message}`);
      }
      
      // Mark the integration as needing reauthorization
      const { error: updateError } = await supabase
        .from("integrations")
        .update({
          status: "needs_reauthorization",
          updated_at: new Date().toISOString(),
          disconnect_reason: "Token cleanup: Corrupted refresh token",
        })
        .eq("id", integration.id);
      
      if (updateError) {
        console.error(`❌ Failed to update integration ${integration.id}:`, updateError);
        errors++;
      } else {
        fixed++;
        console.log(`✅ Fixed integration ${integration.id} (${integration.provider})`);
        
        // Create notification for user
        try {
          await supabase.rpc("create_token_expiry_notification", {
            p_user_id: integration.user_id,
            p_provider: integration.provider,
          });
        } catch (notifError) {
          console.error(`Failed to create notification for ${integration.provider}:`, notifError);
        }
      }
    } catch (error) {
      console.error(`❌ Error processing integration ${integration.id}:`, error);
      errors++;
    }
  }
  
  // Print summary
  console.log("\n🏁 Token cleanup completed");
  console.log(`📊 Summary:`);
  console.log(`   - Total processed: ${processed}`);
  console.log(`   - Corrupted tokens found: ${corrupted}`);
  console.log(`   - Successfully fixed: ${fixed}`);
  console.log(`   - Errors: ${errors}`);
}

// Run the cleanup function
cleanupCorruptedTokens()
  .then(() => {
    console.log("✅ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  }); 