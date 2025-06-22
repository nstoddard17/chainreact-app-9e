import { createClient } from "@supabase/supabase-js"
import { decrypt } from "../lib/security/encryption"
import dotenv from "dotenv"

// Load environment variables from .env.local if it exists
dotenv.config({ path: ".env.local" })

const ENCRYPTION_KEY = "03f19fe097fd94d87cf3ea042f1a10b13a761c43a737251893c28f1022026e64"

async function testTokenDecryption() {
  console.log("Testing token decryption with provided encryption key...")
  
  // Create a Supabase client
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("Error: Missing Supabase URL or service role key")
    return
  }
  
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  
  // Fetch a sample of integrations with refresh tokens
  console.log("Fetching integrations with refresh tokens...")
  const { data: integrations, error } = await supabase
    .from("integrations")
    .select("id, provider, refresh_token, status")
    .not("refresh_token", "is", null)
    .limit(20)
  
  if (error) {
    console.error("Error fetching integrations:", error)
    return
  }
  
  console.log(`Testing decryption for ${integrations.length} tokens...`)
  
  // Track results
  const results = {
    success: 0,
    failed: 0,
    byProvider: {} as Record<string, { success: number; failed: number }>
  }
  
  // Test decryption for each token
  for (const integration of integrations) {
    const { provider, refresh_token, status } = integration
    
    // Initialize provider stats if not exists
    if (!results.byProvider[provider]) {
      results.byProvider[provider] = { success: 0, failed: 0 }
    }
    
    try {
      // Skip tokens that are obviously invalid
      if (!refresh_token || refresh_token === 'null' || refresh_token === 'undefined' || refresh_token.length < 20) {
        console.log(`Skipping invalid token for ${provider} (${status}): ${refresh_token}`)
        results.failed++
        results.byProvider[provider].failed++
        continue
      }
      
      // Try to decrypt the token
      const decrypted = decrypt(refresh_token, ENCRYPTION_KEY)
      
      if (decrypted && decrypted.length > 0) {
        console.log(`✅ Successfully decrypted token for ${provider} (${status}): ${decrypted.substring(0, 10)}...`)
        results.success++
        results.byProvider[provider].success++
      } else {
        console.log(`❌ Decryption returned empty result for ${provider} (${status})`)
        results.failed++
        results.byProvider[provider].failed++
      }
    } catch (error: any) {
      console.log(`❌ Failed to decrypt token for ${provider} (${status}): ${error.message}`)
      results.failed++
      results.byProvider[provider].failed++
    }
  }
  
  // Print summary
  console.log("\n=== Decryption Test Results ===")
  console.log(`Total tokens tested: ${integrations.length}`)
  console.log(`Successful decryptions: ${results.success}`)
  console.log(`Failed decryptions: ${results.failed}`)
  console.log("\nResults by provider:")
  
  for (const [provider, stats] of Object.entries(results.byProvider)) {
    const total = stats.success + stats.failed
    const successRate = total > 0 ? Math.round((stats.success / total) * 100) : 0
    console.log(`${provider}: ${stats.success}/${total} (${successRate}% success)`)
  }
  
  // Provide recommendations
  console.log("\n=== Recommendations ===")
  if (results.failed > 0) {
    console.log("Some tokens could not be decrypted with the provided key. Possible causes:")
    console.log("1. Tokens were encrypted with a different key")
    console.log("2. Tokens are corrupted in the database")
    console.log("3. The encryption/decryption implementation has changed")
    console.log("\nRecommended actions:")
    console.log("- Run the cleanup mode of the refresh-tokens-simple cron job to reset problematic tokens")
    console.log("- Check if there are any changes to the encryption/decryption implementation")
  } else {
    console.log("All tokens were successfully decrypted. The encryption key is correct.")
  }
}

testTokenDecryption()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Unhandled error:", error)
    process.exit(1)
  }) 