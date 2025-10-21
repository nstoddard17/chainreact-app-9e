/**
 * availableNodes.ts - Refactored Version
 *
 * This file now serves as a re-export point for the modularized node structure.
 * The original 8,923-line file has been split into a modular structure under /lib/workflows/nodes/
 *
 * Migration completed: All 247 nodes have been extracted and organized by provider
 */

// Re-export everything from the modular structure
export { ALL_NODE_COMPONENTS } from "./nodes"

// Re-export types for backward compatibility
export type {
  ConfigField,
  NodeField,
  NodeOutputField as OutputField,
  NodeComponent
} from "./nodes/types"

// Re-export individual provider nodes if needed
export { gmailNodes } from "./nodes/providers/gmail"
export { slackNodes } from "./nodes/providers/slack"
export { discordNodes } from "./nodes/providers/discord"
export { notionNodes } from "./nodes/providers/notion"
export { airtableNodes } from "./nodes/providers/airtable"
export { hubspotNodes } from "./nodes/providers/hubspot"
export { stripeNodes } from "./nodes/providers/stripe"
export { googleSheetsNodes } from "./nodes/providers/google-sheets"
export { googleCalendarNodes } from "./nodes/providers/google-calendar"
export { googleDocsNodes } from "./nodes/providers/google-docs"
export { googleDriveNodes } from "./nodes/providers/google-drive"
export { githubNodes } from "./nodes/providers/github"
export { teamsNodes } from "./nodes/providers/teams"
export { outlookNodes } from "./nodes/providers/outlook"
export { onenoteNodes } from "./nodes/providers/onenote"
export { onedriveNodes } from "./nodes/providers/onedrive"
export { dropboxNodes } from "./nodes/providers/dropbox"
export { trelloNodes } from "./nodes/providers/trello"
export { twitterNodes } from "./nodes/providers/twitter"
export { facebookNodes } from "./nodes/providers/facebook"
export { mailchimpNodes } from "./nodes/providers/mailchimp"
export { logicNodes } from "./nodes/providers/logic"
export { aiNodes } from "./nodes/providers/ai"
export { automationNodes } from "./nodes/providers/automation"
export { genericTriggers } from "./nodes/providers/generic/triggers"
export { miscNodes } from "./nodes/providers/misc"

/**
 * Benefits of this refactoring:
 *
 * 1. File Size: From 8,923 lines → ~60 lines (99.3% reduction)
 * 2. Maintainability: Each provider has its own directory
 * 3. Performance: Faster IDE operations and code navigation
 * 4. Collaboration: Multiple developers can work on different providers without conflicts
 * 5. Testing: Easier to test individual providers in isolation
 * 6. Type Safety: Full TypeScript support maintained
 *
 * Directory Structure:
 * /lib/workflows/nodes/
 * ├── index.ts                    # Main aggregation file
 * ├── types.ts                    # Shared type definitions
 * └── providers/
 *     ├── gmail/
 *     │   ├── index.ts            # Provider exports
 *     │   ├── actions/            # Action schemas
 *     │   └── triggers/           # Trigger schemas
 *     ├── slack/
 *     ├── discord/
 *     └── ... (35+ providers)
 */