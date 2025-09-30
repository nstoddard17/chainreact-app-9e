import { NextRequest, NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import crypto from "crypto"

// Encryption key from environment (should be 32 bytes for AES-256)
const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_SECRET || "default-key-please-change-in-production-32b"
const ALGORITHM = "aes-256-cbc"

/**
 * Encrypt an API key
 */
function encryptKey(key: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY.slice(0, 32)),
    iv
  )
  let encrypted = cipher.update(key, "utf8", "hex")
  encrypted += cipher.final("hex")
  return `${iv.toString("hex")}:${encrypted}`
}

/**
 * Decrypt an API key
 */
function decryptKey(encryptedKey: string): string {
  const [ivHex, encrypted] = encryptedKey.split(":")
  const iv = Buffer.from(ivHex, "hex")
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY.slice(0, 32)),
    iv
  )
  let decrypted = decipher.update(encrypted, "hex", "utf8")
  decrypted += decipher.final("utf8")
  return decrypted
}

/**
 * GET - Fetch user's AI API keys
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

    // Get the authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Fetch user's profile with API keys
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("openai_api_keys, default_openai_model")
      .eq("id", user.id)
      .single()

    if (profileError) {
      console.error("Error fetching profile:", profileError)
      return NextResponse.json(
        { error: "Failed to fetch API keys" },
        { status: 500 }
      )
    }

    // Return keys without decrypted values (only previews)
    const keys = (profile?.openai_api_keys || []).map((key: any) => ({
      id: key.id,
      name: key.name,
      key_preview: key.key_preview,
      created_at: key.created_at,
    }))

    return NextResponse.json({
      keys,
      defaultModel: profile?.default_openai_model || "gpt-4o-mini",
    })
  } catch (error) {
    console.error("Error in GET /api/user/ai-api-keys:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * POST - Add a new API key
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

    // Get the authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { name, key } = body

    if (!name || !key) {
      return NextResponse.json(
        { error: "Name and key are required" },
        { status: 400 }
      )
    }

    // Validate OpenAI key format
    if (!key.startsWith("sk-")) {
      return NextResponse.json(
        { error: "Invalid OpenAI API key format" },
        { status: 400 }
      )
    }

    // Encrypt the key
    const encryptedKey = encryptKey(key)
    const keyPreview = key.slice(-4)

    // Fetch current keys
    const { data: profile, error: fetchError } = await supabase
      .from("user_profiles")
      .select("openai_api_keys")
      .eq("id", user.id)
      .single()

    if (fetchError) {
      console.error("Error fetching profile:", fetchError)
      return NextResponse.json(
        { error: "Failed to fetch profile" },
        { status: 500 }
      )
    }

    // Add new key
    const existingKeys = profile?.openai_api_keys || []
    const newKey = {
      id: crypto.randomUUID(),
      name,
      key_encrypted: encryptedKey,
      key_preview: keyPreview,
      created_at: new Date().toISOString(),
    }

    const updatedKeys = [...existingKeys, newKey]

    // Update profile with new key
    const { error: updateError } = await supabase
      .from("user_profiles")
      .update({ openai_api_keys: updatedKeys })
      .eq("id", user.id)

    if (updateError) {
      console.error("Error updating profile:", updateError)
      return NextResponse.json(
        { error: "Failed to save API key" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      keyId: newKey.id,
    })
  } catch (error) {
    console.error("Error in POST /api/user/ai-api-keys:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * PATCH - Update default model
 */
export async function PATCH(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

    // Get the authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { defaultModel } = body

    if (!defaultModel) {
      return NextResponse.json(
        { error: "defaultModel is required" },
        { status: 400 }
      )
    }

    // Update default model
    const { error: updateError } = await supabase
      .from("user_profiles")
      .update({ default_openai_model: defaultModel })
      .eq("id", user.id)

    if (updateError) {
      console.error("Error updating default model:", updateError)
      return NextResponse.json(
        { error: "Failed to update default model" },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in PATCH /api/user/ai-api-keys:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * DELETE - Remove an API key
 */
export async function DELETE(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

    // Get the authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const keyId = searchParams.get("keyId")

    if (!keyId) {
      return NextResponse.json(
        { error: "keyId is required" },
        { status: 400 }
      )
    }

    // Fetch current keys
    const { data: profile, error: fetchError } = await supabase
      .from("user_profiles")
      .select("openai_api_keys")
      .eq("id", user.id)
      .single()

    if (fetchError) {
      console.error("Error fetching profile:", fetchError)
      return NextResponse.json(
        { error: "Failed to fetch profile" },
        { status: 500 }
      )
    }

    // Remove the key
    const existingKeys = profile?.openai_api_keys || []
    const updatedKeys = existingKeys.filter((key: any) => key.id !== keyId)

    // Update profile
    const { error: updateError } = await supabase
      .from("user_profiles")
      .update({ openai_api_keys: updatedKeys })
      .eq("id", user.id)

    if (updateError) {
      console.error("Error updating profile:", updateError)
      return NextResponse.json(
        { error: "Failed to delete API key" },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in DELETE /api/user/ai-api-keys:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * Helper function to get decrypted API key for a user (for server-side use only)
 */
export async function getUserAPIKey(userId: string, keyId?: string): Promise<string | null> {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

    const { data: profile, error } = await supabase
      .from("user_profiles")
      .select("openai_api_keys")
      .eq("id", userId)
      .single()

    if (error || !profile) {
      return null
    }

    const keys = profile.openai_api_keys || []

    // If keyId specified, get that specific key, otherwise get first key
    const key = keyId
      ? keys.find((k: any) => k.id === keyId)
      : keys[0]

    if (!key || !key.key_encrypted) {
      return null
    }

    return decryptKey(key.key_encrypted)
  } catch (error) {
    console.error("Error getting user API key:", error)
    return null
  }
}