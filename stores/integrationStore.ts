import { create } from "zustand"

export type Provider = {
  id: string
  name: string
  description: string
  logo: string
  isAvailable: boolean
}

const defaultProviders: Omit<Provider, "isAvailable">[] = [
  {
    id: "slack",
    name: "Slack",
    description: "Connect your Slack workspace to receive notifications and updates.",
    logo: "/logos/slack.svg",
  },
  {
    id: "discord",
    name: "Discord",
    description: "Connect your Discord server to receive notifications and updates.",
    logo: "/logos/discord.svg",
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    description: "Connect your Microsoft Teams workspace to receive notifications and updates.",
    logo: "/logos/teams.svg",
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "Connect your Gmail account to send and receive emails.",
    logo: "/logos/gmail.svg",
  },
  {
    id: "google-drive",
    name: "Google Drive",
    description: "Connect your Google Drive account to access and manage files.",
    logo: "/logos/google-drive.svg",
  },
  {
    id: "google-sheets",
    name: "Google Sheets",
    description: "Connect your Google Sheets account to access and manage spreadsheets.",
    logo: "/logos/google-sheets.svg",
  },
  {
    id: "google-docs",
    name: "Google Docs",
    description: "Connect your Google Docs account to access and manage documents.",
    logo: "/logos/google-docs.svg",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Connect your Google Calendar account to access and manage events.",
    logo: "/logos/google-calendar.svg",
  },
  {
    id: "youtube",
    name: "YouTube",
    description: "Connect your YouTube channel to receive notifications and updates.",
    logo: "/logos/youtube.svg",
  },
  {
    id: "github",
    name: "GitHub",
    description: "Connect your GitHub account to access and manage repositories.",
    logo: "/logos/github.svg",
  },
  {
    id: "gitlab",
    name: "GitLab",
    description: "Connect your GitLab account to access and manage repositories.",
    logo: "/logos/gitlab.svg",
  },
  {
    id: "docker",
    name: "Docker",
    description: "Connect your Docker account to access and manage containers.",
    logo: "/logos/docker.svg",
  },
  {
    id: "twitter",
    name: "Twitter",
    description: "Connect your Twitter account to post and receive tweets.",
    logo: "/logos/twitter.svg",
  },
  {
    id: "facebook",
    name: "Facebook",
    description: "Connect your Facebook account to post and receive updates.",
    logo: "/logos/facebook.svg",
  },
  {
    id: "instagram",
    name: "Instagram",
    description: "Connect your Instagram account to post and receive updates.",
    logo: "/logos/instagram.svg",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    description: "Connect your LinkedIn account to post and receive updates.",
    logo: "/logos/linkedin.svg",
  },
  {
    id: "tiktok",
    name: "TikTok",
    description: "Connect your TikTok account to post and receive updates.",
    logo: "/logos/tiktok.svg",
  },
  {
    id: "notion",
    name: "Notion",
    description: "Connect your Notion workspace to access and manage pages.",
    logo: "/logos/notion.svg",
  },
  {
    id: "trello",
    name: "Trello",
    description: "Connect your Trello account to access and manage boards.",
    logo: "/logos/trello.svg",
  },
  {
    id: "airtable",
    name: "Airtable",
    description: "Connect your Airtable account to access and manage bases.",
    logo: "/logos/airtable.svg",
  },
  {
    id: "dropbox",
    name: "Dropbox",
    description: "Connect your Dropbox account to access and manage files.",
    logo: "/logos/dropbox.svg",
  },
  {
    id: "onedrive",
    name: "OneDrive",
    description: "Connect your OneDrive account to access and manage files.",
    logo: "/logos/onedrive.svg",
  },
  {
    id: "shopify",
    name: "Shopify",
    description: "Connect your Shopify store to access and manage products.",
    logo: "/logos/shopify.svg",
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Connect your Stripe account to access and manage payments.",
    logo: "/logos/stripe.svg",
  },
  {
    id: "paypal",
    name: "PayPal",
    description: "Connect your PayPal account to access and manage payments.",
    logo: "/logos/paypal.svg",
  },
  {
    id: "mailchimp",
    name: "Mailchimp",
    description: "Connect your Mailchimp account to access and manage campaigns.",
    logo: "/logos/mailchimp.svg",
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description: "Connect your HubSpot account to access and manage contacts.",
    logo: "/logos/hubspot.svg",
  },
]

type IntegrationState = {
  providers: Provider[]
  fetchIntegrations: () => Promise<void>
  checkProviderAvailability: (providerId: string) => boolean
}

export const useIntegrationStore = create<IntegrationState>((set, get) => ({
  providers: [],
  fetchIntegrations: async () => {
    // Load providers (this should always work as it's static data)
    if (get().providers.length === 0) {
      set({
        providers: defaultProviders.map((provider) => ({
          ...provider,
          isAvailable: get().checkProviderAvailability(provider.id),
        })),
      })
    }
  },
  checkProviderAvailability(providerId: string): boolean {
    const envVarMap: Record<string, string> = {
      slack: "NEXT_PUBLIC_SLACK_CLIENT_ID",
      discord: "NEXT_PUBLIC_DISCORD_CLIENT_ID",
      teams: "NEXT_PUBLIC_TEAMS_CLIENT_ID",
      gmail: "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
      "google-drive": "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
      "google-sheets": "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
      "google-docs": "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
      "google-calendar": "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
      youtube: "NEXT_PUBLIC_YOUTUBE_CLIENT_ID",
      github: "NEXT_PUBLIC_GITHUB_CLIENT_ID",
      gitlab: "NEXT_PUBLIC_GITLAB_CLIENT_ID",
      docker: "NEXT_PUBLIC_DOCKER_CLIENT_ID",
      twitter: "NEXT_PUBLIC_TWITTER_CLIENT_ID",
      facebook: "NEXT_PUBLIC_FACEBOOK_CLIENT_ID",
      instagram: "NEXT_PUBLIC_INSTAGRAM_CLIENT_ID",
      linkedin: "NEXT_PUBLIC_LINKEDIN_CLIENT_ID",
      tiktok: "NEXT_PUBLIC_TIKTOK_CLIENT_ID",
      notion: "NEXT_PUBLIC_NOTION_CLIENT_ID",
      trello: "NEXT_PUBLIC_TRELLO_CLIENT_ID",
      airtable: "NEXT_PUBLIC_AIRTABLE_CLIENT_ID",
      dropbox: "NEXT_PUBLIC_DROPBOX_CLIENT_ID",
      onedrive: "NEXT_PUBLIC_ONEDRIVE_CLIENT_ID",
      shopify: "NEXT_PUBLIC_SHOPIFY_CLIENT_ID",
      stripe: "NEXT_PUBLIC_STRIPE_CLIENT_ID",
      paypal: "NEXT_PUBLIC_PAYPAL_CLIENT_ID",
      mailchimp: "NEXT_PUBLIC_MAILCHIMP_CLIENT_ID",
      hubspot: "NEXT_PUBLIC_HUBSPOT_CLIENT_ID",
    }

    const envVar = envVarMap[providerId]
    return envVar ? !!process.env[envVar] : false
  },
}))
