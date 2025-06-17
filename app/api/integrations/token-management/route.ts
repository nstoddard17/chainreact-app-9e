import { type NextRequest, NextResponse } from "next/server"
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { encrypt, decrypt } from "@/lib/security/encryption"
import { createAdminClient } from "@/lib/supabase/admin"

const getSupabase = () => createServerComponentClient({ cookies })
const getAdminSupabase = () => createAdminClient()

const ENCRYPTION_SECRET = process.env.ENCRYPTION_KEY

if (!ENCRYPTION_SECRET) {
  throw new Error("ENCRYPTION_KEY is not set in environment variables.")
}

// POST - Save an API Key
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { provider, apiKey } = await request.json()

    if (!provider || !apiKey) {
      return NextResponse.json({ error: "Provider and API key are required" }, { status: 400 })
    }

    if (!ENCRYPTION_SECRET) {
      throw new Error("ENCRYPTION_KEY is not set.")
    }

    const encryptedKey = encrypt(apiKey, ENCRYPTION_SECRET)

    const adminSupabase = getAdminSupabase()
    const { error } = await adminSupabase.from("integrations").upsert(
      {
        user_id: user.id,
        provider,
        access_token: encryptedKey,
        status: "connected",
        token_type: "api_key",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id, provider" },
    )

    if (error) {
      console.error("Failed to save API key:", error)
      return NextResponse.json({ error: "Failed to save API key" }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: `${provider} API key saved.` })
  } catch (error: any) {
    console.error("API Key Management Error (POST):", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

// DELETE - Remove an API Key
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { provider } = await request.json()

    if (!provider) {
      return NextResponse.json({ error: "Provider is required" }, { status: 400 })
    }

    const adminSupabase = getAdminSupabase()
    const { error } = await adminSupabase
      .from("integrations")
      .delete()
      .match({ user_id: user.id, provider: provider })

    if (error) {
      console.error("Failed to delete API key:", error)
      return NextResponse.json({ error: "Failed to delete API key" }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: `${provider} API key removed.` })
  } catch (error: any) {
    console.error("API Key Management Error (DELETE):", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
} 