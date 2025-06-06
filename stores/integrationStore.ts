import { create } from "zustand"
import { supabase } from "@/lib/supabase"

interface Integration {
  id: string
  provider: string
  status: "connected" | "disconnected" | "error"
  user_id: string
  access_token?: string
  refresh_token?: string
  expires_at?: string
  created_at: string
  updated_at: string
  metadata?: any
}

interface Provider {
  id: string
  name: string
  description: string
  category: string
  logoUrl: string
  capabilities: string[]
  scopes: string[]
  authUrl?: string
  isAvailable: boolean
}

interface IntegrationState {
  integrations: Integration[]
  providers: Provider[]
  loading: boolean
  error: string | null
  cache: Map<string, any>
  lastFetch: Date | null
  fetchIntegrations: (forceRefresh?: boolean) => Promise<void>
  clearCache: () => void
  connectIntegration: (providerId: string) => Promise<void>
  disconnectIntegration: (integrationId: string) => Promise<void>
}

// Define all available providers
const availableProviders: Provider[] = [
  {
    id: "google",
    name: "Google",
    description: "Connect your Google account to access Gmail, Drive, Calendar, and more",
    category: "Productivity",
    logoUrl: "/integrations/google.svg",
    capabilities: ["Email", "Calendar", "Drive", "Sheets"],
    scopes: ["email", "profile", "calendar", "drive"],
    isAvailable: true,
  },
  {
    id: "slack",
    name: "Slack",
    description: "Send messages, create channels, and manage your Slack workspace",
    category: "Communication",
    logoUrl: "/integrations/slack.svg",
    capabilities: ["Messaging", "Channels", "Files", "Users"],
    scopes: ["chat:write", "channels:read", "users:read"],
    isAvailable: true,
  },
  {
    id: "github",
    name: "GitHub",
    description: "Manage repositories, issues, pull requests, and deployments",
    category: "Development",
    logoUrl: "/integrations/github.svg",
    capabilities: ["Repositories", "Issues", "Pull Requests", "Actions"],
    scopes: ["repo", "user", "workflow"],
    isAvailable: true,
  },
  {
    id: "discord",
    name: "Discord",
    description: "Send messages, manage servers, and interact with Discord communities",
    category: "Communication",
    logoUrl: "/integrations/discord.svg",
    capabilities: ["Messaging", "Servers", "Channels", "Webhooks"],
    scopes: ["bot", "identify", "guilds"],
    isAvailable: true,
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    description: "Send messages, schedule meetings, and collaborate with your team",
    category: "Productivity",
    logoUrl: "/integrations/teams.svg",
    capabilities: ["Messaging", "Meetings", "Files", "Channels"],
    scopes: ["Chat.ReadWrite", "Team.ReadBasic.All"],
    isAvailable: true,
  },
  {
    id: "trello",
    name: "Trello",
    description: "Create cards, manage boards, and organize your projects",
    category: "Project Management",
    logoUrl: "/integrations/trello.svg",
    capabilities: ["Boards", "Cards", "Lists", "Members"],
    scopes: ["read", "write"],
    isAvailable: true,
  },
  {
    id: "notion",
    name: "Notion",
    description: "Create pages, manage databases, and organize your workspace",
    category: "Productivity",
    logoUrl: "/integrations/notion.svg",
    capabilities: ["Pages", "Databases", "Blocks", "Users"],
    scopes: ["read_content", "insert_content"],
    isAvailable: true,
  },
  {
    id: "airtable",
    name: "Airtable",
    description: "Manage records, create tables, and organize your data",
    category: "Database",
    logoUrl: "/integrations/airtable.svg",
    capabilities: ["Records", "Tables", "Views", "Attachments"],
    scopes: ["data.records:read", "data.records:write"],
    isAvailable: true,
  },
  {
    id: "dropbox",
    name: "Dropbox",
    description: "Upload files, manage folders, and share content",
    category: "Storage",
    logoUrl: "/integrations/dropbox.svg",
    capabilities: ["Files", "Folders", "Sharing", "Metadata"],
    scopes: ["files.content.write", "files.content.read"],
    isAvailable: true,
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description: "Manage contacts, deals, companies, and marketing campaigns",
    category: "CRM",
    logoUrl: "/integrations/hubspot.svg",
    capabilities: ["Contacts", "Deals", "Companies", "Marketing"],
    scopes: ["crm.objects.contacts.read", "crm.objects.deals.read"],
    isAvailable: true,
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    description: "Share posts, manage connections, and access professional data",
    category: "Social",
    logoUrl: "/integrations/linkedin.svg",
    capabilities: ["Posts", "Connections", "Profile", "Companies"],
    scopes: ["r_liteprofile", "w_member_social"],
    isAvailable: true,
  },
  {
    id: "facebook",
    name: "Facebook",
    description: "Post content, manage pages, and access social insights",
    category: "Social",
    logoUrl: "/integrations/facebook.svg",
    capabilities: ["Posts", "Pages", "Insights", "Events"],
    scopes: ["pages_manage_posts", "pages_read_engagement"],
    isAvailable: true,
  },
  {
    id: "instagram",
    name: "Instagram",
    description: "Post photos, manage content, and access media insights",
    category: "Social",
    logoUrl: "/integrations/instagram.svg",
    capabilities: ["Posts", "Stories", "Media", "Insights"],
    scopes: ["instagram_basic", "instagram_content_publish"],
    isAvailable: true,
  },
  {
    id: "twitter",
    name: "Twitter",
    description: "Post tweets, manage followers, and access social data",
    category: "Social",
    logoUrl: "/integrations/twitter.svg",
    capabilities: ["Tweets", "Followers", "Direct Messages", "Analytics"],
    scopes: ["tweet.read", "tweet.write", "users.read"],
    isAvailable: true,
  },
  {
    id: "youtube",
    name: "YouTube",
    description: "Upload videos, manage channels, and access analytics",
    category: "Media",
    logoUrl: "/integrations/youtube.svg",
    capabilities: ["Videos", "Channels", "Playlists", "Analytics"],
    scopes: ["youtube.upload", "youtube.readonly"],
    isAvailable: true,
  },
  {
    id: "tiktok",
    name: "TikTok",
    description: "Post videos, manage content, and access creator tools",
    category: "Social",
    logoUrl: "/integrations/tiktok.svg",
    capabilities: ["Videos", "Analytics", "User Info"],
    scopes: ["user.info.basic", "video.upload"],
    isAvailable: true,
  },
  {
    id: "mailchimp",
    name: "Mailchimp",
    description: "Manage email campaigns, lists, and marketing automation",
    category: "Marketing",
    logoUrl: "/integrations/mailchimp.svg",
    capabilities: ["Campaigns", "Lists", "Automation", "Reports"],
    scopes: ["read", "write"],
    isAvailable: true,
  },
  {
    id: "shopify",
    name: "Shopify",
    description: "Manage products, orders, customers, and store data",
    category: "E-commerce",
    logoUrl: "/integrations/shopify.svg",
    capabilities: ["Products", "Orders", "Customers", "Inventory"],
    scopes: ["read_products", "write_products", "read_orders"],
    isAvailable: true,
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Process payments, manage customers, and handle subscriptions",
    category: "Payments",
    logoUrl: "/integrations/stripe.svg",
    capabilities: ["Payments", "Customers", "Subscriptions", "Invoices"],
    scopes: ["read_write"],
    isAvailable: true,
  },
  {
    id: "paypal",
    name: "PayPal",
    description: "Process payments, manage transactions, and handle disputes",
    category: "Payments",
    logoUrl: "/integrations/paypal.svg",
    capabilities: ["Payments", "Transactions", "Disputes", "Invoices"],
    scopes: ["openid", "profile", "email"],
    isAvailable: true,
  },
  {
    id: "gitlab",
    name: "GitLab",
    description: "Manage repositories, issues, merge requests, and CI/CD pipelines",
    category: "Development",
    logoUrl: "/integrations/gitlab.svg",
    capabilities: ["Repositories", "Issues", "Merge Requests", "Pipelines"],
    scopes: ["api", "read_user", "read_repository"],
    isAvailable: true,
  },
  {
    id: "docker",
    name: "Docker Hub",
    description: "Manage container images, repositories, and deployments",
    category: "Development",
    logoUrl: "/integrations/docker.svg",
    capabilities: ["Images", "Repositories", "Tags", "Webhooks"],
    scopes: ["repo:read", "repo:write"],
    isAvailable: true,
  },
  {
    id: "onedrive",
    name: "OneDrive",
    description: "Upload files, manage folders, and share documents",
    category: "Storage",
    logoUrl: "/integrations/onedrive.svg",
    capabilities: ["Files", "Folders", "Sharing", "Sync"],
    scopes: ["Files.ReadWrite", "Files.ReadWrite.All"],
    isAvailable: true,
  },
]

export const useIntegrationStore = create<IntegrationState>((set, get) => ({
  integrations: [],
  providers: availableProviders,
  loading: false,
  error: null,
  cache: new Map(),
  lastFetch: null,

  fetchIntegrations: async (forceRefresh = false) => {
    const state = get()

    // Check cache if not forcing refresh
    if (!forceRefresh && state.lastFetch && Date.now() - state.lastFetch.getTime() < 30000) {
      return
    }

    set({ loading: true, error: null })

    try {
      if (!supabase) {
        throw new Error("Supabase client not available")
      }

      const { data, error } = await supabase.from("integrations").select("*").order("created_at", { ascending: false })

      if (error) {
        throw new Error(error.message)
      }

      set({
        integrations: Array.isArray(data) ? data : [],
        loading: false,
        error: null,
        lastFetch: new Date(),
      })
    } catch (error: any) {
      console.error("Failed to fetch integrations:", error)
      set({
        integrations: [],
        loading: false,
        error: error.message || "Failed to fetch integrations",
      })
    }
  },

  clearCache: () => {
    set({ cache: new Map(), lastFetch: null })
  },

  connectIntegration: async (providerId: string) => {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin

      // Generate OAuth URL
      const response = await fetch(`/api/integrations/auth/generate-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: providerId,
          baseUrl,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || "Failed to generate auth URL")
      }

      const { authUrl } = await response.json()

      // Redirect to OAuth provider
      window.location.href = authUrl
    } catch (error: any) {
      console.error("Failed to connect integration:", error)
      throw error
    }
  },

  disconnectIntegration: async (integrationId: string) => {
    try {
      if (!supabase) {
        throw new Error("Supabase client not available")
      }

      const { error } = await supabase.from("integrations").update({ status: "disconnected" }).eq("id", integrationId)

      if (error) {
        throw new Error(error.message)
      }

      // Refresh integrations
      await get().fetchIntegrations(true)
    } catch (error: any) {
      console.error("Failed to disconnect integration:", error)
      throw error
    }
  },
}))
