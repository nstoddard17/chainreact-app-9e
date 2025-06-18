"use server"

import { createServerActionClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

export async function initiateOAuth(provider: string, reconnect = false, integrationId?: string) {
  try {
    // Verify user session first
    const supabase = createServerActionClient({ cookies })
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

    // Call the auth API route
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://chainreact.app"

    const response = await fetch(`${baseUrl}/api/integrations/auth/generate-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookies().toString(),
      },
      body: JSON.stringify({
        provider,
        reconnect,
        integrationId,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error(`OAuth configuration error for ${provider}:`, data)

      // Handle specific error types
      if (data.error?.includes("Missing") && data.error?.includes("environment variable")) {
        return {
          success: false,
          error: `OAuth not configured for ${getProviderDisplayName(provider)}. Please check your environment variables.`,
          details: data.details,
        }
      }

      return {
        success: false,
        error: data.error || `Failed to configure OAuth for ${getProviderDisplayName(provider)}`,
        details: data.details,
      }
    }

    if (!data.authUrl) {
      return {
        success: false,
        error: `Failed to generate OAuth URL for ${getProviderDisplayName(provider)}`,
      }
    }

    return {
      success: true,
      authUrl: data.authUrl,
    }
  } catch (error: any) {
    console.error(`OAuth initiation error for ${provider}:`, error)
    return {
      success: false,
      error: `Failed to initiate OAuth for ${getProviderDisplayName(provider)}: ${error.message}`,
    }
  }
}

function getProviderDisplayName(provider: string): string {
  const displayNames: Record<string, string> = {
    google: "Google",
    teams: "Microsoft Teams",
    slack: "Slack",
    dropbox: "Dropbox",
    github: "GitHub",
    twitter: "X",
    x: "X",
    linkedin: "LinkedIn",
    facebook: "Facebook",
    instagram: "Instagram",
    tiktok: "TikTok",
    paypal: "PayPal",
    shopify: "Shopify",
    trello: "Trello",
    notion: "Notion",
    youtube: "YouTube",
    docker: "Docker",
    gitlab: "GitLab",
    airtable: "Airtable",
    mailchimp: "Mailchimp",
    hubspot: "HubSpot",
    discord: "Discord",
  }

  return displayNames[provider] || provider.charAt(0).toUpperCase() + provider.slice(1)
}
