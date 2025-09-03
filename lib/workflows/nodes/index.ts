// Temporary index file for refactored workflow nodes
// This will eventually replace availableNodes.ts

import { NodeComponent } from "./types"
import { automationNodes } from "./providers/automation"
import { genericTriggers } from "./providers/generic/triggers"
import { logicNodes } from "./providers/logic"
import { aiNodes } from "./providers/ai"
import { kitNodes } from "./providers/kit"
import { mailchimpNodes } from "./providers/mailchimp"
import { gmailNodes } from "./providers/gmail"
import { googleCalendarNodes } from "./providers/google-calendar"
import { googleDriveNodes } from "./providers/google-drive"
import { googleSheetsNodes } from "./providers/google-sheets"
import { githubNodes } from "./providers/github"
import { airtableNodes } from "./providers/airtable"
import { notionNodes } from "./providers/notion"
import { stripeNodes } from "./providers/stripe"
import { trelloNodes } from "./providers/trello"
import { teamsNodes } from "./providers/teams"
import { slackNodes } from "./providers/slack"
import { discordNodes } from "./providers/discord"
import { twitterNodes } from "./providers/twitter"
import { outlookNodes } from "./providers/outlook"
import { hubspotNodes } from "./providers/hubspot"
import { youtubeNodes } from "./providers/youtube"
import { googleDocsNodes } from "./providers/google-docs"
import { facebookNodes } from "./providers/facebook"
import { tiktokNodes } from "./providers/tiktok"
import { onedriveNodes } from "./providers/onedrive"
import { onenoteNodes } from "./providers/onenote"
import { instagramNodes } from "./providers/instagram"
import { linkedinNodes } from "./providers/linkedin"
import { shopifyNodes } from "./providers/shopify"
import { dropboxNodes } from "./providers/dropbox"
import { boxNodes } from "./providers/box"
import { paypalNodes } from "./providers/paypal"
import { gitlabNodes } from "./providers/gitlab"
import { youtubeStudioNodes } from "./providers/youtube-studio"
import { miscNodes } from "./providers/misc"

// Migration complete! All 247 nodes have been extracted and organized by provider
// This file now replaces the original availableNodes.ts

export const ALL_NODE_COMPONENTS: NodeComponent[] = [
  ...automationNodes,
  ...genericTriggers,
  ...logicNodes,
  ...aiNodes,
  ...kitNodes,
  ...mailchimpNodes,
  ...gmailNodes,
  ...googleCalendarNodes,
  ...googleDriveNodes,
  ...googleSheetsNodes,
  ...googleDocsNodes,
  ...githubNodes,
  ...airtableNodes,
  ...notionNodes,
  ...stripeNodes,
  ...trelloNodes,
  ...teamsNodes,
  ...slackNodes,
  ...discordNodes,
  ...twitterNodes,
  ...outlookNodes,
  ...hubspotNodes,
  ...youtubeNodes,
  ...youtubeStudioNodes,
  ...facebookNodes,
  ...tiktokNodes,
  ...onedriveNodes,
  ...onenoteNodes,
  ...instagramNodes,
  ...linkedinNodes,
  ...shopifyNodes,
  ...dropboxNodes,
  ...boxNodes,
  ...paypalNodes,
  ...gitlabNodes,
  ...miscNodes,
]

// Re-export types for backward compatibility
export type { ConfigField, NodeField, NodeOutputField, NodeComponent } from "./types"