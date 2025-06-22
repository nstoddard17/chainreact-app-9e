const { createClient } = require("@supabase/supabase-js");
const aes256 = require("aes256");
const dotenv = require("dotenv");

// Load environment variables from .env.local if it exists
dotenv.config({ path: ".env.local" });

const ENCRYPTION_KEY = "03f19fe097fd94d87cf3ea042f1a10b13a761c43a737251893c28f1022026e64";

function decrypt(encryptedText, secret) {
  try {
    // Validate inputs
    if (!encryptedText || typeof encryptedText !== 'string') {
      throw new Error('Invalid encrypted text provided');
    }
    
    if (!secret || typeof secret !== 'string') {
      throw new Error('Invalid secret key provided');
    }

    const cipher = aes256.createCipher(secret);
    
    try {
      const decrypted = cipher.decrypt(encryptedText);
      
      // Validate the decrypted result
      if (!decrypted || decrypted.length === 0) {
        throw new Error('Decryption resulted in empty string');
      }
      
      return decrypted;
    } catch (innerError) {
      // Handle specific aes256 errors
      console.error('Decryption error:', innerError.message);
      throw new Error(`Decryption failed: ${innerError.message}`);
    }
  } catch (error) {
    // Log the error with specific details but without exposing the encrypted text
    console.error(`Decryption error: ${error.message}, text length: ${encryptedText?.length || 0}`);
    throw new Error(`Failed to decrypt data: ${error.message}`);
  }
}

async function testDatabaseTokens() {
  console.log("Testing decryption of tokens from the database...");
  
  // Create a Supabase client
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("Error: Missing Supabase URL or service role key");
    return;
  }
  
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  
  // Fetch integrations with refresh tokens
  console.log("Fetching integrations with refresh tokens...");
  const { data: integrations, error } = await supabase
    .from("integrations")
    .select("id, provider, refresh_token, status")
    .not("refresh_token", "is", null)
    .limit(20);
  
  if (error) {
    console.error("Error fetching integrations:", error);
    return;
  }
  
  console.log(`Testing decryption for ${integrations.length} tokens...`);
  
  // Track results
  const results = {
    success: 0,
    failed: 0,
    byProvider: {}
  };
  
  // Test decryption for each token
  for (const integration of integrations) {
    const { id, provider, refresh_token, status } = integration;
    
    // Initialize provider stats if not exists
    if (!results.byProvider[provider]) {
      results.byProvider[provider] = { success: 0, failed: 0 };
    }
    
    try {
      // Skip tokens that are obviously invalid
      if (!refresh_token || refresh_token === 'null' || refresh_token === 'undefined' || refresh_token.length < 20) {
        console.log(`Skipping invalid token for ${provider} (${status}): ${refresh_token}`);
        results.failed++;
        results.byProvider[provider].failed++;
        continue;
      }
      
      // Try to decrypt the token
      console.log(`\nTrying to decrypt token for ${provider} (${status}):`);
      console.log(`Token ID: ${id}`);
      console.log(`Token (first 30 chars): ${refresh_token.substring(0, 30)}...`);
      console.log(`Token length: ${refresh_token.length} characters`);
      
      const decrypted = decrypt(refresh_token, ENCRYPTION_KEY);
      
      if (decrypted && decrypted.length > 0) {
        console.log(`✅ Successfully decrypted: ${decrypted.substring(0, 10)}...`);
        results.success++;
        results.byProvider[provider].success++;
      } else {
        console.log(`❌ Decryption returned empty result`);
        results.failed++;
        results.byProvider[provider].failed++;
      }
    } catch (error) {
      console.log(`❌ Failed to decrypt: ${error.message}`);
      results.failed++;
      results.byProvider[provider].failed++;
    }
  }
  
  // Print summary
  console.log("\n=== Decryption Test Results ===");
  console.log(`Total tokens tested: ${integrations.length}`);
  console.log(`Successful decryptions: ${results.success}`);
  console.log(`Failed decryptions: ${results.failed}`);
  console.log("\nResults by provider:");
  
  for (const [provider, stats] of Object.entries(results.byProvider)) {
    const total = stats.success + stats.failed;
    const successRate = total > 0 ? Math.round((stats.success / total) * 100) : 0;
    console.log(`${provider}: ${stats.success}/${total} (${successRate}% success)`);
  }
  
  // Provide recommendations
  console.log("\n=== Recommendations ===");
  if (results.failed > 0) {
    console.log("Some tokens could not be decrypted with the provided key. Possible causes:");
    console.log("1. Tokens were encrypted with a different key");
    console.log("2. Tokens are corrupted in the database");
    console.log("3. The tokens were not encrypted with aes256 library");
    console.log("\nRecommended actions:");
    console.log("- Run the cleanup mode of the refresh-tokens-simple cron job to reset problematic tokens");
    console.log("- Check if there are any changes to the encryption/decryption implementation");
  } else {
    console.log("All tokens were successfully decrypted. The encryption key is correct.");
  }
}

testDatabaseTokens()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  }); 