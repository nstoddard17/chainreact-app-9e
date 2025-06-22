import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { decrypt } from "@/lib/security/encryption"
import { getSecret } from "@/lib/secrets"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams
  const cleanupMode = searchParams.get("cleanup") === "true"
  
  console.log(`Starting refresh-tokens-simple cron job ${cleanupMode ? "(cleanup mode)" : ""}`)
  
  // Create a Supabase client with the service role key for admin access
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
  
  const encryptionKey = await getSecret("encryption_key")
  
  if (!encryptionKey) {
    console.error("Missing encryption key")
    return NextResponse.json({ error: "Configuration error" }, { status: 500 })
  }
  
  // Statistics tracking
  const stats = {
    processed: 0,
    successful: 0,
    failed: 0,
    cleaned: 0,
    errors: {} as Record<string, number>
  }
  
  try {
    // Get integrations that need token refresh
    const { data: integrations, error } = await supabase
      .from("integrations")
      .select("*")
      .not("refresh_token", "is", null)
      .order("provider")
    
    if (error) {
      console.error("Error fetching integrations:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    console.log(`Found ${integrations.length} integrations with refresh tokens`)
    
    for (const integration of integrations) {
      const { id, provider, refresh_token, status } = integration
      stats.processed++
      
      try {
        // Skip tokens that are obviously invalid
        if (!refresh_token || refresh_token === 'null' || refresh_token === 'undefined' || refresh_token.length < 20) {
          console.log(`Skipping invalid token for ${provider} (ID: ${id}): ${refresh_token}`)
          
          if (cleanupMode) {
            // In cleanup mode, mark these for reauthorization
            await supabase
              .from("integrations")
              .update({
                refresh_token: null,
                status: "needs_reauthorization",
                last_error: "Invalid token format detected during cleanup"
              })
              .eq("id", id)
            
            console.log(`Cleaned up invalid token for ${provider} (ID: ${id})`)
            stats.cleaned++
          }
          
          stats.failed++
          stats.errors["invalid_token_format"] = (stats.errors["invalid_token_format"] || 0) + 1
          continue
        }
        
        // Try to decrypt the token
        let decrypted
        try {
          decrypted = decrypt(refresh_token, encryptionKey)
        } catch (decryptError: any) {
          console.error(`Decryption error for ${provider} (ID: ${id}): ${decryptError.message}`)
          
          if (cleanupMode) {
            // In cleanup mode, mark these for reauthorization
            await supabase
              .from("integrations")
              .update({
                refresh_token: null,
                status: "needs_reauthorization",
                last_error: `Decryption failed: ${decryptError.message}`
              })
              .eq("id", id)
            
            console.log(`Cleaned up token with decryption error for ${provider} (ID: ${id})`)
            stats.cleaned++
          }
          
          stats.failed++
          stats.errors["decryption_error"] = (stats.errors["decryption_error"] || 0) + 1
          continue
        }
        
        if (!decrypted || decrypted.length === 0) {
          console.error(`Decryption returned empty result for ${provider} (ID: ${id})`)
          
          if (cleanupMode) {
            // In cleanup mode, mark these for reauthorization
            await supabase
              .from("integrations")
              .update({
                refresh_token: null,
                status: "needs_reauthorization",
                last_error: "Decryption returned empty result"
              })
              .eq("id", id)
            
            console.log(`Cleaned up token with empty decryption for ${provider} (ID: ${id})`)
            stats.cleaned++
          }
          
          stats.failed++
          stats.errors["empty_decryption"] = (stats.errors["empty_decryption"] || 0) + 1
          continue
        }
        
        // If not in cleanup mode and we got here, we would proceed with token refresh
        // But in this simplified version, we just count it as successful
        if (!cleanupMode) {
          // In a real implementation, we would refresh the token here
          console.log(`Successfully decrypted token for ${provider} (ID: ${id})`)
        } else {
          console.log(`Token for ${provider} (ID: ${id}) is valid, no cleanup needed`)
        }
        
        stats.successful++
      } catch (error: any) {
        console.error(`Error processing ${provider} (ID: ${id}): ${error.message}`)
        stats.failed++
        stats.errors["processing_error"] = (stats.errors["processing_error"] || 0) + 1
      }
    }
    
    // Return summary
    return NextResponse.json({
      message: `Completed refresh-tokens-simple cron job ${cleanupMode ? "(cleanup mode)" : ""}`,
      stats: {
        processed: stats.processed,
        successful: stats.successful,
        failed: stats.failed,
        cleaned: stats.cleaned,
        errors: stats.errors
      }
    })
  } catch (error: any) {
    console.error("Unhandled error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
