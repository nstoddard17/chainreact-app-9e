"use server"

import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { headers } from "next/headers"

export async function generateOAuthUrlAction(provider: string, reconnect = false, integrationId?: string) {
  try {
    // Verify user session first
    const supabase = createRouteHandlerClient({ cookies })
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session) {
      return {
        success: false,
        error: "Authentication required. Please log in first.",
      }
    }

    // Get base URL from headers
    const headersList = headers()
    const host = headersList.get("host")
    const protocol = headersList.get("x-forwarded-proto") || "https"
    const baseUrl = `${protocol}://${host}`

    // Call the auth API route
    const response = await fetch(`${baseUrl}/api/integrations/auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider,
        reconnect,
        integrationId,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Failed to generate OAuth URL",
        details: data.details,
      }
    }

    return {
      success: true,
      authUrl: data.authUrl,
    }
  } catch (error: any) {
    console.error("Error generating OAuth URL:", error)
    return {
      success: false,
      error: error.message || "Failed to generate OAuth URL",
    }
  }
}
