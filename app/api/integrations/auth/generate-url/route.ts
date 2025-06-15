import { type NextRequest, NextResponse } from "next/server"
import { generateState } from "arctic"

// Define types for the providers
type OAuthProvider =
  | "github"
  | "discord"
  | "twitter"
  | "linkedin"
  | "facebook"
  | "instagram"
  | "tiktok"
  | "notion"
  | "trello"
  | "dropbox"
  | "hubspot"
  | "airtable"
  | "mailchimp"
  | "shopify"
  | "stripe"
  | "paypal"
  | "teams"
  | "onedrive"
  | "gitlab"
  | "docker"
  | "gmail"
  | "google-calendar"
  | "google-drive"
  | "google-sheets"
  | "google-docs"
  | "youtube"
  | "slack"

// Utility function to generate OAuth URLs
function generateOAuthURL(provider: OAuthProvider, state: string): string | null {
  const baseURL = "https://chainreact.app/api/integrations/auth" // Base URL for OAuth routes

  switch (provider) {
    case "github":
      return `${baseURL}/github?state=${state}&redirect_uri=https://chainreact.app/api/integrations/github/callback`
    case "discord":
      return `${baseURL}/discord?state=${state}&redirect_uri=https://chainreact.app/api/integrations/discord/callback`
    case "twitter":
      return `${baseURL}/twitter?state=${state}&redirect_uri=https://chainreact.app/api/integrations/twitter/callback`
    case "linkedin":
      return `${baseURL}/linkedin?state=${state}&redirect_uri=https://chainreact.app/api/integrations/linkedin/callback`
    case "facebook":
      return `${baseURL}/facebook?state=${state}&redirect_uri=https://chainreact.app/api/integrations/facebook/callback`
    case "instagram":
      return `${baseURL}/instagram?state=${state}&redirect_uri=https://chainreact.app/api/integrations/instagram/callback`
    case "tiktok":
      return `${baseURL}/tiktok?state=${state}&redirect_uri=https://chainreact.app/api/integrations/tiktok/callback`
    case "notion":
      return `${baseURL}/notion?state=${state}&redirect_uri=https://chainreact.app/api/integrations/notion/callback`
    case "trello":
      return `${baseURL}/trello?state=${state}&redirect_uri=https://chainreact.app/api/integrations/trello/callback`
    case "dropbox":
      return `${baseURL}/dropbox?state=${state}&redirect_uri=https://chainreact.app/api/integrations/dropbox/callback`
    case "hubspot":
      return `${baseURL}/hubspot?state=${state}&redirect_uri=https://chainreact.app/api/integrations/hubspot/callback`
    case "airtable":
      return `${baseURL}/airtable?state=${state}&redirect_uri=https://chainreact.app/api/integrations/airtable/callback`
    case "mailchimp":
      return `${baseURL}/mailchimp?state=${state}&redirect_uri=https://chainreact.app/api/integrations/mailchimp/callback`
    case "shopify":
      return `${baseURL}/shopify?state=${state}&redirect_uri=https://chainreact.app/api/integrations/shopify/callback`
    case "stripe":
      return `${baseURL}/stripe?state=${state}&redirect_uri=https://chainreact.app/api/integrations/stripe/callback`
    case "paypal":
      return `${baseURL}/paypal?state=${state}&redirect_uri=https://chainreact.app/api/integrations/paypal/callback`
    case "teams":
      return `${baseURL}/teams?state=${state}&redirect_uri=https://chainreact.app/api/integrations/teams/callback`
    case "onedrive":
      return `${baseURL}/onedrive?state=${state}&redirect_uri=https://chainreact.app/api/integrations/onedrive/callback`
    case "gitlab":
      return `${baseURL}/gitlab?state=${state}&redirect_uri=https://chainreact.app/api/integrations/gitlab/callback`
    case "docker":
      return `${baseURL}/docker?state=${state}&redirect_uri=https://chainreact.app/api/integrations/docker/callback`
    case "gmail":
      return `${baseURL}/gmail?state=${state}&redirect_uri=https://chainreact.app/api/integrations/gmail/callback`
    case "google-calendar":
      return `${baseURL}/google-calendar?state=${state}&redirect_uri=https://chainreact.app/api/integrations/google-calendar/callback`
    case "google-drive":
      return `${baseURL}/google-drive?state=${state}&redirect_uri=https://chainreact.app/api/integrations/google-drive/callback`
    case "google-sheets":
      return `${baseURL}/google-sheets?state=${state}&redirect_uri=https://chainreact.app/api/integrations/google-sheets/callback`
    case "google-docs":
      return `${baseURL}/google-docs?state=${state}&redirect_uri=https://chainreact.app/api/integrations/google-docs/callback`
    case "youtube":
      return `${baseURL}/youtube?state=${state}&redirect_uri=https://chainreact.app/api/integrations/youtube/callback`
    case "slack":
      return `${baseURL}/slack?state=${state}&redirect_uri=https://chainreact.app/api/integrations/slack/callback`
    default:
      return null
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const provider = searchParams.get("provider") as OAuthProvider

  if (!provider) {
    return NextResponse.json({ error: "Provider is required" }, { status: 400 })
  }

  const state = generateState()
  const oAuthURL = generateOAuthURL(provider, state)

  if (!oAuthURL) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 })
  }

  return NextResponse.json({ url: oAuthURL, state: state })
}
