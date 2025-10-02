import { ActionResult } from './index'

// AI Data Processing actions
import {
  summarizeContent,
  extractInformation,
  analyzeSentiment,
  translateText,
  generateContent,
  classifyContent,
} from './aiDataProcessing'

// Gmail actions
import { sendGmailEmail } from './gmail/sendEmail'
import { applyGmailLabels } from './gmail/applyLabels'
import { searchGmailEmails } from './gmail'
import { fetchGmailMessage } from './gmail/fetchMessage'

// Google Sheets actions
import { readGoogleSheetsData, executeGoogleSheetsUnifiedAction, exportGoogleSheetsData } from './googleSheets'

// Microsoft Excel actions
import {
  executeMicrosoftExcelUnifiedAction,
  exportMicrosoftExcelSheet,
  createMicrosoftExcelWorkbook
} from './microsoft-excel'

// Google Calendar actions
import { createGoogleCalendarEvent } from './google-calendar/createEvent'

// Google Drive actions
import { uploadGoogleDriveFile } from './googleDrive/uploadFile'

// Google Docs actions
import {
  createGoogleDocument,
  updateGoogleDocument,
  shareGoogleDocument,
  getGoogleDocument
} from './googleDocs'

// Airtable actions
import {
  moveAirtableRecord,
  createAirtableRecord,
  updateAirtableRecord,
  listAirtableRecords,
} from './airtable'

// Slack actions
import { createSlackChannel, slackActionSendMessage } from './slack'

// Trello actions
import {
  createTrelloList,
  createTrelloCard,
  moveTrelloCard,
} from './trello'

// Discord actions
import {
  sendDiscordMessage,
  sendDiscordDirectMessage,
  createDiscordChannel,
  createDiscordCategory,
  deleteDiscordCategory,
  addDiscordRole,
  editDiscordMessage,
  fetchDiscordMessages,
  deleteDiscordMessage,
  addDiscordReaction,
  removeDiscordReaction,
  editDiscordChannel,
  deleteDiscordChannel,
  listDiscordChannels,
  fetchDiscordGuildMembers,
  removeDiscordRole,
  kickDiscordMember,
  banDiscordMember,
  unbanDiscordMember,
} from './discord'

// Notion actions - existing (only keeping search for backward compatibility)
import {
  searchNotionPages,
} from './notion'

// Notion unified action handlers
import { executeNotionManageDatabase } from './notion/manageDatabase'
import { executeNotionManagePage } from './notion/managePage'
import { executeNotionManageUsers } from './notion/manageUsers'
import { executeNotionManageComments } from './notion/manageComments'

// Notion actions - comprehensive new handlers
import {
  notionCreatePage,
  notionUpdatePage,
  notionRetrievePage,
  notionArchivePage,
  notionCreateDatabase,
  notionQueryDatabase,
  notionUpdateDatabase,
  notionAppendBlocks,
  notionUpdateBlock,
  notionDeleteBlock,
  notionRetrieveBlockChildren,
  notionListUsers,
  notionRetrieveUser,
  notionCreateComment,
  notionRetrieveComments,
  notionSearch,
  notionDuplicatePage,
  notionSyncDatabaseEntries,
} from './notion/handlers'

// Notion get page details action
import { notionGetPageDetails } from './notion/getPageDetails'

// GitHub actions
import {
  createGitHubIssue,
  createGitHubRepository,
  createGitHubPullRequest,
} from './github'

// HubSpot actions
import {
  createHubSpotContact,
  createHubSpotCompany,
  createHubSpotDeal,
  addContactToHubSpotList,
  updateHubSpotDeal,
} from './hubspot'

// HubSpot dynamic actions
import {
  createHubSpotObject,
  updateHubSpotObject,
  upsertHubSpotObject,
  refreshHubSpotProperties,
} from './hubspotDynamic'

// Microsoft OneNote actions
import {
  onenoteCreatePage,
  onenoteCreateNotebook,
  onenoteCreateSection,
  onenoteUpdatePage,
  onenoteGetPageContent,
  onenoteGetPages,
  onenoteCopyPage,
  onenoteSearch,
  onenoteDeletePage,
} from './microsoft-onenote'

// OneDrive actions
import { uploadFileToOneDrive } from './onedrive'

// Facebook actions
import {
  createFacebookPost,
  getFacebookPageInsights,
  sendFacebookMessage,
  commentOnFacebookPost,
} from './facebook'

// Twitter actions - now imported from the new module
import {
  postTweetHandler,
  replyTweetHandler,
  retweetHandler,
  unretweetHandler,
  likeTweetHandler,
  unlikeTweetHandler,
  sendDMHandler,
  followUserHandler,
  unfollowUserHandler,
  deleteTweetHandler,
  searchTweetsHandler,
  getUserTimelineHandler,
  getMentionsHandler
} from './twitter/handlers'

// YouTube actions - now imported from the new module
import {
  uploadVideoHandler,
  listVideosHandler
} from './youtube/handlers'

// Dropbox actions
import { uploadDropboxFile } from './dropbox'

// Workflow control actions
import {
  executeIfThenCondition,
  executeWaitForTime
} from './core'

// Generic actions
import {
  executeDelayAction,
  executeGenericAction
} from './generic'

// AI Agent action
import { executeAIAgent } from '../aiAgent'

// New "Get" actions with ExecutionContext pattern
import { notionGetPages } from './notion/getPages'
import { getTrelloCards } from './trello/getCards'
import { getSlackMessages } from './slack/getMessages'
import { getOnedriveFile } from './onedrive/getFile'
import { getDropboxFile } from './dropbox/getFile'
import { getBoxFile } from './box/getFile'
import { hubspotGetContacts } from './hubspot/getContacts'
import { hubspotGetCompanies } from './hubspot/getCompanies'
import { hubspotGetDeals } from './hubspot/getDeals'
import { mailchimpGetSubscribers } from './mailchimp/getSubscribers'
import { stripeGetCustomers } from './stripe/getCustomers'
import { stripeGetPayments } from './stripe/getPayments'

// Import resolveValue for wrapper functions
import { resolveValue as resolveValueCore } from './core/resolveValue'

/**
 * Wrapper function for AI agent execution that adapts to the executeAction signature
 */
async function executeAIAgentWrapper(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve any variable references in the config
    const resolvedConfig = resolveValue(config, input)
    
    const result = await executeAIAgent({
      userId,
      config: resolvedConfig,
      input,
      workflowContext: {
        nodes: [],
        previousResults: input.nodeOutputs || {}
      }
    })
    
    return {
      success: result.success,
      output: {
        output: result.output || "" // Structure matches outputSchema: { output: "AI response text" }
      },
      message: result.message || "AI Agent execution completed"
    }
  } catch (error: any) {
    console.error("AI Agent execution error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "AI Agent execution failed"
    }
  }
}

/**
 * Helper function to resolve templated values
 */
function resolveValue(value: any, input: Record<string, any>): any {
  if (typeof value !== "string") return value
  const match = value.match(/^{{(.*)}}$/)
  if (match) {
    const key = match[1]
    return key.split(".").reduce((acc: any, part: any) => acc && acc[part], input)
  }
  return value
}

/**
 * Helper to create ExecutionContext wrapper for actions using that pattern
 */
function createExecutionContextWrapper(handler: Function) {
  return async (params: { config: any; userId: string; input: Record<string, any> }): Promise<ActionResult> => {
    // Create a mock ExecutionContext with a dataFlowManager that uses resolveValue
    const context = {
      userId: params.userId,
      workflowId: params.input?.workflowId || 'unknown',
      testMode: params.input?.testMode || false,
      dataFlowManager: {
        resolveVariable: (value: any) => resolveValueCore(value, params.input)
      }
    }

    try {
      return await handler(params.config, context)
    } catch (error: any) {
      console.error('Action execution error:', error)
      return {
        success: false,
        output: {},
        message: error.message || 'Action execution failed'
      }
    }
  }
}

/**
 * Central registry of all action handlers
 */
export const actionHandlerRegistry: Record<string, Function> = {
  // AI Data Processing actions
  "ai_action_summarize": summarizeContent,
  "ai_action_extract": extractInformation,
  "ai_action_sentiment": analyzeSentiment,
  "ai_action_translate": translateText,
  "ai_action_generate": generateContent,
  "ai_action_classify": classifyContent,
  
  // Gmail actions
  "gmail_action_send_email": sendGmailEmail,
  "gmail_action_add_label": applyGmailLabels,
  "gmail_action_apply_labels": applyGmailLabels,
  "gmail_action_search_email": searchGmailEmails,
  "gmail_action_fetch_message": fetchGmailMessage,
  
  // Google Sheets actions
  "google_sheets_action_read_data": readGoogleSheetsData,
  "google_sheets_unified_action": executeGoogleSheetsUnifiedAction,
  "google-sheets_action_export_sheet": exportGoogleSheetsData,

  // Microsoft Excel actions
  "microsoft_excel_unified_action": executeMicrosoftExcelUnifiedAction,
  "microsoft-excel_action_export_sheet": exportMicrosoftExcelSheet,
  "microsoft_excel_action_create_workbook": createMicrosoftExcelWorkbook,

  // Google Calendar actions
  "google_calendar_action_create_event": createGoogleCalendarEvent,
  
  // Google Drive actions
  "google_drive_action_upload_file": uploadGoogleDriveFile,
  
  // Google Docs actions
  "google_docs_action_create_document": createGoogleDocument,
  "google_docs_action_update_document": updateGoogleDocument,
  "google_docs_action_share_document": shareGoogleDocument,
  "google_docs_action_get_document": getGoogleDocument,
  
  // Airtable actions
  "airtable_action_move_record": moveAirtableRecord,
  "airtable_action_create_record": createAirtableRecord,
  "airtable_action_update_record": updateAirtableRecord,
  "airtable_action_list_records": listAirtableRecords,
  
  // Slack actions - wrapped to handle new calling convention
  "slack_action_create_channel": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createSlackChannel(params.config, params.userId, params.input),
  "slack_action_send_message": (params: { config: any; userId: string; input: Record<string, any> }) =>
    slackActionSendMessage(params.config, params.userId, params.input),
  
  // Trello actions - wrapped to handle new calling convention
  "trello_action_create_list": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createTrelloList(params.config, params.userId, params.input),
  "trello_action_create_card": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createTrelloCard(params.config, params.userId, params.input),
  "trello_action_move_card": (params: { config: any; userId: string; input: Record<string, any> }) =>
    moveTrelloCard(params.config, params.userId, params.input),
  
  // Discord actions - wrapped to handle new calling convention
  "discord_action_send_message": (params: { config: any; userId: string; input: Record<string, any> }) =>
    sendDiscordMessage(params.config, params.userId, params.input),
  "discord_action_send_direct_message": (params: { config: any; userId: string; input: Record<string, any> }) =>
    sendDiscordDirectMessage(params.config, params.userId, params.input),
  "discord_action_create_channel": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createDiscordChannel(params.config, params.userId, params.input),
  "discord_action_create_category": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createDiscordCategory(params.config, params.userId, params.input),
  "discord_action_delete_category": (params: { config: any; userId: string; input: Record<string, any> }) =>
    deleteDiscordCategory(params.config, params.userId, params.input),
  "discord_action_add_role": (params: { config: any; userId: string; input: Record<string, any> }) =>
    addDiscordRole(params.config, params.userId, params.input),
  "discord_action_edit_message": (params: { config: any; userId: string; input: Record<string, any> }) =>
    editDiscordMessage(params.config, params.userId, params.input),
  "discord_action_fetch_messages": (params: { config: any; userId: string; input: Record<string, any> }) =>
    fetchDiscordMessages(params.config, params.userId, params.input),
  "discord_action_delete_message": (params: { config: any; userId: string; input: Record<string, any> }) =>
    deleteDiscordMessage(params.config, params.userId, params.input),
  "discord_action_add_reaction": (params: { config: any; userId: string; input: Record<string, any> }) =>
    addDiscordReaction(params.config, params.userId, params.input),
  "discord_action_remove_reaction": (params: { config: any; userId: string; input: Record<string, any> }) =>
    removeDiscordReaction(params.config, params.userId, params.input),
  "discord_action_update_channel": (params: { config: any; userId: string; input: Record<string, any> }) =>
    editDiscordChannel(params.config, params.userId, params.input),
  "discord_action_delete_channel": (params: { config: any; userId: string; input: Record<string, any> }) =>
    deleteDiscordChannel(params.config, params.userId, params.input),
  "discord_action_list_channels": (params: { config: any; userId: string; input: Record<string, any> }) =>
    listDiscordChannels(params.config, params.userId, params.input),
  "discord_action_fetch_guild_members": (params: { config: any; userId: string; input: Record<string, any> }) =>
    fetchDiscordGuildMembers(params.config, params.userId, params.input),
  "discord_action_assign_role": (params: { config: any; userId: string; input: Record<string, any> }) =>
    addDiscordRole(params.config, params.userId, params.input),
  "discord_action_remove_role": (params: { config: any; userId: string; input: Record<string, any> }) =>
    removeDiscordRole(params.config, params.userId, params.input),
  "discord_action_kick_member": (params: { config: any; userId: string; input: Record<string, any> }) =>
    kickDiscordMember(params.config, params.userId, params.input),
  "discord_action_ban_member": (params: { config: any; userId: string; input: Record<string, any> }) =>
    banDiscordMember(params.config, params.userId, params.input),
  "discord_action_unban_member": (params: { config: any; userId: string; input: Record<string, any> }) =>
    unbanDiscordMember(params.config, params.userId, params.input),
  
  // Notion actions - search kept for backward compatibility
  "notion_action_search_pages": searchNotionPages,

  // Notion unified actions (primary handlers)
  "notion_action_manage_page": executeNotionManagePage,
  "notion_action_manage_database": executeNotionManageDatabase,
  "notion_action_manage_users": executeNotionManageUsers,
  "notion_action_manage_comments": executeNotionManageComments,
  "notion_action_search": notionSearch,

  // Notion actions - comprehensive API v2 actions
  // "notion_action_retrieve_page": notionRetrievePage, // Removed - using notion_action_get_page_details instead
  "notion_action_archive_page": notionArchivePage,
  "notion_action_query_database": notionQueryDatabase,
  "notion_action_update_database": notionUpdateDatabase,
  "notion_action_append_blocks": notionAppendBlocks,
  "notion_action_update_block": notionUpdateBlock,
  "notion_action_delete_block": notionDeleteBlock,
  "notion_action_retrieve_block_children": notionRetrieveBlockChildren,
  "notion_action_list_users": notionListUsers,
  "notion_action_retrieve_user": notionRetrieveUser,
  "notion_action_create_comment": notionCreateComment,
  "notion_action_retrieve_comments": notionRetrieveComments,
  "notion_action_search": notionSearch,
  "notion_action_duplicate_page": notionDuplicatePage,
  "notion_action_sync_database_entries": notionSyncDatabaseEntries,
  "notion_action_get_page_details": notionGetPageDetails,
  "notion_action_get_pages": createExecutionContextWrapper(notionGetPages),

  // GitHub actions
  "github_action_create_issue": createGitHubIssue,
  "github_action_create_repository": createGitHubRepository,
  "github_action_create_pull_request": createGitHubPullRequest,
  
  // HubSpot actions
  "hubspot_action_create_contact": createHubSpotContact,
  "hubspot_action_create_company": createHubSpotCompany,
  "hubspot_action_create_deal": createHubSpotDeal,
  "hubspot_action_add_contact_to_list": addContactToHubSpotList,
  "hubspot_action_update_deal": updateHubSpotDeal,

  // HubSpot dynamic actions
  "hubspot_action_create_object": createHubSpotObject,
  "hubspot_action_update_object": updateHubSpotObject,
  "hubspot_action_upsert_object": upsertHubSpotObject,
  "hubspot_action_refresh_properties": refreshHubSpotProperties,

  // HubSpot Get actions
  "hubspot_action_get_contacts": createExecutionContextWrapper(hubspotGetContacts),
  "hubspot_action_get_companies": createExecutionContextWrapper(hubspotGetCompanies),
  "hubspot_action_get_deals": createExecutionContextWrapper(hubspotGetDeals),

  // Microsoft OneNote actions
  "microsoft-onenote_action_create_page": onenoteCreatePage,
  "microsoft-onenote_action_create_notebook": onenoteCreateNotebook,
  "microsoft-onenote_action_create_section": onenoteCreateSection,
  "microsoft-onenote_action_update_page": onenoteUpdatePage,
  "microsoft-onenote_action_get_page_content": onenoteGetPageContent,
  "microsoft-onenote_action_get_pages": onenoteGetPages,
  "microsoft-onenote_action_copy_page": onenoteCopyPage,
  "microsoft-onenote_action_search": onenoteSearch,
  "microsoft-onenote_action_delete_page": onenoteDeletePage,

  // OneDrive actions
  "onedrive_action_upload_file": uploadFileToOneDrive,
  "onedrive_action_get_file": createExecutionContextWrapper(getOnedriveFile),

  // Facebook actions
  "facebook_action_create_post": createFacebookPost,
  "facebook_action_get_page_insights": getFacebookPageInsights,
  "facebook_action_send_message": sendFacebookMessage,
  "facebook_action_comment_on_post": commentOnFacebookPost,
  
  // YouTube actions
  "youtube_action_upload_video": uploadVideoHandler,
  "youtube_action_list_videos": listVideosHandler,

  // Dropbox actions
  "dropbox_action_upload_file": uploadDropboxFile,
  "dropbox_action_get_file": createExecutionContextWrapper(getDropboxFile),

  // Box actions
  "box_action_get_file": createExecutionContextWrapper(getBoxFile),

  // Slack Get actions
  "slack_action_get_messages": createExecutionContextWrapper(getSlackMessages),

  // Trello Get actions
  "trello_action_get_cards": createExecutionContextWrapper(getTrelloCards),

  // Mailchimp actions
  "mailchimp_action_get_subscribers": createExecutionContextWrapper(mailchimpGetSubscribers),

  // Stripe actions
  "stripe_action_get_customers": createExecutionContextWrapper(stripeGetCustomers),
  "stripe_action_get_payments": createExecutionContextWrapper(stripeGetPayments),

  // Twitter actions
  "twitter_action_post_tweet": postTweetHandler,
  "twitter_action_reply_tweet": replyTweetHandler,
  "twitter_action_retweet": retweetHandler,
  "twitter_action_unretweet": unretweetHandler,
  "twitter_action_like_tweet": likeTweetHandler,
  "twitter_action_unlike_tweet": unlikeTweetHandler,
  "twitter_action_send_dm": sendDMHandler,
  "twitter_action_follow_user": followUserHandler,
  "twitter_action_unfollow_user": unfollowUserHandler,
  "twitter_action_delete_tweet": deleteTweetHandler,
  "twitter_action_search_tweets": searchTweetsHandler,
  "twitter_action_get_user_timeline": getUserTimelineHandler,
  "twitter_action_get_mentions": getMentionsHandler,
  
  // Workflow control actions - special handling needed for wait_for_time
  "if_then_condition": executeIfThenCondition,
  "delay": executeDelayAction,
  "ai_agent": executeAIAgentWrapper
}

/**
 * Special handler for wait_for_time that needs workflow context
 */
export function getWaitForTimeHandler(workflowId: string, nodeId: string) {
  return (cfg: any, uid: string, inp: any) =>
    executeWaitForTime(cfg, uid, inp, { workflowId, nodeId })
}

// Export Notion unified handlers for use in IntegrationHandlers
export {
  executeNotionManagePage,
  executeNotionManageDatabase,
  executeNotionManageUsers,
  executeNotionManageComments,
  notionGetPageDetails as executeNotionGetPageDetails,
  notionSearch as executeNotionSearch
}