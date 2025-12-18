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
import { advancedGmailSearch } from './gmail/advancedSearch'
import { fetchGmailMessage } from './gmail/fetchMessage'
import { fetchGmailTriggerEmail } from './gmail/fetchTriggerEmail'
import { markGmailAsRead } from './gmail/markAsRead'
import { markGmailAsUnread } from './gmail/markAsUnread'
import { archiveGmailEmail } from './gmail/archiveEmail'
import { deleteGmailEmail } from './gmail/deleteEmail'
import { removeGmailLabel } from './gmail/removeLabel'
import { createGmailDraft } from './gmail/createDraft'
import { createGmailDraftReply } from './gmail/createDraftReply'
import { createGmailLabel } from './gmail/createLabel'
import { replyToGmailEmail } from './gmail/replyToEmail'
import { getGmailAttachment } from './gmail/getAttachment'
import { downloadGmailAttachment } from './gmail/downloadAttachment'
import { updateGmailSignature } from './gmail/updateSignature'

// Google Sheets actions
import { readGoogleSheetsData, exportGoogleSheetsData, createGoogleSheetsRow, updateGoogleSheetsRow, deleteGoogleSheetsRow, findGoogleSheetsRow, clearGoogleSheetsRange, formatGoogleSheetsRange, batchUpdateGoogleSheets } from './googleSheets'

// Microsoft Excel actions
import {
  executeMicrosoftExcelUnifiedAction,
  createMicrosoftExcelRow,
  updateMicrosoftExcelRow,
  deleteMicrosoftExcelRow,
  exportMicrosoftExcelSheet,
  createMicrosoftExcelWorkbook,
  addMicrosoftExcelTableRow,
  createMicrosoftExcelWorksheet,
  renameMicrosoftExcelWorksheet,
  deleteMicrosoftExcelWorksheet,
  addMicrosoftExcelMultipleRows
} from './microsoft-excel'

// Google Calendar actions
import { createGoogleCalendarEvent } from './google-calendar/createEvent'
import { updateGoogleCalendarEvent } from './google-calendar/updateEvent'
import { deleteGoogleCalendarEvent } from './google-calendar/deleteEvent'
import { getGoogleCalendarEvent } from './google-calendar/getEvent'
import { listGoogleCalendarEvents } from './google-calendar/listEvents'
import { quickAddGoogleCalendarEvent } from './google-calendar/quickAddEvent'
import { addGoogleCalendarAttendees } from './google-calendar/addAttendees'
import { removeGoogleCalendarAttendees } from './google-calendar/removeAttendees'
import { moveGoogleCalendarEvent } from './google-calendar/moveEvent'
import { getGoogleCalendarFreeBusy } from './google-calendar/getFreeBusy'

// Google Drive actions
import { uploadGoogleDriveFile } from './googleDrive/uploadFile'

// Google Docs actions
import {
  createGoogleDocument,
  updateGoogleDocument,
  shareGoogleDocument,
  getGoogleDocument,
  exportGoogleDocument
} from './googleDocs'

// Google Analytics actions
import {
  sendGoogleAnalyticsEvent,
  getGoogleAnalyticsRealtimeData,
  runGoogleAnalyticsReport,
  getGoogleAnalyticsUserActivity,
  createGoogleAnalyticsMeasurementSecret,
  findGoogleAnalyticsConversion,
  createGoogleAnalyticsConversionEvent,
  runGoogleAnalyticsPivotReport
} from './google-analytics'

// Airtable actions
import {
  addAirtableAttachment,
  createAirtableRecord,
  createMultipleAirtableRecords,
  deleteAirtableRecord,
  duplicateAirtableRecord,
  findAirtableRecord,
  getAirtableBaseSchema,
  getAirtableRecord,
  getAirtableTableSchema,
  listAirtableRecords,
  moveAirtableRecord,
  updateAirtableRecord,
  updateMultipleAirtableRecords,
} from './airtable'

// Monday.com actions
import {
  createMondayItem,
  updateMondayItem,
  createMondayUpdate,
  createMondaySubitem,
  deleteMondayItem,
  archiveMondayItem,
  moveMondayItem,
  createMondayBoard,
  createMondayGroup,
  getMondayItem,
  searchMondayItems,
  listMondayItems,
  addMondayFile,
  duplicateMondayItem,
  duplicateMondayBoard,
  addMondayColumn,
  listMondayUpdates,
  downloadMondayFile,
  getMondayUser,
  listMondayUsers,
  listMondayBoards,
  getMondayBoard,
  listMondayGroups,
  listMondaySubitems
} from './monday'

// Slack actions
import { createSlackChannel, slackActionSendMessage, slackActionDeleteMessage } from './slack'

// Trello actions
import {
  createTrelloList,
  createTrelloCard,
  moveTrelloCard,
  createTrelloBoard,
  updateTrelloCard,
  archiveTrelloCard,
  addTrelloComment,
  addTrelloLabelToCard,
  addTrelloChecklist,
  createTrelloChecklistItem
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

// ManyChat actions
import {
  sendManyChatMessage,
  sendManyChatFlow,
  sendManyChatContent,
  sendManyChatDynamicMessage,
  setManyChatCustomField,
  getManyChatSubscriber,
  addManyChatTag,
  removeManyChatTag,
  subscribeManyChatSequence,
  unsubscribeManyChatSequence,
  findManyChatUser,
  findByManyChatCustomField,
  createManyChatSubscriber,
} from './manychat'

// Notion actions - existing (only keeping search for backward compatibility)
import {
  searchNotionPages,
} from './notion'

// Notion unified action handlers
import { executeNotionManageDatabase } from './notion/manageDatabase'
import { executeNotionManagePage } from './notion/managePage'
import { executeNotionManageUsers } from './notion/manageUsers'
import { executeNotionManageComments } from './notion/manageComments'
import { executeNotionManageBlocks } from './notion/manageBlocks'
import { executeNotionAdvancedQuery } from './notion/advancedQuery'
import { executeNotionGetPageProperty } from './notion/getPageProperty'
import { executeNotionUpdateDatabaseSchema } from './notion/updateDatabaseSchema'

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
  notionAddBlock,
  notionGetBlock,
  notionGetBlockChildren,
  notionGetPageWithChildren,
  notionFindOrCreateDatabaseItem,
  notionArchiveDatabaseItem,
  notionRestoreDatabaseItem,
  notionGetPageProperty,
  notionMakeApiCall,
} from './notion/handlers'

// Notion get page details action
import { notionGetPageDetails } from './notion/getPageDetails'

// Notion separate page actions
import {
  executeNotionCreatePage,
  executeNotionUpdatePage,
  executeNotionAppendToPage,
  executeNotionGetPageDetailsAction,
  executeNotionDuplicatePageAction
} from './notion/pageActions'

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
  // Phase 2 actions
  hubspotAddToWorkflow,
  hubspotRemoveFromWorkflow,
  hubspotCreateProduct,
  hubspotUpdateProduct,
  hubspotGetProducts,
  hubspotRemoveFromList,
  hubspotGetOwners,
  hubspotGetForms,
  hubspotGetDealPipelines,
  // Phase 3 actions
  hubspotCreateLineItem,
  hubspotUpdateLineItem,
  hubspotRemoveLineItem,
  hubspotGetLineItems,
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
  onenoteDeleteSection,
  onenoteDeleteNotebook,
  onenoteCreateNoteFromUrl,
  onenoteCreateQuickNote,
  onenoteCreateImageNote,
  onenoteListNotebooks,
  onenoteListSections,
  onenoteGetNotebookDetails,
  onenoteGetSectionDetails,
} from './microsoft-onenote'

// OneDrive actions
import { uploadFileToOneDrive } from './onedrive'
import { createOnedriveFolder } from './onedrive/createFolder'
import { deleteOnedriveItem } from './onedrive/deleteItem'
import { copyOnedriveItem } from './onedrive/copyItem'
import { moveOnedriveItem } from './onedrive/moveItem'
import { renameOnedriveItem } from './onedrive/renameItem'
import { createOnedriveSharingLink } from './onedrive/createSharingLink'
import { sendOnedriveSharingInvitation } from './onedrive/sendSharingInvitation'
import { searchOnedriveFiles } from './onedrive/searchFiles'
import { findOnedriveItemById } from './onedrive/findItemById'
import { listOnedriveDrives } from './onedrive/listDrives'

// Microsoft Teams actions
import {
  replyToTeamsMessage,
  editTeamsMessage,
  findTeamsMessage,
  deleteTeamsMessage,
  createTeamsGroupChat,
  getTeamsChannelDetails,
  addTeamsReaction,
  removeTeamsReaction,
  startTeamsMeeting,
  endTeamsMeeting,
  updateTeamsMeeting
} from './teams'

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
import { createShopifyProduct } from './shopify/createProduct'
import { updateShopifyProduct } from './shopify/updateProduct'
import { createShopifyCustomer } from './shopify/createCustomer'
import { updateShopifyCustomer } from './shopify/updateCustomer'
import { updateShopifyInventory } from './shopify/updateInventory'
import { updateShopifyOrderStatus } from './shopify/updateOrderStatus'
import { addShopifyOrderNote } from './shopify/addOrderNote'
import { createShopifyFulfillment } from './shopify/createFulfillment'
import { createShopifyProductVariant } from './shopify/createProductVariant'
import { updateShopifyProductVariant } from './shopify/updateProductVariant'

// Gumroad actions
import {
  getGumroadProduct,
  listGumroadProducts,
  enableGumroadProduct,
  disableGumroadProduct,
  deleteGumroadProduct,
  createGumroadVariantCategory,
  createGumroadOfferCode,
  getGumroadSalesAnalytics,
  listGumroadSales,
  markGumroadAsShipped,
  refundGumroadSale,
  getGumroadSubscriber,
  listGumroadSubscribers,
  resendGumroadReceipt,
  verifyGumroadLicense,
  enableGumroadLicense,
  disableGumroadLicense,
} from './gumroad'

// Utility actions
import {
  formatTransformer,
  executeFileUpload,
  executeExtractWebsiteData,
  executeTavilySearch,
  executeParseFile
} from './utility'

// Workflow control actions
import {
  executeIfThenCondition,
  executeWaitForTime
} from './core'
import { executeWaitForEvent } from './automation/waitForEvent'

// Logic control actions
import { executePath } from './logic/executePath'
import { executeRouter } from './logic/executeRouter'
import { executeFilter } from './logic/executeFilter' // Legacy - for backward compatibility
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
import { mailchimpCreateAudience } from './mailchimp/createAudience'
import { mailchimpCreateEvent } from './mailchimp/createEvent'
import { stripeGetPayments } from './stripe/getPayments'
import { stripeCreateCustomer } from './stripe/createCustomer'
import { stripeUpdateCustomer } from './stripe/updateCustomer'
import { stripeCreatePaymentIntent } from './stripe/createPaymentIntent'
import { stripeCreateInvoice } from './stripe/createInvoice'
import { stripeCreateSubscription } from './stripe/createSubscription'
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
  "gmail_action_advanced_search": (params: { config: any; userId: string; input: Record<string, any> }) =>
    advancedGmailSearch(params.config, params.userId, params.input),
  "gmail_action_fetch_message": (params: { config: any; userId: string; input: Record<string, any> }) =>
    fetchGmailMessage(params.config, params.userId, params.input),
  "gmail_action_mark_as_read": (params: { config: any; userId: string; input: Record<string, any> }) =>
    markGmailAsRead(params.config, params.userId, params.input),
  "gmail_action_mark_as_unread": (params: { config: any; userId: string; input: Record<string, any> }) =>
    markGmailAsUnread(params.config, params.userId, params.input),
  "gmail_action_archive_email": (params: { config: any; userId: string; input: Record<string, any> }) =>
    archiveGmailEmail(params.config, params.userId, params.input),
  "gmail_action_delete_email": (params: { config: any; userId: string; input: Record<string, any> }) =>
    deleteGmailEmail(params.config, params.userId, params.input),
  "gmail_action_remove_label": (params: { config: any; userId: string; input: Record<string, any> }) =>
    removeGmailLabel(params.config, params.userId, params.input),
  "gmail_action_create_draft": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createGmailDraft(params.config, params.userId, params.input),
  "gmail_action_create_draft_reply": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createGmailDraftReply(params.config, params.userId, params.input),
  "gmail_action_create_label": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createGmailLabel(params.config, params.userId, params.input),
  "gmail_action_reply_to_email": (params: { config: any; userId: string; input: Record<string, any> }) =>
    replyToGmailEmail(params.config, params.userId, params.input),
  "gmail_action_get_attachment": (params: { config: any; userId: string; input: Record<string, any> }) =>
    getGmailAttachment(params.config, params.userId, params.input),
  "gmail_action_download_attachment": (params: { config: any; userId: string; input: Record<string, any> }) =>
    downloadGmailAttachment(params.config, params.userId, params.input),
  "gmail_action_update_signature": (params: { config: any; userId: string; input: Record<string, any> }) =>
    updateGmailSignature(params.config, params.userId, params.input),

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
  "google_sheets_action_format_range": (params: { config: any; userId: string; input: Record<string, any> }) =>
    formatGoogleSheetsRange(params.config, params.userId, params.input),
  "google_sheets_action_batch_update": (params: { config: any; userId: string; input: Record<string, any> }) =>
    batchUpdateGoogleSheets(params.config, params.userId, params.input),
  "google_sheets_action_find_row": (params: { config: any; userId: string; input: Record<string, any> }) =>
    findGoogleSheetsRow(params.config, params.userId, params.input),
  "google-sheets_action_export_sheet": (params: { config: any; userId: string; input: Record<string, any> }) =>
    exportGoogleSheetsData(params.config, params.userId, params.input),

  // Microsoft Excel actions - wrapped to handle new calling convention
  "microsoft_excel_unified_action": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeMicrosoftExcelUnifiedAction(params.config, params.userId, params.input),
  "microsoft_excel_action_add_row": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createMicrosoftExcelRow(params.config, params.userId, params.input),
  "microsoft_excel_action_update_row": (params: { config: any; userId: string; input: Record<string, any> }) =>
    updateMicrosoftExcelRow(params.config, params.userId, params.input),
  "microsoft_excel_action_delete_row": (params: { config: any; userId: string; input: Record<string, any> }) =>
    deleteMicrosoftExcelRow(params.config, params.userId, params.input),
  "microsoft-excel_action_export_sheet": (params: { config: any; userId: string; input: Record<string, any> }) =>
    exportMicrosoftExcelSheet(params.config, params.userId, params.input),
  "microsoft_excel_action_create_workbook": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createMicrosoftExcelWorkbook(params.config, params.userId, params.input),
  "microsoft_excel_action_add_table_row": (params: { config: any; userId: string; input: Record<string, any> }) =>
    addMicrosoftExcelTableRow(params.config, { userId: params.userId }),
  "microsoft_excel_action_create_worksheet": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createMicrosoftExcelWorksheet(params.config, { userId: params.userId }),
  "microsoft_excel_action_rename_worksheet": (params: { config: any; userId: string; input: Record<string, any> }) =>
    renameMicrosoftExcelWorksheet(params.config, { userId: params.userId }),
  "microsoft_excel_action_delete_worksheet": (params: { config: any; userId: string; input: Record<string, any> }) =>
    deleteMicrosoftExcelWorksheet(params.config, { userId: params.userId }),
  "microsoft_excel_action_add_multiple_rows": (params: { config: any; userId: string; input: Record<string, any> }) =>
    addMicrosoftExcelMultipleRows(params.config, params.userId, params.input),

  // Google Calendar actions - wrapped to handle new calling convention
  "google_calendar_action_create_event": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createGoogleCalendarEvent(params.config, params.userId, params.input),
  "google_calendar_action_update_event": (params: { config: any; userId: string; input: Record<string, any> }) =>
    updateGoogleCalendarEvent(params.config, params.userId, params.input),
  "google_calendar_action_delete_event": (params: { config: any; userId: string; input: Record<string, any> }) =>
    deleteGoogleCalendarEvent(params.config, params.userId, params.input),
  "google_calendar_action_get_event": (params: { config: any; userId: string; input: Record<string, any> }) =>
    getGoogleCalendarEvent(params.config, params.userId, params.input),
  "google_calendar_action_list_events": (params: { config: any; userId: string; input: Record<string, any> }) =>
    listGoogleCalendarEvents(params.config, params.userId, params.input),
  "google_calendar_action_quick_add_event": (params: { config: any; userId: string; input: Record<string, any> }) =>
    quickAddGoogleCalendarEvent(params.config, params.userId, params.input),
  "google_calendar_action_add_attendees": (params: { config: any; userId: string; input: Record<string, any> }) =>
    addGoogleCalendarAttendees(params.config, params.userId, params.input),
  "google_calendar_action_remove_attendees": (params: { config: any; userId: string; input: Record<string, any> }) =>
    removeGoogleCalendarAttendees(params.config, params.userId, params.input),
  "google_calendar_action_move_event": (params: { config: any; userId: string; input: Record<string, any> }) =>
    moveGoogleCalendarEvent(params.config, params.userId, params.input),
  "google_calendar_action_get_free_busy": (params: { config: any; userId: string; input: Record<string, any> }) =>
    getGoogleCalendarFreeBusy(params.config, params.userId, params.input),

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
  "google_docs_action_export_document": (params: { config: any; userId: string; input: Record<string, any> }) =>
    exportGoogleDocument(params.config, params.userId, params.input),

  // Google Analytics actions - wrapped with ExecutionContext pattern
  "google_analytics_action_send_event": createExecutionContextWrapper(sendGoogleAnalyticsEvent),
  "google_analytics_action_get_realtime_data": createExecutionContextWrapper(getGoogleAnalyticsRealtimeData),
  "google_analytics_action_run_report": createExecutionContextWrapper(runGoogleAnalyticsReport),
  "google_analytics_action_get_user_activity": createExecutionContextWrapper(getGoogleAnalyticsUserActivity),
  "google_analytics_action_create_measurement_secret": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createGoogleAnalyticsMeasurementSecret(params.config, params.userId, params.input),
  "google_analytics_action_find_conversion": (params: { config: any; userId: string; input: Record<string, any> }) =>
    findGoogleAnalyticsConversion(params.config, params.userId, params.input),
  "google_analytics_action_create_conversion_event": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createGoogleAnalyticsConversionEvent(params.config, params.userId, params.input),
  "google_analytics_action_run_pivot_report": createExecutionContextWrapper(runGoogleAnalyticsPivotReport),

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
  "airtable_action_get_record": (params: { config: any; userId: string; input: Record<string, any> }) =>
    getAirtableRecord(params.config, params.userId, params.input),
  "airtable_action_create_multiple_records": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createMultipleAirtableRecords(params.config, params.userId, params.input),
  "airtable_action_update_multiple_records": (params: { config: any; userId: string; input: Record<string, any> }) =>
    updateMultipleAirtableRecords(params.config, params.userId, params.input),

  // Monday.com actions - wrapped to handle new calling convention
  // CRUD Operations
  "monday_action_create_item": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createMondayItem(params.config, params.userId, params.input),
  "monday_action_update_item": (params: { config: any; userId: string; input: Record<string, any> }) =>
    updateMondayItem(params.config, params.userId, params.input),
  "monday_action_create_update": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createMondayUpdate(params.config, params.userId, params.input),
  "monday_action_create_subitem": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createMondaySubitem(params.config, params.userId, params.input),
  "monday_action_delete_item": (params: { config: any; userId: string; input: Record<string, any> }) =>
    deleteMondayItem(params.config, params.userId, params.input),
  "monday_action_archive_item": (params: { config: any; userId: string; input: Record<string, any> }) =>
    archiveMondayItem(params.config, params.userId, params.input),
  "monday_action_move_item": (params: { config: any; userId: string; input: Record<string, any> }) =>
    moveMondayItem(params.config, params.userId, params.input),
  "monday_action_duplicate_item": (params: { config: any; userId: string; input: Record<string, any> }) =>
    duplicateMondayItem(params.config, params.userId, params.input),

  // Board & Group Management
  "monday_action_create_board": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createMondayBoard(params.config, params.userId, params.input),
  "monday_action_create_group": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createMondayGroup(params.config, params.userId, params.input),
  "monday_action_duplicate_board": (params: { config: any; userId: string; input: Record<string, any> }) =>
    duplicateMondayBoard(params.config, params.userId, params.input),
  "monday_action_add_column": (params: { config: any; userId: string; input: Record<string, any> }) =>
    addMondayColumn(params.config, params.userId, params.input),

  // Search & Retrieval
  "monday_action_get_item": (params: { config: any; userId: string; input: Record<string, any> }) =>
    getMondayItem(params.config, params.userId, params.input),
  "monday_action_search_items": (params: { config: any; userId: string; input: Record<string, any> }) =>
    searchMondayItems(params.config, params.userId, params.input),
  "monday_action_list_items": (params: { config: any; userId: string; input: Record<string, any> }) =>
    listMondayItems(params.config, params.userId, params.input),
  "monday_action_list_subitems": (params: { config: any; userId: string; input: Record<string, any> }) =>
    listMondaySubitems(params.config, params.userId, params.input),
  "monday_action_list_updates": (params: { config: any; userId: string; input: Record<string, any> }) =>
    listMondayUpdates(params.config, params.userId, params.input),
  "monday_action_get_board": (params: { config: any; userId: string; input: Record<string, any> }) =>
    getMondayBoard(params.config, params.userId, params.input),
  "monday_action_list_boards": (params: { config: any; userId: string; input: Record<string, any> }) =>
    listMondayBoards(params.config, params.userId, params.input),
  "monday_action_list_groups": (params: { config: any; userId: string; input: Record<string, any> }) =>
    listMondayGroups(params.config, params.userId, params.input),
  "monday_action_get_user": (params: { config: any; userId: string; input: Record<string, any> }) =>
    getMondayUser(params.config, params.userId, params.input),
  "monday_action_list_users": (params: { config: any; userId: string; input: Record<string, any> }) =>
    listMondayUsers(params.config, params.userId, params.input),

  // File Operations
  "monday_action_add_file": (params: { config: any; userId: string; input: Record<string, any> }) =>
    addMondayFile(params.config, params.userId, params.input),
  "monday_action_download_file": (params: { config: any; userId: string; input: Record<string, any> }) =>
    downloadMondayFile(params.config, params.userId, params.input),

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
  "trello_action_create_board": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createTrelloBoard(params.config, params.userId, params.input),
  "trello_action_update_card": (params: { config: any; userId: string; input: Record<string, any> }) =>
    updateTrelloCard(params.config, params.userId, params.input),
  "trello_action_archive_card": (params: { config: any; userId: string; input: Record<string, any> }) =>
    archiveTrelloCard(params.config, params.userId, params.input),
  "trello_action_add_comment": (params: { config: any; userId: string; input: Record<string, any> }) =>
    addTrelloComment(params.config, params.userId, params.input),
  "trello_action_add_label_to_card": (params: { config: any; userId: string; input: Record<string, any> }) =>
    addTrelloLabelToCard(params.config, params.userId, params.input),
  "trello_action_add_checklist": (params: { config: any; userId: string; input: Record<string, any> }) =>
    addTrelloChecklist(params.config, params.userId, params.input),
  "trello_action_create_checklist_item": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createTrelloChecklistItem(params.config, params.userId, params.input),

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

  // ManyChat actions - wrapped to handle new calling convention
  "manychat_action_send_message": (params: { config: any; userId: string; input: Record<string, any> }) =>
    sendManyChatMessage(params.config, params.userId, params.input),
  "manychat_action_send_flow": (params: { config: any; userId: string; input: Record<string, any> }) =>
    sendManyChatFlow(params.config, params.userId, params.input),
  "manychat_action_set_custom_field": (params: { config: any; userId: string; input: Record<string, any> }) =>
    setManyChatCustomField(params.config, params.userId, params.input),
  "manychat_action_get_subscriber": (params: { config: any; userId: string; input: Record<string, any> }) =>
    getManyChatSubscriber(params.config, params.userId, params.input),
  "manychat_action_tag_subscriber": (params: { config: any; userId: string; input: Record<string, any> }) =>
    addManyChatTag(params.config, params.userId, params.input),
  "manychat_action_remove_tag": (params: { config: any; userId: string; input: Record<string, any> }) =>
    removeManyChatTag(params.config, params.userId, params.input),
  "manychat_action_subscribe_sequence": (params: { config: any; userId: string; input: Record<string, any> }) =>
    subscribeManyChatSequence(params.config, params.userId, params.input),
  "manychat_action_unsubscribe_sequence": (params: { config: any; userId: string; input: Record<string, any> }) =>
    unsubscribeManyChatSequence(params.config, params.userId, params.input),
  "manychat_action_find_user": (params: { config: any; userId: string; input: Record<string, any> }) =>
    findManyChatUser(params.config, params.userId, params.input),
  "manychat_action_find_by_custom_field": (params: { config: any; userId: string; input: Record<string, any> }) =>
    findByManyChatCustomField(params.config, params.userId, params.input),
  "manychat_action_create_subscriber": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createManyChatSubscriber(params.config, params.userId, params.input),
  "manychat_action_send_content": (params: { config: any; userId: string; input: Record<string, any> }) =>
    sendManyChatContent(params.config, params.userId, params.input),
  "manychat_action_send_dynamic_message": (params: { config: any; userId: string; input: Record<string, any> }) =>
    sendManyChatDynamicMessage(params.config, params.userId, params.input),

  // Notion actions - search kept for backward compatibility
  "notion_action_search_pages": (params: { config: any; userId: string; input: Record<string, any> }) =>
    searchNotionPages(params.config, params.userId, params.input),

  // Notion separate page actions - each operation is now its own action
  "notion_action_create_page": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeNotionCreatePage(params.config, params.userId, params.input),
  "notion_action_update_page": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeNotionUpdatePage(params.config, params.userId, params.input),
  "notion_action_append_to_page": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeNotionAppendToPage(params.config, params.userId, params.input),

  // Notion unified actions (primary handlers) - wrapped to handle new calling convention
  // DEPRECATED: notion_action_manage_page - replaced by separate actions above
  "notion_action_manage_page": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeNotionManagePage(params.config, params.userId, params.input),
  "notion_action_manage_database": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeNotionManageDatabase(params.config, params.userId, params.input),
  "notion_action_manage_users": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeNotionManageUsers(params.config, params.userId, params.input),
  "notion_action_manage_comments": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeNotionManageComments(params.config, params.userId, params.input),
  "notion_action_manage_blocks": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeNotionManageBlocks(params.config, params.userId, params.input),
  "notion_action_advanced_query": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeNotionAdvancedQuery(params.config, params.userId, params.input),
  "notion_action_get_page_property": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeNotionGetPageProperty(params.config, params.userId, params.input),
  "notion_action_update_database_schema": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeNotionUpdateDatabaseSchema(params.config, params.userId, params.input),

  // Notion actions - comprehensive API v2 actions - wrapped with ExecutionContext pattern
  // Note: All handlers in handlers.ts expect (config, context: ExecutionContext)
  // "notion_action_retrieve_page": Removed - using notion_action_get_page_details instead
  // "notion_action_archive_page": Removed - use notion_action_archive_database_item instead
  "notion_action_query_database": createExecutionContextWrapper(notionQueryDatabase),
  "notion_action_update_database": createExecutionContextWrapper(notionUpdateDatabase),
  "notion_action_append_blocks": createExecutionContextWrapper(notionAppendBlocks),
  "notion_action_update_block": createExecutionContextWrapper(notionUpdateBlock),
  "notion_action_delete_block": createExecutionContextWrapper(notionDeleteBlock),
  "notion_action_retrieve_block_children": createExecutionContextWrapper(notionRetrieveBlockChildren),
  "notion_action_list_users": createExecutionContextWrapper(notionListUsers),
  "notion_action_retrieve_user": createExecutionContextWrapper(notionRetrieveUser),
  "notion_action_create_comment": createExecutionContextWrapper((config: any, context: any) =>
    notionCreateComment({
      ...config,
      // Map UI field names to handler expected fields
      page_id: config.page || config.page_id,
      rich_text: config.commentText || config.rich_text,
      parent_type: config.commentTarget || config.parent_type || 'page',
      discussion_id: config.discussionId || config.discussion_id,
    }, context)),
  "notion_action_retrieve_comments": createExecutionContextWrapper((config: any, context: any) =>
    notionRetrieveComments({
      ...config,
      // Map UI field names to handler expected fields
      block_id: config.page || config.blockId || config.block_id,
    }, context)),
  "notion_action_search": createExecutionContextWrapper(notionSearch),
  "notion_action_duplicate_page": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeNotionDuplicatePageAction(params.config, params.userId, params.input),
  "notion_action_sync_database_entries": createExecutionContextWrapper(notionSyncDatabaseEntries),
  "notion_action_get_page_details": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeNotionGetPageDetailsAction(params.config, params.userId, params.input),

  // Notion Append Page Content action (new schema)
  "notion_action_append_page_content": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeNotionAppendToPage({
      ...params.config,
      page: params.config.pageId || params.config.page, // Map pageId to page
    }, params.userId, params.input),

  // Notion Block actions
  "notion_action_add_block": createExecutionContextWrapper(notionAddBlock),
  "notion_action_get_block": createExecutionContextWrapper(notionGetBlock),
  "notion_action_get_block_children": createExecutionContextWrapper(notionGetBlockChildren),
  "notion_action_get_page_with_children": createExecutionContextWrapper((config: any, context: any) =>
    notionGetPageWithChildren({
      ...config,
      page_id: config.page || config.page_id,
    }, context)),

  // Notion Database actions (new separate actions)
  "notion_action_create_database": createExecutionContextWrapper((config: any, context: any) =>
    notionCreateDatabase({
      ...config,
      // Map UI field names to handler expected fields
      parent_type: "page",
      parent_page_id: config.parentPage || config.parent_page_id,
      is_inline: config.databaseType === "Inline" ? "true" : "false",
      properties_config: config.properties || config.properties_config || {
        // Default Name/Title property if none specified
        "Name": { title: {} }
      }
    }, context)),
  "notion_action_update_database_info": createExecutionContextWrapper(notionUpdateDatabase),
  "notion_action_find_or_create_item": createExecutionContextWrapper((config: any, context: any) =>
    notionFindOrCreateDatabaseItem({
      ...config,
      database_id: config.database || config.database_id,
      search_property: config.searchProperty || config.search_property,
      search_value: config.searchValue || config.search_value,
      create_if_not_found: config.createIfNotFound || config.create_if_not_found,
      create_properties: config.createProperties || config.create_properties,
    }, context)),
  "notion_action_archive_database_item": createExecutionContextWrapper((config: any, context: any) =>
    notionArchiveDatabaseItem({
      ...config,
      item_id: config.itemToArchive || config.item_id, // Map itemToArchive to item_id
    }, context)),
  "notion_action_restore_database_item": createExecutionContextWrapper((config: any, context: any) =>
    notionRestoreDatabaseItem({
      ...config,
      item_id: config.itemToRestore || config.item_id, // Map itemToRestore to item_id
    }, context)),

  // Notion User actions aliases
  "notion_action_get_user": createExecutionContextWrapper((config: any, context: any) =>
    notionRetrieveUser({
      ...config,
      user_id: config.userId || config.user_id, // Map userId to user_id
    }, context)),

  // Notion Comment actions aliases
  "notion_action_list_comments": createExecutionContextWrapper((config: any, context: any) =>
    notionRetrieveComments({
      ...config,
      // Map UI field names to handler expected fields (listTarget determines source)
      block_id: config.listTarget === 'block'
        ? (config.blockIdForList || config.blockId || config.block_id)
        : (config.pageForList || config.page || config.block_id),
    }, context)),

  // Notion Page Content actions (new schema actions)
  "notion_action_get_page_content": createExecutionContextWrapper((config: any, context: any) =>
    notionRetrieveBlockChildren({
      ...config,
      block_id: config.pageId || config.page || config.block_id,
    }, context)),
  "notion_action_list_page_content": createExecutionContextWrapper((config: any, context: any) =>
    notionRetrieveBlockChildren({
      ...config,
      block_id: config.pageId || config.page || config.block_id,
    }, context)),
  "notion_action_update_page_content": createExecutionContextWrapper((config: any, context: any) =>
    notionUpdateBlock({
      ...config,
      block_id: config.blockId || config.block || config.block_id,
    }, context)),
  "notion_action_delete_page_content": createExecutionContextWrapper((config: any, context: any) =>
    notionDeleteBlock({
      ...config,
      block_id: config.blockId || config.block || config.block_id,
    }, context)),

  // Notion Make API Call action (this one already expects userId, input pattern)
  "notion_action_api_call": (params: { config: any; userId: string; input: Record<string, any> }) =>
    notionMakeApiCall(params.config, params.userId, params.input),

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

  // Microsoft Teams actions - wrapped to handle new calling convention
  "teams_action_reply_to_message": (params: { config: any; userId: string; input: Record<string, any> }) =>
    replyToTeamsMessage(params.config, params.userId, params.input),
  "teams_action_edit_message": (params: { config: any; userId: string; input: Record<string, any> }) =>
    editTeamsMessage(params.config, params.userId, params.input),
  "teams_action_find_message": (params: { config: any; userId: string; input: Record<string, any> }) =>
    findTeamsMessage(params.config, params.userId, params.input),
  "teams_action_delete_message": (params: { config: any; userId: string; input: Record<string, any> }) =>
    deleteTeamsMessage(params.config, params.userId, params.input),
  "teams_action_create_group_chat": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createTeamsGroupChat(params.config, params.userId, params.input),
  "teams_action_get_channel_details": (params: { config: any; userId: string; input: Record<string, any> }) =>
    getTeamsChannelDetails(params.config, params.userId, params.input),
  "teams_action_add_reaction": (params: { config: any; userId: string; input: Record<string, any> }) =>
    addTeamsReaction(params.config, params.userId, params.input),
  "teams_action_remove_reaction": (params: { config: any; userId: string; input: Record<string, any> }) =>
    removeTeamsReaction(params.config, params.userId, params.input),
  "teams_action_start_meeting": (params: { config: any; userId: string; input: Record<string, any> }) =>
    startTeamsMeeting(params.config, params.userId, params.input),
  "teams_action_end_meeting": (params: { config: any; userId: string; input: Record<string, any> }) =>
    endTeamsMeeting(params.config, params.userId, params.input),
  "teams_action_update_meeting": (params: { config: any; userId: string; input: Record<string, any> }) =>
    updateTeamsMeeting(params.config, params.userId, params.input),

  // HubSpot actions - wrapped to handle new calling convention
  "hubspot_action_create_contact": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createHubSpotContact(params.config, params.userId, params.input),
  "hubspot_action_create_contact_dynamic": (params: { config: any; userId: string; input: Record<string, any> }) =>
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

  // HubSpot Phase 2: Workflow Management
  "hubspot_action_add_to_workflow": createExecutionContextWrapper(hubspotAddToWorkflow),
  "hubspot_action_remove_from_workflow": createExecutionContextWrapper(hubspotRemoveFromWorkflow),

  // HubSpot Phase 2: Product Management
  "hubspot_action_create_product": createExecutionContextWrapper(hubspotCreateProduct),
  "hubspot_action_update_product": createExecutionContextWrapper(hubspotUpdateProduct),
  "hubspot_action_get_products": createExecutionContextWrapper(hubspotGetProducts),

  // HubSpot Phase 2: List Management
  "hubspot_action_remove_from_list": createExecutionContextWrapper(hubspotRemoveFromList),

  // HubSpot Phase 2: Utility Actions
  "hubspot_action_get_owners": createExecutionContextWrapper(hubspotGetOwners),
  "hubspot_action_get_forms": createExecutionContextWrapper(hubspotGetForms),
  "hubspot_action_get_deal_pipelines": createExecutionContextWrapper(hubspotGetDealPipelines),

  // HubSpot Phase 3: Line Items
  "hubspot_action_create_line_item": createExecutionContextWrapper(hubspotCreateLineItem),
  "hubspot_action_update_line_item": createExecutionContextWrapper(hubspotUpdateLineItem),
  "hubspot_action_remove_line_item": createExecutionContextWrapper(hubspotRemoveLineItem),
  "hubspot_action_get_line_items": createExecutionContextWrapper(hubspotGetLineItems),

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

  // New OneNote actions
  "microsoft-onenote_action_delete_section": (params: { config: any; userId: string; input: Record<string, any> }) =>
    onenoteDeleteSection(params.config, params.userId, params.input),
  "microsoft-onenote_action_delete_notebook": (params: { config: any; userId: string; input: Record<string, any> }) =>
    onenoteDeleteNotebook(params.config, params.userId, params.input),
  "microsoft-onenote_action_create_note_from_url": (params: { config: any; userId: string; input: Record<string, any> }) =>
    onenoteCreateNoteFromUrl(params.config, params.userId, params.input),
  "microsoft-onenote_action_create_quick_note": (params: { config: any; userId: string; input: Record<string, any> }) =>
    onenoteCreateQuickNote(params.config, params.userId, params.input),
  "microsoft-onenote_action_create_image_note": (params: { config: any; userId: string; input: Record<string, any> }) =>
    onenoteCreateImageNote(params.config, params.userId, params.input),
  "microsoft-onenote_action_list_notebooks": (params: { config: any; userId: string; input: Record<string, any> }) =>
    onenoteListNotebooks(params.config, params.userId, params.input),
  "microsoft-onenote_action_list_sections": (params: { config: any; userId: string; input: Record<string, any> }) =>
    onenoteListSections(params.config, params.userId, params.input),
  "microsoft-onenote_action_get_notebook_details": (params: { config: any; userId: string; input: Record<string, any> }) =>
    onenoteGetNotebookDetails(params.config, params.userId, params.input),
  "microsoft-onenote_action_get_section_details": (params: { config: any; userId: string; input: Record<string, any> }) =>
    onenoteGetSectionDetails(params.config, params.userId, params.input),

  // OneDrive actions - wrapped to handle new calling convention
  "onedrive_action_upload_file": (params: { config: any; userId: string; input: Record<string, any> }) =>
    uploadFileToOneDrive(params.config, params.userId, params.input),
  "onedrive_action_get_file": createExecutionContextWrapper(getOnedriveFile),
  "onedrive_action_create_folder": createExecutionContextWrapper(createOnedriveFolder),
  "onedrive_action_delete_item": createExecutionContextWrapper(deleteOnedriveItem),
  "onedrive_action_copy_item": createExecutionContextWrapper(copyOnedriveItem),
  "onedrive_action_move_item": createExecutionContextWrapper(moveOnedriveItem),
  "onedrive_action_rename_item": createExecutionContextWrapper(renameOnedriveItem),
  "onedrive_action_create_sharing_link": createExecutionContextWrapper(createOnedriveSharingLink),
  "onedrive_action_send_sharing_invitation": createExecutionContextWrapper(sendOnedriveSharingInvitation),
  "onedrive_action_search_files": createExecutionContextWrapper(searchOnedriveFiles),
  "onedrive_action_find_item_by_id": createExecutionContextWrapper(findOnedriveItemById),
  "onedrive_action_list_drives": createExecutionContextWrapper(listOnedriveDrives),

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
  "mailchimp_action_create_audience": createExecutionContextWrapper(mailchimpCreateAudience),
  "mailchimp_action_create_event": createExecutionContextWrapper(mailchimpCreateEvent),

  // Stripe actions
  "stripe_action_create_customer": createExecutionContextWrapper(stripeCreateCustomer),
  "stripe_action_update_customer": createExecutionContextWrapper(stripeUpdateCustomer),
  "stripe_action_create_payment_intent": createExecutionContextWrapper(stripeCreatePaymentIntent),
  "stripe_action_create_invoice": createExecutionContextWrapper(stripeCreateInvoice),
  "stripe_action_create_subscription": createExecutionContextWrapper(stripeCreateSubscription),
  "stripe_action_get_payments": createExecutionContextWrapper(stripeGetPayments),
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
  "shopify_action_create_product": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createShopifyProduct(params.config, params.userId, params.input),
  "shopify_action_update_product": (params: { config: any; userId: string; input: Record<string, any> }) =>
    updateShopifyProduct(params.config, params.userId, params.input),
  "shopify_action_create_customer": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createShopifyCustomer(params.config, params.userId, params.input),
  "shopify_action_update_customer": (params: { config: any; userId: string; input: Record<string, any> }) =>
    updateShopifyCustomer(params.config, params.userId, params.input),
  "shopify_action_update_inventory": (params: { config: any; userId: string; input: Record<string, any> }) =>
    updateShopifyInventory(params.config, params.userId, params.input),
  "shopify_action_update_order_status": (params: { config: any; userId: string; input: Record<string, any> }) =>
    updateShopifyOrderStatus(params.config, params.userId, params.input),
  "shopify_action_add_order_note": (params: { config: any; userId: string; input: Record<string, any> }) =>
    addShopifyOrderNote(params.config, params.userId, params.input),
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

  // Gumroad actions - wrapped to handle new calling convention
  "gumroad_action_get_product": (params: { config: any; userId: string; input: Record<string, any> }) =>
    getGumroadProduct(params.config, params.userId, params.input),
  "gumroad_action_list_products": (params: { config: any; userId: string; input: Record<string, any> }) =>
    listGumroadProducts(params.config, params.userId, params.input),
  "gumroad_action_enable_product": (params: { config: any; userId: string; input: Record<string, any> }) =>
    enableGumroadProduct(params.config, params.userId, params.input),
  "gumroad_action_disable_product": (params: { config: any; userId: string; input: Record<string, any> }) =>
    disableGumroadProduct(params.config, params.userId, params.input),
  "gumroad_action_delete_product": (params: { config: any; userId: string; input: Record<string, any> }) =>
    deleteGumroadProduct(params.config, params.userId, params.input),
  "gumroad_action_create_variant_category": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createGumroadVariantCategory(params.config, params.userId, params.input),
  "gumroad_action_create_offer_code": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createGumroadOfferCode(params.config, params.userId, params.input),
  "gumroad_action_get_sales_analytics": (params: { config: any; userId: string; input: Record<string, any> }) =>
    getGumroadSalesAnalytics(params.config, params.userId, params.input),
  "gumroad_action_list_sales": (params: { config: any; userId: string; input: Record<string, any> }) =>
    listGumroadSales(params.config, params.userId, params.input),
  "gumroad_action_mark_as_shipped": (params: { config: any; userId: string; input: Record<string, any> }) =>
    markGumroadAsShipped(params.config, params.userId, params.input),
  "gumroad_action_refund_sale": (params: { config: any; userId: string; input: Record<string, any> }) =>
    refundGumroadSale(params.config, params.userId, params.input),
  "gumroad_action_get_subscriber": (params: { config: any; userId: string; input: Record<string, any> }) =>
    getGumroadSubscriber(params.config, params.userId, params.input),
  "gumroad_action_list_subscribers": (params: { config: any; userId: string; input: Record<string, any> }) =>
    listGumroadSubscribers(params.config, params.userId, params.input),
  "gumroad_action_resend_receipt": (params: { config: any; userId: string; input: Record<string, any> }) =>
    resendGumroadReceipt(params.config, params.userId, params.input),
  "gumroad_action_verify_license": (params: { config: any; userId: string; input: Record<string, any> }) =>
    verifyGumroadLicense(params.config, params.userId, params.input),
  "gumroad_action_enable_license": (params: { config: any; userId: string; input: Record<string, any> }) =>
    enableGumroadLicense(params.config, params.userId, params.input),
  "gumroad_action_disable_license": (params: { config: any; userId: string; input: Record<string, any> }) =>
    disableGumroadLicense(params.config, params.userId, params.input),

  // Utility actions - data transformation, web scraping, search, etc.
  "format_transformer": (params: { config: any; userId: string; input: Record<string, any> }) =>
    formatTransformer(params.config, params.userId, params.input),
  "utility_action_format_transformer": (params: { config: any; userId: string; input: Record<string, any> }) =>
    formatTransformer(params.config, params.userId, params.input),
  "file_upload": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeFileUpload(params.config, params.userId, params.input),
  "extract_website_data": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeExtractWebsiteData(params.config, params.userId, params.input),
  "tavily_search": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeTavilySearch(params.config, params.userId, params.input),
  "parse_file": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeParseFile(params.config, params.userId, params.input),

  // Workflow control actions - special handling needed for wait_for_time - wrapped to handle new calling convention
  "if_then_condition": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeIfThenCondition(params.config, params.userId, params.input),
  "delay": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeDelayAction(params.config, params.userId, params.input),

  // Logic control actions - Path, Router (filter + multi-path), HTTP Request
  "path": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executePath({
      config: params.config,
      previousOutputs: params.input,
      trigger: params.input.trigger
    }),
  "router": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeRouter({
      config: params.config,
      previousOutputs: params.input,
      trigger: params.input.trigger
    }),
  "filter": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeFilter({
      config: params.config,
      previousOutputs: params.input,
      trigger: params.input.trigger
    }),  // Legacy - backward compatibility
  "path_condition": (params: { config: any; userId: string; input: Record<string, any> }) =>
    executeFilter({
      config: params.config,
      previousOutputs: params.input,
      trigger: params.input.trigger
    }),  // Legacy - backward compatibility
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

/**
 * Special handler for wait_for_event that needs workflow and execution context
 */
export function getWaitForEventHandler(workflowId: string, nodeId: string, executionId?: string) {
  return (cfg: any, uid: string, inp: any, context?: any) =>
    executeWaitForEvent(cfg, uid, inp, {
      workflowId,
      nodeId,
      executionId: executionId || context?.executionId,
      allPreviousData: context?.allPreviousData
    })
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
