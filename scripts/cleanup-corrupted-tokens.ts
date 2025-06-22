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
  let byProvider: Record<string, number> = {};
  
  // Known problematic providers based on logs
  const knownProblematicProviders = ['box', 'youtube-studio', 'discord'];
  
  // Known problematic token lengths
  const problematicLengths = [29, 56];
  
  // Process each integration
  for (const integration of integrations || []) {
    processed++;
    
    if (processed % 10 === 0) {
      console.log(`📈 Progress: ${processed}/${integrations?.length || 0} integrations processed`);
    }
    
    try {
      let isCorrupted = false;
      let reason = '';
      
      // Check for known problematic providers
      if (knownProblematicProviders.includes(integration.provider)) {
        isCorrupted = true;
        reason = `Known problematic provider: ${integration.provider}`;
      }
      
      // Check for problematic token lengths
      if (integration.refresh_token && problematicLengths.includes(integration.refresh_token.length)) {
        isCorrupted = true;
        reason = `Problematic token length: ${integration.refresh_token.length}`;
      }
      
      // Try to decrypt the refresh token
      if (!isCorrupted) {
        try {
          const decryptedToken = decrypt(integration.refresh_token, secret);
          
          // If decryption succeeded and token looks valid, continue to next integration
          if (decryptedToken && decryptedToken.length >= 10) {
            continue;
          }
          
          // If we got here, the token decrypted but is invalid
          isCorrupted = true;
          reason = 'Token decrypted but is invalid or too short';
        } catch (decryptError) {
          // Decryption failed, token is corrupted
          isCorrupted = true;
          reason = `Decryption error: ${(decryptError as Error).message}`;
        }
      }
      
      // If token is corrupted, mark it for reauthorization
      if (isCorrupted) {
        corrupted++;
        
        // Track by provider
        byProvider[integration.provider] = (byProvider[integration.provider] || 0) + 1;
        
        console.log(`⚠️ Integration ${integration.id} (${integration.provider}) has a corrupted token: ${reason}`);
        
        // Skip if already marked as needs_reauthorization
        if (integration.status === 'needs_reauthorization') {
          console.log(`ℹ️ Integration ${integration.id} is already marked as needs_reauthorization`);
          continue;
        }
        
        // Mark the integration as needing reauthorization
        const { error: updateError } = await supabase
          .from("integrations")
          .update({
            status: "needs_reauthorization",
            updated_at: new Date().toISOString(),
            disconnect_reason: `Token cleanup: ${reason}`,
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
  
  // Print breakdown by provider
  console.log(`\n📊 Breakdown by provider:`);
  Object.entries(byProvider)
    .sort((a, b) => b[1] - a[1])
    .forEach(([provider, count]) => {
      console.log(`   - ${provider}: ${count}`);
    });
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