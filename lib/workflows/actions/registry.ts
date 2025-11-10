import { ActionResult } from './index'
import { executeAIAgentAction } from './aiAgentAction'

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
import { fetchGmailTriggerEmail } from './gmail/fetchTriggerEmail'

// Google Sheets actions
import { readGoogleSheetsData, exportGoogleSheetsData, createGoogleSheetsRow, updateGoogleSheetsRow, deleteGoogleSheetsRow, clearGoogleSheetsRange } from './googleSheets'

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

// Google Analytics actions
import {
  sendGoogleAnalyticsEvent,
  getGoogleAnalyticsRealtimeData,
  runGoogleAnalyticsReport,
  getGoogleAnalyticsUserActivity
} from './google-analytics'

// Airtable actions
import {
  moveAirtableRecord,
  createAirtableRecord,
  updateAirtableRecord,
  listAirtableRecords,
  findAirtableRecord,
  deleteAirtableRecord,
  addAirtableAttachment,
  duplicateAirtableRecord,
  getAirtableTableSchema,
  getAirtableBaseSchema,
} from './airtable'

// Monday.com actions
import {
  createMondayItem,
  updateMondayItem,
  createMondayUpdate
} from './monday'

// Slack actions
import { createSlackChannel, slackActionSendMessage, slackActionDeleteMessage } from './slack'

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
  createGitHubGist,
  addGitHubComment,
} from './github'

// Outlook actions
import {
  sendOutlookEmail,
} from './outlook'

// HubSpot actions
import {
  createHubSpotContact,
  createHubSpotCompany,
  createHubSpotDeal,
  addContactToHubSpotList,
  updateHubSpotDeal,
  hubspotUpdateContact,
  hubspotUpdateCompany,
  hubspotCreateTicket,
  hubspotUpdateTicket,
  hubspotGetTickets,
  hubspotCreateNote,
  hubspotCreateTask,
  hubspotCreateCall,
  hubspotCreateMeeting,
  hubspotGetContacts,
  hubspotGetCompanies,
  hubspotGetDeals,
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
  deleteFacebookPost,
  updateFacebookPost,
  uploadFacebookPhoto,
  uploadFacebookVideo,
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

// Dropbox actions
import { uploadDropboxFile, findDropboxFiles } from './dropbox'

// Shopify actions
import { createShopifyOrder } from './shopify/createOrder'
import { updateShopifyProduct } from './shopify/updateProduct'
import { updateShopifyCustomer } from './shopify/updateCustomer'
import { createShopifyFulfillment } from './shopify/createFulfillment'
import { createShopifyProductVariant } from './shopify/createProductVariant'
import { updateShopifyProductVariant } from './shopify/updateProductVariant'

// Utility actions
import {
  executeTransformer,
  formatTransformer,
  executeFileUpload,
  executeExtractWebsiteData,
  executeGoogleSearch,
  executeTavilySearch
} from './utility'

// Workflow control actions
import {
  executeIfThenCondition,
  executeWaitForTime
} from './core'

// Logic control actions
import { executePath } from './logic/executePath'
import { executeFilter } from './logic/executeFilter'
import { executeHttpRequest } from './logic/executeHttpRequest'
import { executeLoop } from './logic/loop'

// HITL (Human-in-the-Loop) action
import { executeHITL } from './hitl'

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
// HubSpot Get actions now imported from index.ts above
import { mailchimpGetSubscribers } from './mailchimp/getSubscribers'
import { mailchimpAddSubscriber } from './mailchimp/addSubscriber'
import { mailchimpUpdateSubscriber } from './mailchimp/updateSubscriber'
import { mailchimpRemoveSubscriber } from './mailchimp/removeSubscriber'
import { mailchimpAddTag } from './mailchimp/addTag'
import { mailchimpRemoveTag } from './mailchimp/removeTag'
import { mailchimpSendCampaign } from './mailchimp/sendCampaign'
import { mailchimpCreateCampaign } from './mailchimp/createCampaign'
import { stripeGetPayments } from './stripe/getPayments'
import { stripeUpdateCustomer } from './stripe/updateCustomer'
import { stripeCreateRefund } from './stripe/createRefund'
import { stripeCancelSubscription } from './stripe/cancelSubscription'
import { stripeUpdateSubscription } from './stripe/updateSubscription'
import { stripeCreateCheckoutSession } from './stripe/createCheckoutSession'
import { stripeCreatePaymentLink } from './stripe/createPaymentLink'
import { stripeFindCustomer } from './stripe/findCustomer'
import { stripeFindSubscription } from './stripe/findSubscription'
import { stripeFindPaymentIntent } from './stripe/findPaymentIntent'
import { stripeCreateProduct } from './stripe/createProduct'
import { stripeCreatePrice } from './stripe/createPrice'
import { stripeUpdateProduct } from './stripe/updateProduct'
import { stripeListProducts } from './stripe/listProducts'
import { stripeCreateInvoiceItem } from './stripe/createInvoiceItem'
import { stripeFinalizeInvoice } from './stripe/finalizeInvoice'
import { stripeVoidInvoice } from './stripe/voidInvoice'
import { stripeUpdateInvoice } from './stripe/updateInvoice'
import { stripeConfirmPaymentIntent } from './stripe/confirmPaymentIntent'
import { stripeCapturePaymentIntent } from './stripe/capturePaymentIntent'
import { stripeFindCharge } from './stripe/findCharge'
import { stripeFindInvoice } from './stripe/findInvoice'

// Import resolveValue for wrapper functions
import { resolveValue as resolveValueCore } from './core/resolveValue'

import { logger } from '@/lib/utils/logger'

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
      logger.error('Action execution error:', error)
      return {
        success: false,
        output: {},
        message: error.message || 'Action execution failed'
      }
    }
  }
}

/**
 * Unified AI Agent Wrapper
 * Handles message generation, routing, and hybrid modes
 */
async function executeAIAgentWrapper(params: { config: any; userId: string; input: Record<string, any>; context?: any }): Promise<ActionResult> {
  const { config, userId, input, context } = params

  try {
    const workflowId = input.workflowId || input.workflow?.id || 'unknown'
    const executionId = input.executionId || input.sessionId || 'unknown'

    const executionContext: any = context || {
      userId,
      workflowId,
      executionId,
      testMode: false,
      data: input,
      variables: {},
      results: {}
    }

    const result = await executeAIAgentAction(config, input, executionContext)

    return {
      success: result.success,
      data: result.data || {},
      output: result.data || {},
      nextNodeId: result.nextNodeId,
      message: result.success ? 'AI Agent completed successfully' : 'AI Agent failed'
    }
  } catch (error: any) {
    logger.error('AI Agent execution error:', error)
    return {
      success: false,
      output: {},
      data: {},
      message: error?.message || 'AI Agent execution failed',
      error: error?.message || 'AI Agent execution failed'
    }
  }
}

/**
 * Central registry of all action handlers
 */
export const actionHandlerRegistry: Record<string, Function> = {
  // Unified AI Agent (replaces ai_router and ai_message)
  "ai_agent": executeAIAgentWrapper,

  // AI Data Processing actions - wrapped to handle new calling convention
  "ai_action_summarize": (params: { config: any; userId: string; input: Record<string, any> }) =>
    summarizeContent(params.config, params.userId, params.input),
  "ai_action_extract": (params: { config: any; userId: string; input: Record<string, any> }) =>
    extractInformation(params.config, params.userId, params.input),
  "ai_action_sentiment": (params: { config: any; userId: string; input: Record<string, any> }) =>
    analyzeSentiment(params.config, params.userId, params.input),
  "ai_action_translate": (params: { config: any; userId: string; input: Record<string, any> }) =>
    translateText(params.config, params.userId, params.input),
  "ai_action_generate": (params: { config: any; userId: string; input: Record<string, any> }) =>
    generateContent(params.config, params.userId, params.input),
  "ai_action_classify": (params: { config: any; userId: string; input: Record<string, any> }) =>
    classifyContent(params.config, params.userId, params.input),
  
  // Gmail actions - mixed signatures (sendGmailEmail already uses params)
  "gmail_action_send_email": sendGmailEmail,
  "gmail_action_add_label": (params: { config: any; userId: string; input: Record<string, any> }) =>
    applyGmailLabels(params.config, params.userId, params.input),
  "gmail_action_apply_labels": (params: { config: any; userId: string; input: Record<string, any> }) =>
    applyGmailLabels(params.config, params.userId, params.input),
  "gmail_action_search_email": (params: { config: any; userId: string; input: Record<string, any> }) =>
    searchGmailEmails(params.config, params.userId, params.input),
  "gmail_action_fetch_message": (params: { config: any; userId: string; input: Record<string, any> }) =>
    fetchGmailMessage(params.config, params.userId, params.input),

  // Gmail trigger handler - fetches real email data for testing
  "gmail_trigger_new_email": (params: { config: any; userId: string; input: Record<string, any> }) =>
    fetchGmailTriggerEmail(params.config, params.userId, params.input),
  
  // Google Sheets actions - wrapped to handle new calling convention
  "google_sheets_action_read_data": (params: { config: any; userId: string; input: Record<string, any> }) =>
    readGoogleSheetsData(params.config, params.userId, params.input),
  "google_sheets_action_append_row": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createGoogleSheetsRow(params.config, params.userId, params.input),
  "google_sheets_action_update_row": (params: { config: any; userId: string; input: Record<string, any> }) =>
    updateGoogleSheetsRow(params.config, params.userId, params.input),
  "google_sheets_action_delete_row": (params: { config: any; userId: string; input: Record<string, any> }) =>
    deleteGoogleSheetsRow(params.config, params.userId, params.input),
  "google_sheets_action_clear_range": (params: { config: any; userId: string; input: Record<string, any> }) =>
    clearGoogleSheetsRange(params.config, params.userId, params.input),
  "google-sheets_action_export_sheet": (params: { config: any; userId: string; input: Record<string, any> }) =>
    exportGoogleSheetsData(params.config, params.userId, params.input),

  // Microsoft Excel actions - wrapped to handle new calling convention
  "microsoft_excel_unified_action": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeMicrosoftExcelUnifiedAction(params.config, params.userId, params.input),
  "microsoft-excel_action_export_sheet": (params: { config: any; userId: string; input: Record<string, any> }) =>
    exportMicrosoftExcelSheet(params.config, params.userId, params.input),
  "microsoft_excel_action_create_workbook": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createMicrosoftExcelWorkbook(params.config, params.userId, params.input),

  // Google Calendar actions - wrapped to handle new calling convention
  "google_calendar_action_create_event": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createGoogleCalendarEvent(params.config, params.userId, params.input),

  // Google Drive actions - wrapped to handle new calling convention
  "google_drive_action_upload_file": (params: { config: any; userId: string; input: Record<string, any> }) =>
    uploadGoogleDriveFile(params.config, params.userId, params.input),

  // Google Docs actions - wrapped to handle new calling convention
  "google_docs_action_create_document": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createGoogleDocument(params.config, params.userId, params.input),
  "google_docs_action_update_document": (params: { config: any; userId: string; input: Record<string, any> }) =>
    updateGoogleDocument(params.config, params.userId, params.input),
  "google_docs_action_share_document": (params: { config: any; userId: string; input: Record<string, any> }) =>
    shareGoogleDocument(params.config, params.userId, params.input),
  "google_docs_action_get_document": (params: { config: any; userId: string; input: Record<string, any> }) =>
    getGoogleDocument(params.config, params.userId, params.input),

  // Google Analytics actions - wrapped with ExecutionContext pattern
  "google_analytics_action_send_event": createExecutionContextWrapper(sendGoogleAnalyticsEvent),
  "google_analytics_action_get_realtime_data": createExecutionContextWrapper(getGoogleAnalyticsRealtimeData),
  "google_analytics_action_run_report": createExecutionContextWrapper(runGoogleAnalyticsReport),
  "google_analytics_action_get_user_activity": createExecutionContextWrapper(getGoogleAnalyticsUserActivity),

  // Airtable actions - wrapped to handle new calling convention
  "airtable_action_move_record": (params: { config: any; userId: string; input: Record<string, any> }) =>
    moveAirtableRecord(params.config, params.userId, params.input),
  "airtable_action_create_record": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createAirtableRecord(params.config, params.userId, params.input),
  "airtable_action_update_record": (params: { config: any; userId: string; input: Record<string, any> }) =>
    updateAirtableRecord(params.config, params.userId, params.input),
  "airtable_action_list_records": (params: { config: any; userId: string; input: Record<string, any> }) =>
    listAirtableRecords(params.config, params.userId, params.input),
  "airtable_action_find_record": (params: { config: any; userId: string; input: Record<string, any> }) =>
    findAirtableRecord(params.config, params.userId, params.input),
  "airtable_action_delete_record": (params: { config: any; userId: string; input: Record<string, any> }) =>
    deleteAirtableRecord(params.config, params.userId, params.input),
  "airtable_action_add_attachment": (params: { config: any; userId: string; input: Record<string, any> }) =>
    addAirtableAttachment(params.config, params.userId, params.input),
  "airtable_action_duplicate_record": (params: { config: any; userId: string; input: Record<string, any> }) =>
    duplicateAirtableRecord(params.config, params.userId, params.input),
  "airtable_action_get_table_schema": (params: { config: any; userId: string; input: Record<string, any> }) =>
    getAirtableTableSchema(params.config, params.userId, params.input),
  "airtable_action_get_base_schema": (params: { config: any; userId: string; input: Record<string, any> }) =>
    getAirtableBaseSchema(params.config, params.userId, params.input),

  // Monday.com actions - wrapped to handle new calling convention
  "monday_action_create_item": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createMondayItem(params.config, params.userId, params.input),
  "monday_action_update_item": (params: { config: any; userId: string; input: Record<string, any> }) =>
    updateMondayItem(params.config, params.userId, params.input),
  "monday_action_create_update": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createMondayUpdate(params.config, params.userId, params.input),

  // Slack actions - wrapped to handle new calling convention
  "slack_action_create_channel": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createSlackChannel(params.config, params.userId, params.input),
  "slack_action_send_message": (params: { config: any; userId: string; input: Record<string, any> }) =>
    slackActionSendMessage(params.config, params.userId, params.input),
  "slack_action_delete_message": slackActionDeleteMessage,
  
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
  "notion_action_search_pages": (params: { config: any; userId: string; input: Record<string, any> }) =>
    searchNotionPages(params.config, params.userId, params.input),

  // Notion unified actions (primary handlers) - wrapped to handle new calling convention
  "notion_action_manage_page": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeNotionManagePage(params.config, params.userId, params.input),
  "notion_action_manage_database": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeNotionManageDatabase(params.config, params.userId, params.input),
  "notion_action_manage_users": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeNotionManageUsers(params.config, params.userId, params.input),
  "notion_action_manage_comments": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeNotionManageComments(params.config, params.userId, params.input),
  "notion_action_search": (params: { config: any; userId: string; input: Record<string, any> }) =>
    notionSearch(params.config, params.userId, params.input),

  // Notion actions - comprehensive API v2 actions - wrapped to handle new calling convention
  // "notion_action_retrieve_page": notionRetrievePage, // Removed - using notion_action_get_page_details instead
  "notion_action_archive_page": (params: { config: any; userId: string; input: Record<string, any> }) =>
    notionArchivePage(params.config, params.userId, params.input),
  "notion_action_query_database": (params: { config: any; userId: string; input: Record<string, any> }) =>
    notionQueryDatabase(params.config, params.userId, params.input),
  "notion_action_update_database": (params: { config: any; userId: string; input: Record<string, any> }) =>
    notionUpdateDatabase(params.config, params.userId, params.input),
  "notion_action_append_blocks": (params: { config: any; userId: string; input: Record<string, any> }) =>
    notionAppendBlocks(params.config, params.userId, params.input),
  "notion_action_update_block": (params: { config: any; userId: string; input: Record<string, any> }) =>
    notionUpdateBlock(params.config, params.userId, params.input),
  "notion_action_delete_block": (params: { config: any; userId: string; input: Record<string, any> }) =>
    notionDeleteBlock(params.config, params.userId, params.input),
  "notion_action_retrieve_block_children": (params: { config: any; userId: string; input: Record<string, any> }) =>
    notionRetrieveBlockChildren(params.config, params.userId, params.input),
  "notion_action_list_users": (params: { config: any; userId: string; input: Record<string, any> }) =>
    notionListUsers(params.config, params.userId, params.input),
  "notion_action_retrieve_user": (params: { config: any; userId: string; input: Record<string, any> }) =>
    notionRetrieveUser(params.config, params.userId, params.input),
  "notion_action_create_comment": (params: { config: any; userId: string; input: Record<string, any> }) =>
    notionCreateComment(params.config, params.userId, params.input),
  "notion_action_retrieve_comments": (params: { config: any; userId: string; input: Record<string, any> }) =>
    notionRetrieveComments(params.config, params.userId, params.input),
  "notion_action_search": (params: { config: any; userId: string; input: Record<string, any> }) =>
    notionSearch(params.config, params.userId, params.input),
  "notion_action_duplicate_page": (params: { config: any; userId: string; input: Record<string, any> }) =>
    notionDuplicatePage(params.config, params.userId, params.input),
  "notion_action_sync_database_entries": (params: { config: any; userId: string; input: Record<string, any> }) =>
    notionSyncDatabaseEntries(params.config, params.userId, params.input),
  "notion_action_get_page_details": (params: { config: any; userId: string; input: Record<string, any> }) =>
    notionGetPageDetails(params.config, params.userId, params.input),

  // GitHub actions - wrapped to handle new calling convention
  "github_action_create_issue": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createGitHubIssue(params.config, params.userId, params.input),
  "github_action_create_repository": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createGitHubRepository(params.config, params.userId, params.input),
  "github_action_create_pull_request": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createGitHubPullRequest(params.config, params.userId, params.input),
  "github_action_create_gist": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createGitHubGist(params.config, params.userId, params.input),
  "github_action_add_comment": (params: { config: any; userId: string; input: Record<string, any> }) =>
    addGitHubComment(params.config, params.userId, params.input),

  // Outlook actions - wrapped to handle new calling convention
  "microsoft-outlook_action_send_email": (params: { config: any; userId: string; input: Record<string, any> }) =>
    sendOutlookEmail(params.config, params.userId, params.input),

  // HubSpot actions - wrapped to handle new calling convention
  "hubspot_action_create_contact": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createHubSpotContact(params.config, params.userId, params.input),
  "hubspot_action_create_company": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createHubSpotCompany(params.config, params.userId, params.input),
  "hubspot_action_create_deal": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createHubSpotDeal(params.config, params.userId, params.input),
  "hubspot_action_add_contact_to_list": (params: { config: any; userId: string; input: Record<string, any> }) =>
    addContactToHubSpotList(params.config, params.userId, params.input),
  "hubspot_action_update_deal": (params: { config: any; userId: string; input: Record<string, any> }) =>
    updateHubSpotDeal(params.config, params.userId, params.input),

  // HubSpot dynamic actions - wrapped to handle new calling convention
  "hubspot_action_create_object": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createHubSpotObject(params.config, params.userId, params.input),
  "hubspot_action_update_object": (params: { config: any; userId: string; input: Record<string, any> }) =>
    updateHubSpotObject(params.config, params.userId, params.input),
  "hubspot_action_upsert_object": (params: { config: any; userId: string; input: Record<string, any> }) =>
    upsertHubSpotObject(params.config, params.userId, params.input),
  "hubspot_action_refresh_properties": (params: { config: any; userId: string; input: Record<string, any> }) =>
    refreshHubSpotProperties(params.config, params.userId, params.input),

  // HubSpot Get actions
  "hubspot_action_get_contacts": createExecutionContextWrapper(hubspotGetContacts),
  "hubspot_action_get_companies": createExecutionContextWrapper(hubspotGetCompanies),
  "hubspot_action_get_deals": createExecutionContextWrapper(hubspotGetDeals),
  "hubspot_action_get_tickets": createExecutionContextWrapper(hubspotGetTickets),

  // HubSpot Update actions
  "hubspot_action_update_contact": createExecutionContextWrapper(hubspotUpdateContact),
  "hubspot_action_update_company": createExecutionContextWrapper(hubspotUpdateCompany),
  "hubspot_action_update_ticket": createExecutionContextWrapper(hubspotUpdateTicket),

  // HubSpot Ticket actions
  "hubspot_action_create_ticket": createExecutionContextWrapper(hubspotCreateTicket),

  // HubSpot Engagement actions
  "hubspot_action_create_note": createExecutionContextWrapper(hubspotCreateNote),
  "hubspot_action_create_task": createExecutionContextWrapper(hubspotCreateTask),
  "hubspot_action_create_call": createExecutionContextWrapper(hubspotCreateCall),
  "hubspot_action_create_meeting": createExecutionContextWrapper(hubspotCreateMeeting),

  // Microsoft OneNote actions - wrapped to handle new calling convention
  "microsoft-onenote_action_create_page": (params: { config: any; userId: string; input: Record<string, any> }) =>
    onenoteCreatePage(params.config, params.userId, params.input),
  "microsoft-onenote_action_create_notebook": (params: { config: any; userId: string; input: Record<string, any> }) =>
    onenoteCreateNotebook(params.config, params.userId, params.input),
  "microsoft-onenote_action_create_section": (params: { config: any; userId: string; input: Record<string, any> }) =>
    onenoteCreateSection(params.config, params.userId, params.input),
  "microsoft-onenote_action_update_page": (params: { config: any; userId: string; input: Record<string, any> }) =>
    onenoteUpdatePage(params.config, params.userId, params.input),
  "microsoft-onenote_action_get_page_content": (params: { config: any; userId: string; input: Record<string, any> }) =>
    onenoteGetPageContent(params.config, params.userId, params.input),
  "microsoft-onenote_action_get_pages": (params: { config: any; userId: string; input: Record<string, any> }) =>
    onenoteGetPages(params.config, params.userId, params.input),
  "microsoft-onenote_action_copy_page": (params: { config: any; userId: string; input: Record<string, any> }) =>
    onenoteCopyPage(params.config, params.userId, params.input),
  "microsoft-onenote_action_search": (params: { config: any; userId: string; input: Record<string, any> }) =>
    onenoteSearch(params.config, params.userId, params.input),
  "microsoft-onenote_action_delete_page": (params: { config: any; userId: string; input: Record<string, any> }) =>
    onenoteDeletePage(params.config, params.userId, params.input),

  // OneDrive actions - wrapped to handle new calling convention
  "onedrive_action_upload_file": (params: { config: any; userId: string; input: Record<string, any> }) =>
    uploadFileToOneDrive(params.config, params.userId, params.input),
  "onedrive_action_get_file": createExecutionContextWrapper(getOnedriveFile),

  // Facebook actions - wrapped to handle new calling convention
  "facebook_action_create_post": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createFacebookPost(params.config, params.userId, params.input),
  "facebook_action_get_page_insights": (params: { config: any; userId: string; input: Record<string, any> }) =>
    getFacebookPageInsights(params.config, params.userId, params.input),
  "facebook_action_send_message": (params: { config: any; userId: string; input: Record<string, any> }) =>
    sendFacebookMessage(params.config, params.userId, params.input),
  "facebook_action_comment_on_post": (params: { config: any; userId: string; input: Record<string, any> }) =>
    commentOnFacebookPost(params.config, params.userId, params.input),
  "facebook_action_delete_post": (params: { config: any; userId: string; input: Record<string, any> }) =>
    deleteFacebookPost(params.config, params.userId, params.input),
  "facebook_action_update_post": (params: { config: any; userId: string; input: Record<string, any> }) =>
    updateFacebookPost(params.config, params.userId, params.input),
  "facebook_action_upload_photo": (params: { config: any; userId: string; input: Record<string, any> }) =>
    uploadFacebookPhoto(params.config, params.userId, params.input),
  "facebook_action_upload_video": (params: { config: any; userId: string; input: Record<string, any> }) =>
    uploadFacebookVideo(params.config, params.userId, params.input),

  // Dropbox actions - wrapped to handle new calling convention
  "dropbox_action_upload_file": (params: { config: any; userId: string; input: Record<string, any> }) =>
    uploadDropboxFile(params.config, { userId: params.userId, ...params.input }),
  "dropbox_action_get_file": createExecutionContextWrapper(getDropboxFile),
  "dropbox_action_find_files": createExecutionContextWrapper(findDropboxFiles),

  // Slack Get actions
  "slack_action_get_messages": createExecutionContextWrapper(getSlackMessages),

  // Trello Get actions
  "trello_action_get_cards": createExecutionContextWrapper(getTrelloCards),

  // Mailchimp actions
  "mailchimp_action_get_subscribers": createExecutionContextWrapper(mailchimpGetSubscribers),
  "mailchimp_action_add_subscriber": createExecutionContextWrapper(mailchimpAddSubscriber),
  "mailchimp_action_update_subscriber": createExecutionContextWrapper(mailchimpUpdateSubscriber),
  "mailchimp_action_remove_subscriber": createExecutionContextWrapper(mailchimpRemoveSubscriber),
  "mailchimp_action_add_tag": createExecutionContextWrapper(mailchimpAddTag),
  "mailchimp_action_remove_tag": createExecutionContextWrapper(mailchimpRemoveTag),
  "mailchimp_action_send_campaign": createExecutionContextWrapper(mailchimpSendCampaign),
  "mailchimp_action_create_campaign": createExecutionContextWrapper(mailchimpCreateCampaign),

  // Stripe actions
  "stripe_action_get_payments": createExecutionContextWrapper(stripeGetPayments),
  "stripe_action_update_customer": createExecutionContextWrapper(stripeUpdateCustomer),
  "stripe_action_create_refund": createExecutionContextWrapper(stripeCreateRefund),
  "stripe_action_cancel_subscription": createExecutionContextWrapper(stripeCancelSubscription),
  "stripe_action_update_subscription": createExecutionContextWrapper(stripeUpdateSubscription),
  "stripe_action_create_checkout_session": createExecutionContextWrapper(stripeCreateCheckoutSession),
  "stripe_action_create_payment_link": createExecutionContextWrapper(stripeCreatePaymentLink),
  "stripe_action_find_customer": createExecutionContextWrapper(stripeFindCustomer),
  "stripe_action_find_subscription": createExecutionContextWrapper(stripeFindSubscription),
  "stripe_action_find_payment_intent": createExecutionContextWrapper(stripeFindPaymentIntent),
  "stripe_action_create_product": createExecutionContextWrapper(stripeCreateProduct),
  "stripe_action_create_price": createExecutionContextWrapper(stripeCreatePrice),
  "stripe_action_update_product": createExecutionContextWrapper(stripeUpdateProduct),
  "stripe_action_list_products": createExecutionContextWrapper(stripeListProducts),
  "stripe_action_create_invoice_item": createExecutionContextWrapper(stripeCreateInvoiceItem),
  "stripe_action_finalize_invoice": createExecutionContextWrapper(stripeFinalizeInvoice),
  "stripe_action_void_invoice": createExecutionContextWrapper(stripeVoidInvoice),
  "stripe_action_update_invoice": createExecutionContextWrapper(stripeUpdateInvoice),
  "stripe_action_confirm_payment_intent": createExecutionContextWrapper(stripeConfirmPaymentIntent),
  "stripe_action_capture_payment_intent": createExecutionContextWrapper(stripeCapturePaymentIntent),
  "stripe_action_find_charge": createExecutionContextWrapper(stripeFindCharge),
  "stripe_action_find_invoice": createExecutionContextWrapper(stripeFindInvoice),

  // Shopify actions - wrapped to handle new calling convention
  "shopify_action_create_order": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createShopifyOrder(params.config, params.userId, params.input),
  "shopify_action_update_product": (params: { config: any; userId: string; input: Record<string, any> }) =>
    updateShopifyProduct(params.config, params.userId, params.input),
  "shopify_action_update_customer": (params: { config: any; userId: string; input: Record<string, any> }) =>
    updateShopifyCustomer(params.config, params.userId, params.input),
  "shopify_action_create_fulfillment": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createShopifyFulfillment(params.config, params.userId, params.input),
  "shopify_action_create_product_variant": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createShopifyProductVariant(params.config, params.userId, params.input),
  "shopify_action_update_product_variant": (params: { config: any; userId: string; input: Record<string, any> }) =>
    updateShopifyProductVariant(params.config, params.userId, params.input),

  // Twitter actions - wrapped to handle new calling convention
  "twitter_action_post_tweet": (params: { config: any; userId: string; input: Record<string, any> }) =>
    postTweetHandler(params.config, params.userId, params.input),
  "twitter_action_reply_tweet": (params: { config: any; userId: string; input: Record<string, any> }) =>
    replyTweetHandler(params.config, params.userId, params.input),
  "twitter_action_retweet": (params: { config: any; userId: string; input: Record<string, any> }) =>
    retweetHandler(params.config, params.userId, params.input),
  "twitter_action_unretweet": (params: { config: any; userId: string; input: Record<string, any> }) =>
    unretweetHandler(params.config, params.userId, params.input),
  "twitter_action_like_tweet": (params: { config: any; userId: string; input: Record<string, any> }) =>
    likeTweetHandler(params.config, params.userId, params.input),
  "twitter_action_unlike_tweet": (params: { config: any; userId: string; input: Record<string, any> }) =>
    unlikeTweetHandler(params.config, params.userId, params.input),
  "twitter_action_send_dm": (params: { config: any; userId: string; input: Record<string, any> }) =>
    sendDMHandler(params.config, params.userId, params.input),
  "twitter_action_follow_user": (params: { config: any; userId: string; input: Record<string, any> }) =>
    followUserHandler(params.config, params.userId, params.input),
  "twitter_action_unfollow_user": (params: { config: any; userId: string; input: Record<string, any> }) =>
    unfollowUserHandler(params.config, params.userId, params.input),
  "twitter_action_delete_tweet": (params: { config: any; userId: string; input: Record<string, any> }) =>
    deleteTweetHandler(params.config, params.userId, params.input),
  "twitter_action_search_tweets": (params: { config: any; userId: string; input: Record<string, any> }) =>
    searchTweetsHandler(params.config, params.userId, params.input),
  "twitter_action_get_user_timeline": (params: { config: any; userId: string; input: Record<string, any> }) =>
    getUserTimelineHandler(params.config, params.userId, params.input),
  "twitter_action_get_mentions": (params: { config: any; userId: string; input: Record<string, any> }) =>
    getMentionsHandler(params.config, params.userId, params.input),

  // Utility actions - data transformation, web scraping, search, etc.
  "transformer": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeTransformer(params.config, params.userId, params.input),
  "format_transformer": (params: { config: any; userId: string; input: Record<string, any> }) =>
    formatTransformer(params.config, params.userId, params.input),
  "utility_action_format_transformer": (params: { config: any; userId: string; input: Record<string, any> }) =>
    formatTransformer(params.config, params.userId, params.input),
  "file_upload": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeFileUpload(params.config, params.userId, params.input),
  "extract_website_data": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeExtractWebsiteData(params.config, params.userId, params.input),
  "google_search": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeGoogleSearch(params.config, params.userId, params.input),
  "tavily_search": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeTavilySearch(params.config, params.userId, params.input),

  // Workflow control actions - special handling needed for wait_for_time - wrapped to handle new calling convention
  "if_then_condition": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeIfThenCondition(params.config, params.userId, params.input),
  "delay": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeDelayAction(params.config, params.userId, params.input),

  // Logic control actions - Path, Filter, HTTP Request
  "path": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executePath({
      config: params.config,
      previousOutputs: params.input,
      trigger: params.input.trigger
    }),
  "filter": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeFilter({
      config: params.config,
      previousOutputs: params.input,
      trigger: params.input.trigger
    }),
  "http_request": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeHttpRequest({
      config: params.config,
      previousOutputs: params.input,
      trigger: params.input.trigger
    }),
  "loop": createExecutionContextWrapper(executeLoop),

  // HITL (Human-in-the-Loop) - needs execution context for pausing
  "hitl_conversation": (params: { config: any; userId: string; input: Record<string, any>; context?: any }) =>
    executeHITL(params.config, params.userId, params.input, params.input.context)
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
