"use server"

import { generateOAuthUrl } from "@/lib/oauth"
import { headers } from "next/headers"

export async function generateOAuthUrlAction(provider: string, reconnect = false, integrationId?: string) {
  try {
    // Get base URL from headers
    const headersList = headers()
    const host = headersList.get("host")
    const protocol = headersList.get("x-forwarded-proto") || "https"
    const baseUrl = `${protocol}://${host}`

    const authUrl = generateOAuthUrl(provider as any, baseUrl, reconnect, integrationId)

    return {
      success: true,
      authUrl,
    }
  } catch (error: any) {
    console.error("Error generating OAuth URL:", error)
    return {
      success: false,
      error: error.message,
    }
  }
}
