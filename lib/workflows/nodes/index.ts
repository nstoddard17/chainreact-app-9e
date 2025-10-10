// Temporary index file for refactored workflow nodes
// This will eventually replace availableNodes.ts

import { NodeComponent } from "./types"
import { automationNodes } from "./providers/automation"
import { genericTriggers } from "./providers/generic/triggers"
import { logicNodes } from "./providers/logic"
import { aiNodes } from "./providers/ai"
import { mailchimpNodes } from "./providers/mailchimp"
import { gmailNodes } from "./providers/gmail"
import { googleCalendarNodes } from "./providers/google-calendar"
import { googleDriveNodes } from "./providers/google-drive"
import { googleSheetsNodes } from "./providers/google-sheets"
import { microsoftExcelNodes } from "./providers/microsoft-excel"
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
import { googleDocsNodes } from "./providers/google-docs"
import { facebookNodes } from "./providers/facebook"
import { onedriveNodes } from "./providers/onedrive"
import { onenoteNodes } from "./providers/onenote"
import { dropboxNodes } from "./providers/dropbox"
import { miscNodes } from "./providers/misc"

// Migration complete! All 247 nodes have been extracted and organized by provider
// This file now replaces the original availableNodes.ts

export const ALL_NODE_COMPONENTS: NodeComponent[] = [
  ...automationNodes,
  ...genericTriggers,
  ...logicNodes,
  ...aiNodes,
  ...mailchimpNodes,
  ...gmailNodes,
  ...googleCalendarNodes,
  ...googleDriveNodes,
  ...googleSheetsNodes,
  ...microsoftExcelNodes,
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
  ...facebookNodes,
  ...onedriveNodes,
  ...onenoteNodes,
  ...dropboxNodes,
  ...miscNodes,
]

// Re-export types for backward compatibility
export type { ConfigField, NodeField, NodeOutputField, NodeComponent } from "./types"