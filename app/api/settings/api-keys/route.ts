import { NextRequest } from "next/server"
import { jsonResponse, errorResponse } from "@/lib/utils/api-response"
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { logger } from "@/lib/utils/logger"
import crypto from "crypto"

export const dynamic = "force-dynamic"

/**
 * Generate a secure API key
 * Format: cr_live_XXXXXXXXXX (32 random chars)
 */
function generateApiKey(): string {
  const prefix = "cr_live_"
  const randomPart = crypto.randomBytes(24).toString("base64url")
  return `${prefix}${randomPart}`
}

/**
 * Hash an API key for storage
 */
function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex")
}

/**
 * Get the prefix of an API key for display
 */
function getKeyPrefix(key: string): string {
  return key.substring(0, 12)
}

// GET - List all API keys for the current user
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    // Fetch API keys for this user
    const { data: keys, error } = await serviceClient
      .from("api_keys")
      .select("id, name, key_prefix, last_used_at, created_at, expires_at, scopes, is_active")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      logger.error("Error fetching API keys:", error)
      return errorResponse("Failed to fetch API keys", 500)
    }

    return jsonResponse({ keys: keys || [] })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error", 500)
  }
}

// POST - Create a new API key
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const body = await request.json()
    const { name, scopes = ["*"], expires_in_days } = body

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return errorResponse("Name is required", 400)
    }

    // Generate the API key
    const apiKey = generateApiKey()
    const keyHash = hashApiKey(apiKey)
    const keyPrefix = getKeyPrefix(apiKey)

    // Calculate expiration if specified
    let expiresAt = null
    if (expires_in_days && typeof expires_in_days === "number") {
      const expDate = new Date()
      expDate.setDate(expDate.getDate() + expires_in_days)
      expiresAt = expDate.toISOString()
    }

    // Insert the API key
    const { data: insertedKey, error: insertError } = await serviceClient
      .from("api_keys")
      .insert({
        user_id: user.id,
        name: name.trim(),
        key_hash: keyHash,
        key_prefix: keyPrefix,
        scopes: scopes,
        expires_at: expiresAt,
        is_active: true,
      })
      .select("id, name, key_prefix, created_at, expires_at, scopes")
      .single()

    if (insertError) {
      logger.error("Error creating API key:", insertError)
      return errorResponse("Failed to create API key", 500)
    }

    // Return the full key only once
    return jsonResponse({
      key: {
        ...insertedKey,
        key: apiKey, // Full key, only shown once
      },
    })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error", 500)
  }
}
