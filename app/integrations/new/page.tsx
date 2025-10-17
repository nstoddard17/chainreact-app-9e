import { requireUsername } from "@/utils/checkUsername"
import IntegrationsContent from "@/components/integrations/IntegrationsContent"

// Force dynamic rendering
export const dynamic = 'force-dynamic'

export default async function IntegrationsNewPage() {
  await requireUsername()

  // Get configured clients (check if OAuth clients are set up)
  const configuredClients: Record<string, boolean> = {
    google: !!process.env.GOOGLE_CLIENT_ID,
    microsoft: !!process.env.MICROSOFT_CLIENT_ID,
    slack: !!process.env.SLACK_CLIENT_ID,
    discord: !!process.env.DISCORD_CLIENT_ID,
    notion: !!process.env.NOTION_CLIENT_ID,
    github: !!process.env.GITHUB_CLIENT_ID,
    dropbox: !!process.env.DROPBOX_CLIENT_ID,
    hubspot: !!process.env.HUBSPOT_CLIENT_ID,
    facebook: !!process.env.FACEBOOK_CLIENT_ID,
    x: !!process.env.X_CLIENT_ID,
    trello: !!process.env.TRELLO_API_KEY,
    airtable: !!process.env.AIRTABLE_CLIENT_ID,
    mailchimp: !!process.env.MAILCHIMP_CLIENT_ID,
    stripe: !!process.env.STRIPE_CLIENT_ID,
  }

  return <IntegrationsContent configuredClients={configuredClients} />
}
