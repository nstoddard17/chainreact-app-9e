import { createClient } from "@supabase/supabase-js"

// Environment variables
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing required Supabase environment variables")
  process.exit(1)
}

// Create Supabase admin client
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function checkIntegrations(userId: string) {
  console.log(`\n🔍 Checking integrations for user ${userId}...\n`)

  // Get all integrations for the user
  const { data: integrations, error } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "connected")

  if (error) {
    console.error("Error fetching integrations:", error)
    return
  }

  if (!integrations || integrations.length === 0) {
    console.log("No connected integrations found for this user.")
    return
  }

  console.log(`Found ${integrations.length} connected integrations.\n`)

  // Check each integration
  for (const integration of integrations) {
    console.log(`\n==== ${integration.provider.toUpperCase()} INTEGRATION ====`)

    // Check token storage
    const accessToken = integration.access_token || integration.metadata?.access_token
    const refreshToken = integration.refresh_token || integration.metadata?.refresh_token

    console.log(`Provider: ${integration.provider}`)
    console.log(`ID: ${integration.id}`)
    console.log(`Status: ${integration.status}`)
    console.log(`Access Token: ${accessToken ? "✅ Present" : "❌ Missing"}`)
    console.log(`Refresh Token: ${refreshToken ? "✅ Present" : "⚠️ Not present (may be normal for some providers)"}`)

    // Check scopes
    const storedScopes = integration.scopes || integration.metadata?.scopes || []
    console.log(`\nScopes:`)
    if (storedScopes.length === 0) {
      console.log(`  ⚠️ No scopes stored`)
    } else {
      console.log(`  ✅ ${storedScopes.length} scopes stored: ${storedScopes.join(", ")}`)
    }

    // Check token expiration
    const expiresAt = integration.expires_at || integration.metadata?.expires_at
    if (expiresAt) {
      const expiryDate = new Date(expiresAt * 1000)
      const now = new Date()
      if (expiryDate < now) {
        console.log(`\n❌ Token EXPIRED on ${expiryDate.toLocaleString()}`)
      } else {
        console.log(`\n✅ Token valid until ${expiryDate.toLocaleString()}`)
      }
    } else {
      console.log(`\n⚠️ No expiration time found for token`)
    }

    // Check metadata
    console.log(`\nMetadata:`)
    if (integration.metadata) {
      console.log(JSON.stringify(integration.metadata, null, 2))
    } else {
      console.log(`  ⚠️ No metadata stored`)
    }

    console.log("\n")
  }
}

// Get user ID from command line argument
const userId = process.argv[2]

if (!userId) {
  console.error("Please provide a user ID as a command line argument")
  console.log("Usage: ts-node check-integrations.ts USER_ID")
  process.exit(1)
}

checkIntegrations(userId)
  .then(() => console.log("Integration check complete"))
  .catch((err) => console.error("Error:", err))
