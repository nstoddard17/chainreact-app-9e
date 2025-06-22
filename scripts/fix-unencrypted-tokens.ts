import { createAdminClient } from "../lib/supabase/admin"
import { encrypt } from "../lib/security/encryption"
import { getSecret } from "../lib/secrets"

/**
 * This script identifies and fixes unencrypted tokens in the database
 * by encrypting them properly
 */
async function fixUnencryptedTokens() {
  console.log("🔧 Starting token encryption fix process...")
  
  // Get the encryption key
  const secret = await getSecret("encryption_key")
  if (!secret) {
    console.error("❌ Failed to get encryption key")
    return
  }
  
  // Connect to database
  const supabase = createAdminClient()
  if (!supabase) {
    console.error("❌ Failed to create database client")
    return
  }
  
  console.log("📊 Fetching integrations with tokens...")
  
  // Get all integrations with tokens
  const { data: integrations, error } = await supabase
    .from("integrations")
    .select("*")
  
  if (error) {
    console.error("❌ Failed to fetch integrations:", error)
    return
  }
  
  console.log(`✅ Found ${integrations?.length || 0} integrations`)
  
  // Track stats
  let processed = 0
  let encrypted = 0
  let skipped = 0
  let errors = 0
  let byProvider: Record<string, number> = {}
  
  // Process each integration
  for (const integration of integrations || []) {
    processed++
    const { id, provider, access_token, refresh_token } = integration
    
    // Initialize provider stats if not exists
    if (!byProvider[provider]) {
      byProvider[provider] = 0
    }
    
    try {
      let needsUpdate = false
      const updates: any = {}
      
      // Check if access token needs encryption
      if (access_token && !access_token.includes(':')) {
        // Token doesn't have the IV:encrypted format, so it's likely unencrypted
        try {
          const encryptedAccessToken = encrypt(access_token, secret)
          updates.access_token = encryptedAccessToken
          needsUpdate = true
          console.log(`🔐 Encrypting access token for ${provider} (ID: ${id})`)
        } catch (encryptError) {
          console.log(`⚠️ Skipping access token for ${provider} (ID: ${id}) - may already be encrypted`)
        }
      }
      
      // Check if refresh token needs encryption
      if (refresh_token && !refresh_token.includes(':')) {
        // Token doesn't have the IV:encrypted format, so it's likely unencrypted
        try {
          const encryptedRefreshToken = encrypt(refresh_token, secret)
          updates.refresh_token = encryptedRefreshToken
          needsUpdate = true
          console.log(`🔐 Encrypting refresh token for ${provider} (ID: ${id})`)
        } catch (encryptError) {
          console.log(`⚠️ Skipping refresh token for ${provider} (ID: ${id}) - may already be encrypted`)
        }
      }
      
      // Update the database if needed
      if (needsUpdate) {
        const { error: updateError } = await supabase
          .from("integrations")
          .update(updates)
          .eq("id", id)
        
        if (updateError) {
          console.error(`❌ Failed to update ${provider} (ID: ${id}):`, updateError)
          errors++
        } else {
          encrypted++
          byProvider[provider]++
          console.log(`✅ Successfully encrypted tokens for ${provider} (ID: ${id})`)
        }
      } else {
        skipped++
        console.log(`➖ Skipping ${provider} (ID: ${id}) - tokens already encrypted`)
      }
    } catch (error) {
      console.error(`❌ Error processing ${provider} (ID: ${id}):`, error)
      errors++
    }
  }
  
  // Print summary
  console.log("\n=== Token Encryption Fix Results ===")
  console.log(`Total integrations processed: ${processed}`)
  console.log(`Successfully encrypted: ${encrypted}`)
  console.log(`Skipped (already encrypted): ${skipped}`)
  console.log(`Errors: ${errors}`)
  console.log("\nResults by provider:")
  
  for (const [provider, count] of Object.entries(byProvider)) {
    if (count > 0) {
      console.log(`${provider}: ${count} tokens encrypted`)
    }
  }
  
  if (encrypted > 0) {
    console.log("\n✅ Token encryption fix completed successfully!")
    console.log("The token refresh system should now work properly.")
  } else {
    console.log("\nℹ️ No tokens needed encryption - they were already properly encrypted.")
  }
}

// Run the script
fixUnencryptedTokens().catch(console.error)
