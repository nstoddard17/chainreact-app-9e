import { createRecord as airtableCreateRecord } from "@/integrations/airtable/actions/createRecord";
import { deleteRecord as airtableDeleteRecord } from "@/integrations/airtable/actions/deleteRecord";
import { findRecord as airtableFindRecord } from "@/integrations/airtable/actions/findRecord";
import { getBaseSchema as airtableGetBaseSchema } from "@/integrations/airtable/actions/getBaseSchema";
import { getRecord as airtableGetRecord } from "@/integrations/airtable/actions/getRecord";
import { getTableSchema as airtableGetTableSchema } from "@/integrations/airtable/actions/getTableSchema";
import { listRecords as airtableListRecords } from "@/integrations/airtable/actions/listRecords";
import { updateRecord as airtableUpdateRecord } from "@/integrations/airtable/actions/updateRecord";
import { addComment as githubAddComment } from "@/integrations/github/actions/addComment";
import { createBranch as githubCreateBranch } from "@/integrations/github/actions/createBranch";
import { createGist as githubCreateGist } from "@/integrations/github/actions/createGist";
import { createIssue as githubCreateIssue } from "@/integrations/github/actions/createIssue";
import { createPullRequest as githubCreatePullRequest } from "@/integrations/github/actions/createPullRequest";
import { createRepository as githubCreateRepository } from "@/integrations/github/actions/createRepository";
import { sendEmail } from "@/integrations/gmail/actions/sendEmail";
import { addAttendees } from "@/integrations/google-calendar/actions/addAttendees";
import { createEvent } from "@/integrations/google-calendar/actions/createEvent";
import { deleteEvent } from "@/integrations/google-calendar/actions/deleteEvent";
import { listEvents } from "@/integrations/google-calendar/actions/listEvents";
import { updateEvent } from "@/integrations/google-calendar/actions/updateEvent";
import { createFolder } from "@/integrations/google-drive/actions/createFolder";
import { deleteFile } from "@/integrations/google-drive/actions/deleteFile";
import { listFiles } from "@/integrations/google-drive/actions/listFiles";
import { moveFile } from "@/integrations/google-drive/actions/moveFile";
import { uploadFile } from "@/integrations/google-drive/actions/uploadFile";
import { appendRow } from "@/integrations/google-sheets/actions/appendRow";
import { clearRange } from "@/integrations/google-sheets/actions/clearRange";
import { getSheetMetadata } from "@/integrations/google-sheets/actions/getSheetMetadata";
import { readRows } from "@/integrations/google-sheets/actions/readRows";
import { updateRow } from "@/integrations/google-sheets/actions/updateRow";
import { addContactToList as hubspotAddContactToList } from "@/integrations/hubspot/actions/addContactToList";
import { createCall as hubspotCreateCall } from "@/integrations/hubspot/actions/createCall";
import { createCompany as hubspotCreateCompany } from "@/integrations/hubspot/actions/createCompany";
import { createContact as hubspotCreateContact } from "@/integrations/hubspot/actions/createContact";
import { createDeal as hubspotCreateDeal } from "@/integrations/hubspot/actions/createDeal";
import { createLineItem as hubspotCreateLineItem } from "@/integrations/hubspot/actions/createLineItem";
import { createMeeting as hubspotCreateMeeting } from "@/integrations/hubspot/actions/createMeeting";
import { createNote as hubspotCreateNote } from "@/integrations/hubspot/actions/createNote";
import { createProduct as hubspotCreateProduct } from "@/integrations/hubspot/actions/createProduct";
import { createTask as hubspotCreateTask } from "@/integrations/hubspot/actions/createTask";
import { createTicket as hubspotCreateTicket } from "@/integrations/hubspot/actions/createTicket";
import { getCompanies as hubspotGetCompanies } from "@/integrations/hubspot/actions/getCompanies";
import { getContacts as hubspotGetContacts } from "@/integrations/hubspot/actions/getContacts";
import { getDeals as hubspotGetDeals } from "@/integrations/hubspot/actions/getDeals";
import { getOwners as hubspotGetOwners } from "@/integrations/hubspot/actions/getOwners";
import { getTickets as hubspotGetTickets } from "@/integrations/hubspot/actions/getTickets";
import { updateCompany as hubspotUpdateCompany } from "@/integrations/hubspot/actions/updateCompany";
import { updateContact as hubspotUpdateContact } from "@/integrations/hubspot/actions/updateContact";
import { updateDeal as hubspotUpdateDeal } from "@/integrations/hubspot/actions/updateDeal";
import { updateLineItem as hubspotUpdateLineItem } from "@/integrations/hubspot/actions/updateLineItem";
import { updateProduct as hubspotUpdateProduct } from "@/integrations/hubspot/actions/updateProduct";
import { updateTicket as hubspotUpdateTicket } from "@/integrations/hubspot/actions/updateTicket";
import { addNote as mailchimpAddNote } from "@/integrations/mailchimp/actions/addNote";
import { addSubscriber as mailchimpAddSubscriber } from "@/integrations/mailchimp/actions/addSubscriber";
import { addTag as mailchimpAddTag } from "@/integrations/mailchimp/actions/addTag";
import { createAudience as mailchimpCreateAudience } from "@/integrations/mailchimp/actions/createAudience";
import { createCustomEvent as mailchimpCreateCustomEvent } from "@/integrations/mailchimp/actions/createCustomEvent";
import { createSegment as mailchimpCreateSegment } from "@/integrations/mailchimp/actions/createSegment";
import { getSubscriber as mailchimpGetSubscriber } from "@/integrations/mailchimp/actions/getSubscriber";
import { removeSubscriber as mailchimpRemoveSubscriber } from "@/integrations/mailchimp/actions/removeSubscriber";
import { removeTag as mailchimpRemoveTag } from "@/integrations/mailchimp/actions/removeTag";
import { updateSubscriber as mailchimpUpdateSubscriber } from "@/integrations/mailchimp/actions/updateSubscriber";
import { addRow as excelAddRow } from "@/integrations/microsoft-excel/actions/addRow";
import { addTableRow as excelAddTableRow } from "@/integrations/microsoft-excel/actions/addTableRow";
import { createWorksheet as excelCreateWorksheet } from "@/integrations/microsoft-excel/actions/createWorksheet";
import { exportSheet as excelExportSheet } from "@/integrations/microsoft-excel/actions/exportSheet";
import { getWorkbooks as excelGetWorkbooks } from "@/integrations/microsoft-excel/actions/getWorkbooks";
import { getWorksheets as excelGetWorksheets } from "@/integrations/microsoft-excel/actions/getWorksheets";
import { copyItem as copyOneDriveItem } from "@/integrations/microsoft-onedrive/actions/copyItem";
import { createFolder as createOneDriveFolder } from "@/integrations/microsoft-onedrive/actions/createFolder";
import { deleteItem as deleteOneDriveItem } from "@/integrations/microsoft-onedrive/actions/deleteItem";
import { getFile as getOneDriveFile } from "@/integrations/microsoft-onedrive/actions/getFile";
import { listItems as listOneDriveItems } from "@/integrations/microsoft-onedrive/actions/listItems";
import { moveItem as moveOneDriveItem } from "@/integrations/microsoft-onedrive/actions/moveItem";
import { uploadFile as uploadOneDriveFile } from "@/integrations/microsoft-onedrive/actions/uploadFile";
import { getChannelDetails as teamsGetChannelDetails } from "@/integrations/microsoft-teams/actions/getChannelDetails";
import { getTeamMembers as teamsGetTeamMembers } from "@/integrations/microsoft-teams/actions/getTeamMembers";
import { replyToChannelMessage as teamsReplyToChannelMessage } from "@/integrations/microsoft-teams/actions/replyToChannelMessage";
import { sendChannelMessage as teamsSendChannelMessage } from "@/integrations/microsoft-teams/actions/sendChannelMessage";
import { sendChatMessage as teamsSendChatMessage } from "@/integrations/microsoft-teams/actions/sendChatMessage";
import { sendEmail as sendOutlookEmail } from "@/integrations/microsoft-outlook/actions/sendEmail";
import { addAttendees as addOutlookCalendarAttendees } from "@/integrations/microsoft-outlook-calendar/actions/addAttendees";
import { createEvent as createOutlookCalendarEvent } from "@/integrations/microsoft-outlook-calendar/actions/createEvent";
import { deleteEvent as deleteOutlookCalendarEvent } from "@/integrations/microsoft-outlook-calendar/actions/deleteEvent";
import { listEvents as listOutlookCalendarEvents } from "@/integrations/microsoft-outlook-calendar/actions/listEvents";
import { updateEvent as updateOutlookCalendarEvent } from "@/integrations/microsoft-outlook-calendar/actions/updateEvent";
import { appendBlockChildren as notionAppendBlockChildren } from "@/integrations/notion/actions/appendBlockChildren";
import { createDatabaseEntry as notionCreateDatabaseEntry } from "@/integrations/notion/actions/createDatabaseEntry";
import { createPage as notionCreatePage } from "@/integrations/notion/actions/createPage";
import { getPage as notionGetPage } from "@/integrations/notion/actions/getPage";
import { queryDatabase as notionQueryDatabase } from "@/integrations/notion/actions/queryDatabase";
import { search as notionSearch } from "@/integrations/notion/actions/search";
import { updatePage as notionUpdatePage } from "@/integrations/notion/actions/updatePage";
import { addOrderNote as shopifyAddOrderNote } from "@/integrations/shopify/actions/addOrderNote";
import { createCustomer as shopifyCreateCustomer } from "@/integrations/shopify/actions/createCustomer";
import { createFulfillment as shopifyCreateFulfillment } from "@/integrations/shopify/actions/createFulfillment";
import { createOrder as shopifyCreateOrder } from "@/integrations/shopify/actions/createOrder";
import { createProduct as shopifyCreateProduct } from "@/integrations/shopify/actions/createProduct";
import { createProductVariant as shopifyCreateProductVariant } from "@/integrations/shopify/actions/createProductVariant";
import { updateCustomer as shopifyUpdateCustomer } from "@/integrations/shopify/actions/updateCustomer";
import { updateInventory as shopifyUpdateInventory } from "@/integrations/shopify/actions/updateInventory";
import { updateOrderStatus as shopifyUpdateOrderStatus } from "@/integrations/shopify/actions/updateOrderStatus";
import { updateProduct as shopifyUpdateProduct } from "@/integrations/shopify/actions/updateProduct";
import { addReaction as slackAddReaction } from "@/integrations/slack/actions/addReaction";
import { cancelScheduledMessage as slackCancelScheduledMessage } from "@/integrations/slack/actions/cancelScheduledMessage";
import { deleteMessage as slackDeleteMessage } from "@/integrations/slack/actions/deleteMessage";
import { getMessages as slackGetMessages } from "@/integrations/slack/actions/getMessages";
import { getThreadMessages as slackGetThreadMessages } from "@/integrations/slack/actions/getThreadMessages";
import { listScheduledMessages as slackListScheduledMessages } from "@/integrations/slack/actions/listScheduledMessages";
import { pinMessage as slackPinMessage } from "@/integrations/slack/actions/pinMessage";
import { postInteractiveBlocks as slackPostInteractiveBlocks } from "@/integrations/slack/actions/postInteractiveBlocks";
import { removeReaction as slackRemoveReaction } from "@/integrations/slack/actions/removeReaction";
import { scheduleMessage as slackScheduleMessage } from "@/integrations/slack/actions/scheduleMessage";
import { sendChannelMessage } from "@/integrations/slack/actions/sendChannelMessage";
import { sendDirectMessage as slackSendDirectMessage } from "@/integrations/slack/actions/sendDirectMessage";
import { unpinMessage as slackUnpinMessage } from "@/integrations/slack/actions/unpinMessage";
import { updateMessage as slackUpdateMessage } from "@/integrations/slack/actions/updateMessage";
import { cancelSubscription as stripeCancelSubscription } from "@/integrations/stripe/actions/cancelSubscription";
import { capturePaymentIntent as stripeCapturePaymentIntent } from "@/integrations/stripe/actions/capturePaymentIntent";
import { confirmPaymentIntent as stripeConfirmPaymentIntent } from "@/integrations/stripe/actions/confirmPaymentIntent";
import { createCustomer as stripeCreateCustomer } from "@/integrations/stripe/actions/createCustomer";
import { createPaymentIntent as stripeCreatePaymentIntent } from "@/integrations/stripe/actions/createPaymentIntent";
import { createRefund as stripeCreateRefund } from "@/integrations/stripe/actions/createRefund";
import { createSubscription as stripeCreateSubscription } from "@/integrations/stripe/actions/createSubscription";
import { findCustomer as stripeFindCustomer } from "@/integrations/stripe/actions/findCustomer";
import { updateCustomer as stripeUpdateCustomer } from "@/integrations/stripe/actions/updateCustomer";
import { updateSubscription as stripeUpdateSubscription } from "@/integrations/stripe/actions/updateSubscription";
import type { ActionHandler } from "./types";

/**
 * Hand-maintained action handler registry.
 *
 * Per docs/rules/provider-registry.md (same convention as the integration
 * manifest registry): explicit imports surface in PRs. Each provider's
 * action slice appends an entry to ALL_HANDLERS below.
 */

interface HandlerEntry {
  provider: string;
  /** Provider-scoped type matching WorkflowNode.type. */
  type: string;
  handler: ActionHandler;
}

const ALL_HANDLERS: ReadonlyArray<HandlerEntry> = [
  { provider: "slack", type: "send_channel_message", handler: sendChannelMessage },
  { provider: "slack", type: "send_direct_message", handler: slackSendDirectMessage },
  { provider: "slack", type: "update_message", handler: slackUpdateMessage },
  { provider: "slack", type: "delete_message", handler: slackDeleteMessage },
  { provider: "slack", type: "get_messages", handler: slackGetMessages },
  { provider: "slack", type: "get_thread_messages", handler: slackGetThreadMessages },
  { provider: "slack", type: "schedule_message", handler: slackScheduleMessage },
  { provider: "slack", type: "cancel_scheduled_message", handler: slackCancelScheduledMessage },
  { provider: "slack", type: "list_scheduled_messages", handler: slackListScheduledMessages },
  { provider: "slack", type: "add_reaction", handler: slackAddReaction },
  { provider: "slack", type: "remove_reaction", handler: slackRemoveReaction },
  { provider: "slack", type: "pin_message", handler: slackPinMessage },
  { provider: "slack", type: "unpin_message", handler: slackUnpinMessage },
  { provider: "slack", type: "post_interactive_blocks", handler: slackPostInteractiveBlocks },
  { provider: "gmail", type: "send_email", handler: sendEmail },
  { provider: "google-calendar", type: "create_event", handler: createEvent },
  { provider: "google-calendar", type: "list_events", handler: listEvents },
  { provider: "google-calendar", type: "update_event", handler: updateEvent },
  { provider: "google-calendar", type: "delete_event", handler: deleteEvent },
  { provider: "google-calendar", type: "add_attendees", handler: addAttendees },
  { provider: "google-drive", type: "upload_file", handler: uploadFile },
  { provider: "google-drive", type: "create_folder", handler: createFolder },
  { provider: "google-drive", type: "list_files", handler: listFiles },
  { provider: "google-drive", type: "move_file", handler: moveFile },
  { provider: "google-drive", type: "delete_file", handler: deleteFile },
  { provider: "google-sheets", type: "read_rows", handler: readRows },
  { provider: "google-sheets", type: "append_row", handler: appendRow },
  { provider: "google-sheets", type: "update_row", handler: updateRow },
  { provider: "google-sheets", type: "clear_range", handler: clearRange },
  { provider: "google-sheets", type: "get_sheet_metadata", handler: getSheetMetadata },
  { provider: "microsoft-outlook", type: "send_email", handler: sendOutlookEmail },
  { provider: "microsoft-outlook-calendar", type: "create_event", handler: createOutlookCalendarEvent },
  { provider: "microsoft-outlook-calendar", type: "list_events", handler: listOutlookCalendarEvents },
  { provider: "microsoft-outlook-calendar", type: "update_event", handler: updateOutlookCalendarEvent },
  { provider: "microsoft-outlook-calendar", type: "delete_event", handler: deleteOutlookCalendarEvent },
  { provider: "microsoft-outlook-calendar", type: "add_attendees", handler: addOutlookCalendarAttendees },
  { provider: "microsoft-excel", type: "add_row", handler: excelAddRow },
  { provider: "microsoft-excel", type: "add_table_row", handler: excelAddTableRow },
  { provider: "microsoft-excel", type: "create_worksheet", handler: excelCreateWorksheet },
  { provider: "microsoft-excel", type: "export_sheet", handler: excelExportSheet },
  { provider: "microsoft-excel", type: "get_workbooks", handler: excelGetWorkbooks },
  { provider: "microsoft-excel", type: "get_worksheets", handler: excelGetWorksheets },
  { provider: "microsoft-onedrive", type: "upload_file", handler: uploadOneDriveFile },
  { provider: "microsoft-onedrive", type: "get_file", handler: getOneDriveFile },
  { provider: "microsoft-onedrive", type: "create_folder", handler: createOneDriveFolder },
  { provider: "microsoft-onedrive", type: "delete_item", handler: deleteOneDriveItem },
  { provider: "microsoft-onedrive", type: "move_item", handler: moveOneDriveItem },
  { provider: "microsoft-onedrive", type: "copy_item", handler: copyOneDriveItem },
  { provider: "microsoft-onedrive", type: "list_items", handler: listOneDriveItems },
  { provider: "microsoft-teams", type: "send_channel_message", handler: teamsSendChannelMessage },
  { provider: "microsoft-teams", type: "send_chat_message", handler: teamsSendChatMessage },
  { provider: "microsoft-teams", type: "reply_to_channel_message", handler: teamsReplyToChannelMessage },
  { provider: "microsoft-teams", type: "get_channel_details", handler: teamsGetChannelDetails },
  { provider: "microsoft-teams", type: "get_team_members", handler: teamsGetTeamMembers },
  { provider: "notion", type: "create_page", handler: notionCreatePage },
  { provider: "notion", type: "update_page", handler: notionUpdatePage },
  { provider: "notion", type: "query_database", handler: notionQueryDatabase },
  { provider: "notion", type: "create_database_entry", handler: notionCreateDatabaseEntry },
  { provider: "notion", type: "append_block_children", handler: notionAppendBlockChildren },
  { provider: "notion", type: "get_page", handler: notionGetPage },
  { provider: "notion", type: "search", handler: notionSearch },
  { provider: "airtable", type: "list_records", handler: airtableListRecords },
  { provider: "airtable", type: "get_record", handler: airtableGetRecord },
  { provider: "airtable", type: "find_record", handler: airtableFindRecord },
  { provider: "airtable", type: "create_record", handler: airtableCreateRecord },
  { provider: "airtable", type: "update_record", handler: airtableUpdateRecord },
  { provider: "airtable", type: "delete_record", handler: airtableDeleteRecord },
  { provider: "airtable", type: "get_base_schema", handler: airtableGetBaseSchema },
  { provider: "airtable", type: "get_table_schema", handler: airtableGetTableSchema },
  { provider: "stripe", type: "create_customer", handler: stripeCreateCustomer },
  { provider: "stripe", type: "update_customer", handler: stripeUpdateCustomer },
  { provider: "stripe", type: "find_customer", handler: stripeFindCustomer },
  { provider: "stripe", type: "create_payment_intent", handler: stripeCreatePaymentIntent },
  { provider: "stripe", type: "confirm_payment_intent", handler: stripeConfirmPaymentIntent },
  { provider: "stripe", type: "capture_payment_intent", handler: stripeCapturePaymentIntent },
  { provider: "stripe", type: "create_refund", handler: stripeCreateRefund },
  { provider: "stripe", type: "create_subscription", handler: stripeCreateSubscription },
  { provider: "stripe", type: "update_subscription", handler: stripeUpdateSubscription },
  { provider: "stripe", type: "cancel_subscription", handler: stripeCancelSubscription },
  { provider: "shopify", type: "create_order", handler: shopifyCreateOrder },
  { provider: "shopify", type: "update_order_status", handler: shopifyUpdateOrderStatus },
  { provider: "shopify", type: "add_order_note", handler: shopifyAddOrderNote },
  { provider: "shopify", type: "create_fulfillment", handler: shopifyCreateFulfillment },
  { provider: "shopify", type: "create_product", handler: shopifyCreateProduct },
  { provider: "shopify", type: "update_product", handler: shopifyUpdateProduct },
  { provider: "shopify", type: "create_product_variant", handler: shopifyCreateProductVariant },
  { provider: "shopify", type: "create_customer", handler: shopifyCreateCustomer },
  { provider: "shopify", type: "update_customer", handler: shopifyUpdateCustomer },
  { provider: "shopify", type: "update_inventory", handler: shopifyUpdateInventory },
  { provider: "hubspot", type: "create_contact", handler: hubspotCreateContact },
  { provider: "hubspot", type: "update_contact", handler: hubspotUpdateContact },
  { provider: "hubspot", type: "get_contacts", handler: hubspotGetContacts },
  { provider: "hubspot", type: "create_company", handler: hubspotCreateCompany },
  { provider: "hubspot", type: "update_company", handler: hubspotUpdateCompany },
  { provider: "hubspot", type: "get_companies", handler: hubspotGetCompanies },
  { provider: "hubspot", type: "create_deal", handler: hubspotCreateDeal },
  { provider: "hubspot", type: "update_deal", handler: hubspotUpdateDeal },
  { provider: "hubspot", type: "get_deals", handler: hubspotGetDeals },
  { provider: "hubspot", type: "add_contact_to_list", handler: hubspotAddContactToList },
  { provider: "hubspot", type: "create_ticket", handler: hubspotCreateTicket },
  { provider: "hubspot", type: "update_ticket", handler: hubspotUpdateTicket },
  { provider: "hubspot", type: "get_tickets", handler: hubspotGetTickets },
  { provider: "hubspot", type: "create_note", handler: hubspotCreateNote },
  { provider: "hubspot", type: "create_task", handler: hubspotCreateTask },
  { provider: "hubspot", type: "create_call", handler: hubspotCreateCall },
  { provider: "hubspot", type: "create_meeting", handler: hubspotCreateMeeting },
  { provider: "hubspot", type: "create_line_item", handler: hubspotCreateLineItem },
  { provider: "hubspot", type: "update_line_item", handler: hubspotUpdateLineItem },
  { provider: "hubspot", type: "create_product", handler: hubspotCreateProduct },
  { provider: "hubspot", type: "update_product", handler: hubspotUpdateProduct },
  { provider: "hubspot", type: "get_owners", handler: hubspotGetOwners },
  { provider: "github", type: "create_issue", handler: githubCreateIssue },
  { provider: "github", type: "create_repository", handler: githubCreateRepository },
  { provider: "github", type: "create_pull_request", handler: githubCreatePullRequest },
  { provider: "github", type: "create_branch", handler: githubCreateBranch },
  { provider: "github", type: "create_gist", handler: githubCreateGist },
  { provider: "github", type: "add_comment", handler: githubAddComment },
  { provider: "mailchimp", type: "add_subscriber", handler: mailchimpAddSubscriber },
  { provider: "mailchimp", type: "update_subscriber", handler: mailchimpUpdateSubscriber },
  { provider: "mailchimp", type: "remove_subscriber", handler: mailchimpRemoveSubscriber },
  { provider: "mailchimp", type: "add_tag", handler: mailchimpAddTag },
  { provider: "mailchimp", type: "remove_tag", handler: mailchimpRemoveTag },
  { provider: "mailchimp", type: "get_subscriber", handler: mailchimpGetSubscriber },
  { provider: "mailchimp", type: "create_segment", handler: mailchimpCreateSegment },
  { provider: "mailchimp", type: "create_audience", handler: mailchimpCreateAudience },
  { provider: "mailchimp", type: "create_custom_event", handler: mailchimpCreateCustomEvent },
  { provider: "mailchimp", type: "add_note", handler: mailchimpAddNote },
];

const byKey: ReadonlyMap<string, ActionHandler> = (() => {
  const m = new Map<string, ActionHandler>();
  for (const entry of ALL_HANDLERS) {
    const key = `${entry.provider}:${entry.type}`;
    if (m.has(key)) {
      throw new Error(`Duplicate action handler registered for ${key}.`);
    }
    m.set(key, entry.handler);
  }
  return m;
})();

export function getActionHandler(
  provider: string,
  type: string,
): ActionHandler | undefined {
  return byKey.get(`${provider}:${type}`);
}

export function listRegisteredHandlers(): ReadonlyArray<{
  provider: string;
  type: string;
}> {
  return ALL_HANDLERS.map(({ provider, type }) => ({ provider, type }));
}
