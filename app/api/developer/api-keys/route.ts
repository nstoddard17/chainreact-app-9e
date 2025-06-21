import { type NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { z } from "zod"
import crypto from "crypto"

const createApiKeySchema = z.object({
  name: z.string().min(1).max(255),
  scopes: z.array(z.string()),
  expires_at: z.string().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteHandlerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: apiKeys, error } = await supabase
      .from("api_keys")
      .select("id, name, key_prefix, scopes, last_used_at, expires_at, is_active, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      return NextResponse.json({ error: "Failed to fetch API keys" }, { status: 500 })
    }

    return NextResponse.json({ data: apiKeys })
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteHandlerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = createApiKeySchema.parse(body)

    // Generate API key
    const keyBytes = crypto.randomBytes(32)
    const apiKey = `cr_${keyBytes.toString("hex")}`
    const keyPrefix = apiKey.substring(0, 10)
    const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex")

    const { data: newApiKey, error } = await supabase
      .from("api_keys")
      .insert({
        user_id: user.id,
        name: validatedData.name,
        key_prefix: keyPrefix,
        key_hash: keyHash,
        scopes: validatedData.scopes,
        expires_at: validatedData.expires_at,
      })
      .select("id, name, key_prefix, scopes, expires_at, is_active, created_at")
      .single()

    if (error) {
      return NextResponse.json({ error: "Failed to create API key" }, { status: 500 })
    }

    return NextResponse.json(
      {
        data: newApiKey,
        api_key: apiKey, // Only returned once during creation
      },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request data", details: error.errors }, { status: 400 })
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
