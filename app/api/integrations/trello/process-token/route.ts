import { type NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from "@supabase/supabase-js"
import { validateAndUpdateIntegrationScopes } from "@/lib/integrations/scopeValidation"

import { logger } from '@/lib/utils/logger'

const getSupabaseClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SECRET_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Server environment is not configured for Trello processing.")
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
    },
  })
}

export const POST = async (request: NextRequest) => {
  try {
    const supabase = getSupabaseClient()
    logger.debug("Processing Trello token")
    const { token, userId } = await request.json()

    if (!token || !userId) {
      return errorResponse("Missing token or userId" , 400)
    }

    // Get user info from Trello
    const trelloResponse = await fetch(
      `https://api.trello.com/1/members/me?key=${process.env.TRELLO_CLIENT_ID}&token=${token}`,
    )

    if (!trelloResponse.ok) {
      const errorText = await trelloResponse.text()
      logger.error("Failed to fetch Trello user info:", errorText)
      return errorResponse("Failed to validate Trello token" , 400)
    }

    const trelloUserData = await trelloResponse.json()
  const trelloUserId = trelloUserData.id
  const trelloUsername = trelloUserData.username

    if (!trelloUserId || !trelloUsername) {
      logger.error("Invalid Trello user data received")
      return errorResponse("Invalid Trello user data" , 400)
    }

    const now = new Date().toISOString()

    // Check if integration exists
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id, metadata")
      .eq("user_id", userId)
      .eq("provider", "trello")
      .maybeSingle()

    const grantedScopes = ["read", "write", "account"]

    // Match Discord structure that works correctly
  const integrationData = {
    user_id: userId,
    provider: "trello",
    provider_user_id: trelloUserId,
    access_token: token,
    refresh_token: null, // Trello doesn't provide refresh tokens
    expires_at: null, // Trello tokens don't expire unless revoked
    status: "connected" as const,
    scopes: grantedScopes,
    metadata: {
      username: trelloUsername,
      full_name: trelloUserData.fullName || null,
      initials: trelloUserData.initials || null,
      avatar_url: trelloUserData.avatarUrl || null,
      url: trelloUserData.url || null,
      connected_at: now,
      client_key: process.env.TRELLO_CLIENT_ID || null,
      raw_user_data: trelloUserData,
    },
  }

    let integrationId: string | undefined
    if (existingIntegration) {
      logger.debug("Updating existing Trello integration")
      const { error: updateError } = await supabase
        .from("integrations")
        .update({
          access_token: token,
          provider_user_id: trelloUserId,
          status: "connected",
          updated_at: now,
          metadata: {
            ...(existingIntegration.metadata || {}),
            username: trelloUsername,
            full_name: trelloUserData.fullName || null,
            initials: trelloUserData.initials || null,
            avatar_url: trelloUserData.avatarUrl || null,
            url: trelloUserData.url || null,
            connected_at: now,
            client_key: process.env.TRELLO_CLIENT_ID || null,
            raw_user_data: trelloUserData,
          },
        })
        .eq("id", existingIntegration.id)
        .eq("user_id", userId)

      if (updateError) {
        logger.error("Error updating Trello integration:", updateError)
        return errorResponse("Failed to update integration" , 500)
      }
      integrationId = existingIntegration.id
    } else {
      logger.debug("Creating new Trello integration")
      const { data, error } = await supabase
        .from("integrations")
        .insert({
          ...integrationData,
          created_at: now,
          updated_at: now,
        })
        .select("id")
        .single()

      if (error) {
        logger.error("Error inserting Trello integration:", error)
        return errorResponse("Failed to create integration" , 500)
      }
      integrationId = data.id
    }

    if (integrationId) {
      try {
        await validateAndUpdateIntegrationScopes(integrationId, grantedScopes)
        logger.debug("Trello integration scope validation completed")
      } catch (err) {
        logger.error("Trello scope validation failed:", err)
        // Don't fail the whole process for scope validation errors
      }
    }

    logger.debug("Trello integration processed successfully")
    return jsonResponse({ success: true, integrationId })
  } catch (e: any) {
    logger.error("Error processing Trello token:", e)
    return errorResponse(e.message || "Internal server error" , 500)
  }
}
