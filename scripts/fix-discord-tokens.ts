import { createClient } from "@supabase/supabase-js"
import { encrypt } from "@/lib/security/encryption"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SECRET_KEY
const encryptionKey = process.env.ENCRYPTION_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing Supabase configuration")
}

if (!encryptionKey) {
  throw new Error("Missing encryption key")
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

async function fixDiscordTokens() {
  console.log("🔍 Checking for Discord integrations with unencrypted tokens...")
  
  try {
    // Get all Discord integrations
    const { data: integrations, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("provider", "discord")
      .eq("status", "connected")
    
    if (error) {
      console.error("❌ Error fetching Discord integrations:", error)
      return
    }
    
    if (!integrations || integrations.length === 0) {
      console.log("ℹ️ No Discord integrations found")
      return
    }
    
    console.log(`📊 Found ${integrations.length} Discord integrations`)
    
    let fixedCount = 0
    
    for (const integration of integrations) {
      console.log(`🔍 Checking integration ID: ${integration.id}`)
      
      let needsUpdate = false
      const updates: any = {}
      
      // Check if access token needs encryption
      if (integration.access_token && !integration.access_token.includes(":")) {
        console.log(`🔐 Encrypting access token for integration ${integration.id}`)
        updates.access_token = encrypt(integration.access_token, encryptionKey)
        needsUpdate = true
      }
      
      // Check if refresh token needs encryption
      if (integration.refresh_token && !integration.refresh_token.includes(":")) {
        console.log(`🔐 Encrypting refresh token for integration ${integration.id}`)
        updates.refresh_token = encrypt(integration.refresh_token, encryptionKey)
        needsUpdate = true
      }
      
      if (needsUpdate) {
        updates.updated_at = new Date().toISOString()
        
        const { error: updateError } = await supabase
          .from("integrations")
          .update(updates)
          .eq("id", integration.id)
        
        if (updateError) {
          console.error(`❌ Failed to update integration ${integration.id}:`, updateError)
        } else {
          console.log(`✅ Successfully encrypted tokens for integration ${integration.id}`)
          fixedCount++
        }
      } else {
        console.log(`✅ Integration ${integration.id} already has encrypted tokens`)
      }
    }
    
    console.log(`🎉 Fixed ${fixedCount} Discord integrations`)
    
  } catch (error) {
    console.error("❌ Error in fixDiscordTokens:", error)
  }
}

fixDiscordTokens().catch(console.error) 