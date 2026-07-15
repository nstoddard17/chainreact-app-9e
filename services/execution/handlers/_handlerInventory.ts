import { addAttachment as airtableAddAttachment } from "@/integrations/airtable/actions/addAttachment";
import { createMultipleRecords as airtableCreateMultipleRecords } from "@/integrations/airtable/actions/createMultipleRecords";
import { createRecord as airtableCreateRecord } from "@/integrations/airtable/actions/createRecord";
import { deleteRecord as airtableDeleteRecord } from "@/integrations/airtable/actions/deleteRecord";
import { findRecord as airtableFindRecord } from "@/integrations/airtable/actions/findRecord";
import { getBaseSchema as airtableGetBaseSchema } from "@/integrations/airtable/actions/getBaseSchema";
import { getRecord as airtableGetRecord } from "@/integrations/airtable/actions/getRecord";
import { getTableSchema as airtableGetTableSchema } from "@/integrations/airtable/actions/getTableSchema";
import { listRecords as airtableListRecords } from "@/integrations/airtable/actions/listRecords";
import { updateMultipleRecords as airtableUpdateMultipleRecords } from "@/integrations/airtable/actions/updateMultipleRecords";
import { updateRecord as airtableUpdateRecord } from "@/integrations/airtable/actions/updateRecord";
import { addComment as githubAddComment } from "@/integrations/github/actions/addComment";
import { addComment as trelloAddComment } from "@/integrations/trello/actions/addComment";
import { addLabelToCard as trelloAddLabelToCard } from "@/integrations/trello/actions/addLabelToCard";
import { archiveCard as trelloArchiveCard } from "@/integrations/trello/actions/archiveCard";
import { createBoard as trelloCreateBoard } from "@/integrations/trello/actions/createBoard";
import { createCard as trelloCreateCard } from "@/integrations/trello/actions/createCard";
import { createList as trelloCreateList } from "@/integrations/trello/actions/createList";
import { moveCard as trelloMoveCard } from "@/integrations/trello/actions/moveCard";
import { updateCard as trelloUpdateCard } from "@/integrations/trello/actions/updateCard";
// Eden (EDEN-4) — MCP-backed actions (batch 1: 4 reads + 3 board/note writes).
import { edenListWorkspaces } from "@/integrations/eden/actions/listWorkspaces";
import { edenListSchedules } from "@/integrations/eden/actions/listSchedules";
import { edenListScheduledPosts } from "@/integrations/eden/actions/listScheduledPosts";
import { edenCreateBoard } from "@/integrations/eden/actions/createBoard";
import { edenCreateNote } from "@/integrations/eden/actions/createNote";
import { edenReadBoard } from "@/integrations/eden/actions/readBoard";
import { edenTrashBoard } from "@/integrations/eden/actions/trashBoard";
// Eden (EDEN-5) — Batch 2 notes area.
import { edenReadNote } from "@/integrations/eden/actions/readNote";
import { edenAppendToNote } from "@/integrations/eden/actions/appendToNote";
import { edenUpdateNote } from "@/integrations/eden/actions/updateNote";
import { edenRenameNote } from "@/integrations/eden/actions/renameNote";
import { edenCreateStickyNote } from "@/integrations/eden/actions/createStickyNote";
import { edenListNotes } from "@/integrations/eden/actions/listNotes";
import { edenSearchItems } from "@/integrations/eden/actions/searchItems";
import { edenListBoards } from "@/integrations/eden/actions/listBoards";
import { edenListBoardItems } from "@/integrations/eden/actions/listBoardItems";
import { edenRenameBoard } from "@/integrations/eden/actions/renameBoard";
import { edenSaveLinksToBoard } from "@/integrations/eden/actions/saveLinksToBoard";
// Slice 3.DISCORD-2 — Discord runtime port (5 actions). Bot-token
// auth via env (DISCORD_BOT_TOKEN); no user-OAuth token used at
// action time. Per Slice 3.DISCORD-1 decisions: actions only, no
// triggers (D-DC1), only the 5 V1-manifest-declared handlers (D-DC3).
import { assignRole as discordAssignRole } from "@/integrations/discord/actions/assignRole";
import { deleteMessage as discordDeleteMessage } from "@/integrations/discord/actions/deleteMessage";
import { editMessage as discordEditMessage } from "@/integrations/discord/actions/editMessage";
import { fetchMessages as discordFetchMessages } from "@/integrations/discord/actions/fetchMessages";
import { sendMessage as discordSendMessage } from "@/integrations/discord/actions/sendMessage";
import { createBranch as githubCreateBranch } from "@/integrations/github/actions/createBranch";
import { createGist as githubCreateGist } from "@/integrations/github/actions/createGist";
import { createIssue as githubCreateIssue } from "@/integrations/github/actions/createIssue";
import { createPullRequest as githubCreatePullRequest } from "@/integrations/github/actions/createPullRequest";
import { createRepository as githubCreateRepository } from "@/integrations/github/actions/createRepository";
import { addLabel as gmailAddLabel } from "@/integrations/gmail/actions/addLabel";
import { archiveEmail as gmailArchiveEmail } from "@/integrations/gmail/actions/archiveEmail";
import { createDraft as gmailCreateDraft } from "@/integrations/gmail/actions/createDraft";
import { createDraftReply as gmailCreateDraftReply } from "@/integrations/gmail/actions/createDraftReply";
import { createLabel as gmailCreateLabel } from "@/integrations/gmail/actions/createLabel";
import { deleteEmail as gmailDeleteEmail } from "@/integrations/gmail/actions/deleteEmail";
import { getAttachment as gmailGetAttachment } from "@/integrations/gmail/actions/getAttachment";
import { getProfile as gmailGetProfile } from "@/integrations/gmail/actions/getProfile";
import { listLabels as gmailListLabels } from "@/integrations/gmail/actions/listLabels";
import { markAsRead as gmailMarkAsRead } from "@/integrations/gmail/actions/markAsRead";
import { markAsUnread as gmailMarkAsUnread } from "@/integrations/gmail/actions/markAsUnread";
import { removeLabel as gmailRemoveLabel } from "@/integrations/gmail/actions/removeLabel";
import { replyToEmail as gmailReplyToEmail } from "@/integrations/gmail/actions/replyToEmail";
import { searchEmails as gmailSearchEmails } from "@/integrations/gmail/actions/searchEmails";
import { sendEmail } from "@/integrations/gmail/actions/sendEmail";
import { addAttendees } from "@/integrations/google-calendar/actions/addAttendees";
import { createEvent } from "@/integrations/google-calendar/actions/createEvent";
import { deleteEvent } from "@/integrations/google-calendar/actions/deleteEvent";
import { listEvents } from "@/integrations/google-calendar/actions/listEvents";
import { updateEvent } from "@/integrations/google-calendar/actions/updateEvent";
import { createDocument as googleDocsCreateDocument } from "@/integrations/google-docs/actions/createDocument";
import { exportDocument as googleDocsExportDocument } from "@/integrations/google-docs/actions/exportDocument";
import { getDocument as googleDocsGetDocument } from "@/integrations/google-docs/actions/getDocument";
import { shareDocument as googleDocsShareDocument } from "@/integrations/google-docs/actions/shareDocument";
import { updateDocument as googleDocsUpdateDocument } from "@/integrations/google-docs/actions/updateDocument";
import { createFolder } from "@/integrations/google-drive/actions/createFolder";
import { deleteFile } from "@/integrations/google-drive/actions/deleteFile";
import { getFileMetadata } from "@/integrations/google-drive/actions/getFileMetadata";
import { listFiles } from "@/integrations/google-drive/actions/listFiles";
import { moveFile } from "@/integrations/google-drive/actions/moveFile";
import { searchFiles } from "@/integrations/google-drive/actions/searchFiles";
import { uploadFile } from "@/integrations/google-drive/actions/uploadFile";
import { appendRow } from "@/integrations/google-sheets/actions/appendRow";
import { batchUpdate as sheetsBatchUpdate } from "@/integrations/google-sheets/actions/batchUpdate";
import { clearRange } from "@/integrations/google-sheets/actions/clearRange";
import { createSpreadsheet as sheetsCreateSpreadsheet } from "@/integrations/google-sheets/actions/createSpreadsheet";
import { deleteRow as sheetsDeleteRow } from "@/integrations/google-sheets/actions/deleteRow";
import { findRow as sheetsFindRow } from "@/integrations/google-sheets/actions/findRow";
import { formatRange as sheetsFormatRange } from "@/integrations/google-sheets/actions/formatRange";
import { getCellValue } from "@/integrations/google-sheets/actions/getCellValue";
import { getSheetMetadata } from "@/integrations/google-sheets/actions/getSheetMetadata";
import { readRows } from "@/integrations/google-sheets/actions/readRows";
import { updateCell } from "@/integrations/google-sheets/actions/updateCell";
import { updateRow } from "@/integrations/google-sheets/actions/updateRow";
import { addContactToList as hubspotAddContactToList } from "@/integrations/hubspot/actions/addContactToList";
import { createCall as hubspotCreateCall } from "@/integrations/hubspot/actions/createCall";
import { createCompany as hubspotCreateCompany } from "@/integrations/hubspot/actions/createCompany";
import { createContact as hubspotCreateContact } from "@/integrations/hubspot/actions/createContact";
import { createDeal as hubspotCreateDeal } from "@/integrations/hubspot/actions/createDeal";
import { createLineItem as hubspotCreateLineItem } from "@/integrations/hubspot/actions/line_items/createLineItem";
import { createMeeting as hubspotCreateMeeting } from "@/integrations/hubspot/actions/createMeeting";
import { createNote as hubspotCreateNote } from "@/integrations/hubspot/actions/createNote";
import { createProduct as hubspotCreateProduct } from "@/integrations/hubspot/actions/createProduct";
import { createTask as hubspotCreateTask } from "@/integrations/hubspot/actions/createTask";
import { createTicket as hubspotCreateTicket } from "@/integrations/hubspot/actions/createTicket";
import { getCompanies as hubspotGetCompanies } from "@/integrations/hubspot/actions/getCompanies";
import { getContacts as hubspotGetContacts } from "@/integrations/hubspot/actions/getContacts";
import { getDeals as hubspotGetDeals } from "@/integrations/hubspot/actions/getDeals";
import { getLineItems as hubspotGetLineItems } from "@/integrations/hubspot/actions/line_items/getLineItems";
import { getOwners as hubspotGetOwners } from "@/integrations/hubspot/actions/getOwners";
import { getProducts as hubspotGetProducts } from "@/integrations/hubspot/actions/getProducts";
import { getTickets as hubspotGetTickets } from "@/integrations/hubspot/actions/getTickets";
import { removeFromList as hubspotRemoveFromList } from "@/integrations/hubspot/actions/removeFromList";
import { removeLineItem as hubspotRemoveLineItem } from "@/integrations/hubspot/actions/line_items/removeLineItem";
import { updateCompany as hubspotUpdateCompany } from "@/integrations/hubspot/actions/updateCompany";
import { updateContact as hubspotUpdateContact } from "@/integrations/hubspot/actions/updateContact";
import { updateDeal as hubspotUpdateDeal } from "@/integrations/hubspot/actions/updateDeal";
import { updateLineItem as hubspotUpdateLineItem } from "@/integrations/hubspot/actions/line_items/updateLineItem";
import { updateProduct as hubspotUpdateProduct } from "@/integrations/hubspot/actions/updateProduct";
import { updateTicket as hubspotUpdateTicket } from "@/integrations/hubspot/actions/updateTicket";
import { addNote as mailchimpAddNote } from "@/integrations/mailchimp/actions/addNote";
import { addSubscriber as mailchimpAddSubscriber } from "@/integrations/mailchimp/actions/addSubscriber";
import { addTag as mailchimpAddTag } from "@/integrations/mailchimp/actions/addTag";
import { createAudience as mailchimpCreateAudience } from "@/integrations/mailchimp/actions/createAudience";
import { createCustomEvent as mailchimpCreateCustomEvent } from "@/integrations/mailchimp/actions/createCustomEvent";
import { createSegment as mailchimpCreateSegment } from "@/integrations/mailchimp/actions/createSegment";
import { getCampaign as mailchimpGetCampaign } from "@/integrations/mailchimp/actions/getCampaign";
import { getCampaignStats as mailchimpGetCampaignStats } from "@/integrations/mailchimp/actions/getCampaignStats";
import { getSubscriber as mailchimpGetSubscriber } from "@/integrations/mailchimp/actions/getSubscriber";
import { getSubscribers as mailchimpGetSubscribers } from "@/integrations/mailchimp/actions/getSubscribers";
import { removeSubscriber as mailchimpRemoveSubscriber } from "@/integrations/mailchimp/actions/removeSubscriber";
import { removeTag as mailchimpRemoveTag } from "@/integrations/mailchimp/actions/removeTag";
import { unsubscribeSubscriber as mailchimpUnsubscribeSubscriber } from "@/integrations/mailchimp/actions/unsubscribeSubscriber";
import { updateSubscriber as mailchimpUpdateSubscriber } from "@/integrations/mailchimp/actions/updateSubscriber";
import { addRow as excelAddRow } from "@/integrations/microsoft-excel/actions/addRow";
import { addTableRow as excelAddTableRow } from "@/integrations/microsoft-excel/actions/addTableRow";
import { createWorksheet as excelCreateWorksheet } from "@/integrations/microsoft-excel/actions/createWorksheet";
import { deleteRow as excelDeleteRow } from "@/integrations/microsoft-excel/actions/deleteRow";
import { deleteWorksheet as excelDeleteWorksheet } from "@/integrations/microsoft-excel/actions/deleteWorksheet";
import { exportSheet as excelExportSheet } from "@/integrations/microsoft-excel/actions/exportSheet";
import { findRow as excelFindRow } from "@/integrations/microsoft-excel/actions/findRow";
import { getWorkbooks as excelGetWorkbooks } from "@/integrations/microsoft-excel/actions/getWorkbooks";
import { getWorksheets as excelGetWorksheets } from "@/integrations/microsoft-excel/actions/getWorksheets";
import { readRange as excelReadRange } from "@/integrations/microsoft-excel/actions/readRange";
import { readTableRows as excelReadTableRows } from "@/integrations/microsoft-excel/actions/readTableRows";
import { renameWorksheet as excelRenameWorksheet } from "@/integrations/microsoft-excel/actions/renameWorksheet";
import { updateRow as excelUpdateRow } from "@/integrations/microsoft-excel/actions/updateRow";
import { copyItem as copyOneDriveItem } from "@/integrations/microsoft-onedrive/actions/copyItem";
import { createFolder as createOneDriveFolder } from "@/integrations/microsoft-onedrive/actions/createFolder";
import { deleteItem as deleteOneDriveItem } from "@/integrations/microsoft-onedrive/actions/deleteItem";
import { getFile as getOneDriveFile } from "@/integrations/microsoft-onedrive/actions/getFile";
import { listItems as listOneDriveItems } from "@/integrations/microsoft-onedrive/actions/listItems";
import { moveItem as moveOneDriveItem } from "@/integrations/microsoft-onedrive/actions/moveItem";
import { uploadFile as uploadOneDriveFile } from "@/integrations/microsoft-onedrive/actions/uploadFile";
import { copyPage as oneNoteCopyPage } from "@/integrations/microsoft-onenote/actions/copyPage";
import { createNotebook as oneNoteCreateNotebook } from "@/integrations/microsoft-onenote/actions/createNotebook";
import { createPage as oneNoteCreatePage } from "@/integrations/microsoft-onenote/actions/createPage";
import { createSection as oneNoteCreateSection } from "@/integrations/microsoft-onenote/actions/createSection";
import { deletePage as oneNoteDeletePage } from "@/integrations/microsoft-onenote/actions/deletePage";
import { getNotebookDetails as oneNoteGetNotebookDetails } from "@/integrations/microsoft-onenote/actions/getNotebookDetails";
import { getPageContent as oneNoteGetPageContent } from "@/integrations/microsoft-onenote/actions/getPageContent";
import { getSectionDetails as oneNoteGetSectionDetails } from "@/integrations/microsoft-onenote/actions/getSectionDetails";
import { listNotebooks as oneNoteListNotebooks } from "@/integrations/microsoft-onenote/actions/listNotebooks";
import { listPages as oneNoteListPages } from "@/integrations/microsoft-onenote/actions/listPages";
import { listSections as oneNoteListSections } from "@/integrations/microsoft-onenote/actions/listSections";
import { updatePage as oneNoteUpdatePage } from "@/integrations/microsoft-onenote/actions/updatePage";
import { getChannelDetails as teamsGetChannelDetails } from "@/integrations/microsoft-teams/actions/getChannelDetails";
import { getTeamMembers as teamsGetTeamMembers } from "@/integrations/microsoft-teams/actions/getTeamMembers";
import { listChannelMessages as teamsListChannelMessages } from "@/integrations/microsoft-teams/actions/listChannelMessages";
import { listChannels as teamsListChannels } from "@/integrations/microsoft-teams/actions/listChannels";
import { listTeams as teamsListTeams } from "@/integrations/microsoft-teams/actions/listTeams";
import { replyToChannelMessage as teamsReplyToChannelMessage } from "@/integrations/microsoft-teams/actions/replyToChannelMessage";
import { sendChannelMessage as teamsSendChannelMessage } from "@/integrations/microsoft-teams/actions/sendChannelMessage";
import { sendChatMessage as teamsSendChatMessage } from "@/integrations/microsoft-teams/actions/sendChatMessage";
// Slice 3.MONDAY-2 — Monday.com runtime port (10 actions). GraphQL
// API via `_shared/monday/api/_request.ts`. No webhook triggers in
// this slice; MONDAY-5 ships the per-workflow webhook lifecycle.
import { createItem as mondayCreateItem } from "@/integrations/monday/actions/items/createItem";
import { createSubitem as mondayCreateSubitem } from "@/integrations/monday/actions/items/createSubitem";
import { createUpdate as mondayCreateUpdate } from "@/integrations/monday/actions/updates/createUpdate";
import { deleteItem as mondayDeleteItem } from "@/integrations/monday/actions/items/deleteItem";
import { getItem as mondayGetItem } from "@/integrations/monday/actions/items/getItem";
import { listBoards as mondayListBoards } from "@/integrations/monday/actions/boards/listBoards";
import { listItems as mondayListItems } from "@/integrations/monday/actions/items/listItems";
import { listUsers as mondayListUsers } from "@/integrations/monday/actions/users/listUsers";
import { moveItem as mondayMoveItem } from "@/integrations/monday/actions/items/moveItem";
import { updateItem as mondayUpdateItem } from "@/integrations/monday/actions/items/updateItem";
// Slice 3.MONDAY-4 — remaining 14 V1 Monday actions completed to the
// updated provider-completion standard. All 14 ship (no real V2-native
// blocker). Includes the two FileRef actions (add_file consumer,
// download_file producer) via the P-S3 file contract.
import { addColumn as mondayAddColumn } from "@/integrations/monday/actions/boards/addColumn";
import { addFile as mondayAddFile } from "@/integrations/monday/actions/files/addFile";
import { archiveItem as mondayArchiveItem } from "@/integrations/monday/actions/items/archiveItem";
import { createBoard as mondayCreateBoard } from "@/integrations/monday/actions/boards/createBoard";
import { createGroup as mondayCreateGroup } from "@/integrations/monday/actions/boards/createGroup";
import { downloadFile as mondayDownloadFile } from "@/integrations/monday/actions/files/downloadFile";
import { duplicateBoard as mondayDuplicateBoard } from "@/integrations/monday/actions/boards/duplicateBoard";
import { duplicateItem as mondayDuplicateItem } from "@/integrations/monday/actions/items/duplicateItem";
import { getBoard as mondayGetBoard } from "@/integrations/monday/actions/boards/getBoard";
import { getUser as mondayGetUser } from "@/integrations/monday/actions/users/getUser";
import { listGroups as mondayListGroups } from "@/integrations/monday/actions/boards/listGroups";
import { listSubitems as mondayListSubitems } from "@/integrations/monday/actions/items/listSubitems";
import { listUpdates as mondayListUpdates } from "@/integrations/monday/actions/updates/listUpdates";
import { searchItems as mondaySearchItems } from "@/integrations/monday/actions/items/searchItems";
// Slice 3.DROPBOX-2 — 11 Dropbox action handlers (full accepted surface).
// Two-host Dropbox API; FileRef consumer (upload) + producers (download,
// get_temporary_link). No triggers in this slice.
import { copyFile as dropboxCopyFile } from "@/integrations/dropbox/actions/copyFile";
import { createFolder as dropboxCreateFolder } from "@/integrations/dropbox/actions/createFolder";
import { createSharedLink as dropboxCreateSharedLink } from "@/integrations/dropbox/actions/createSharedLink";
import { deleteFile as dropboxDeleteFile } from "@/integrations/dropbox/actions/deleteFile";
import { downloadFile as dropboxDownloadFile } from "@/integrations/dropbox/actions/downloadFile";
import { getFileMetadata as dropboxGetFileMetadata } from "@/integrations/dropbox/actions/getFileMetadata";
import { getTemporaryLink as dropboxGetTemporaryLink } from "@/integrations/dropbox/actions/getTemporaryLink";
import { listFolder as dropboxListFolder } from "@/integrations/dropbox/actions/listFolder";
import { moveFile as dropboxMoveFile } from "@/integrations/dropbox/actions/moveFile";
import { searchFiles as dropboxSearchFiles } from "@/integrations/dropbox/actions/searchFiles";
import { uploadFile as dropboxUploadFile } from "@/integrations/dropbox/actions/uploadFile";
// Slice 3.FACEBOOK-2 — 8 Facebook Pages actions.
import { createPost as facebookCreatePost } from "@/integrations/facebook/actions/createPost";
import { updatePost as facebookUpdatePost } from "@/integrations/facebook/actions/updatePost";
import { commentOnPost as facebookCommentOnPost } from "@/integrations/facebook/actions/commentOnPost";
import { uploadPhoto as facebookUploadPhoto } from "@/integrations/facebook/actions/uploadPhoto";
import { uploadVideo as facebookUploadVideo } from "@/integrations/facebook/actions/uploadVideo";
import { getPageInsights as facebookGetPageInsights } from "@/integrations/facebook/actions/getPageInsights";
import { sendMessage as facebookSendMessage } from "@/integrations/facebook/actions/sendMessage";
import { deletePost as facebookDeletePost } from "@/integrations/facebook/actions/deletePost";
// Slice 3.GOOGLE-ANALYTICS-2 — GA4 runtime (6 actions, no triggers).
import { runReport as googleAnalyticsRunReport } from "@/integrations/google-analytics/actions/runReport";
import { runPivotReport as googleAnalyticsRunPivotReport } from "@/integrations/google-analytics/actions/runPivotReport";
import { getRealtimeData as googleAnalyticsGetRealtimeData } from "@/integrations/google-analytics/actions/getRealtimeData";
import { findConversion as googleAnalyticsFindConversion } from "@/integrations/google-analytics/actions/findConversion";
import { sendEvent as googleAnalyticsSendEvent } from "@/integrations/google-analytics/actions/sendEvent";
import { createConversionEvent as googleAnalyticsCreateConversionEvent } from "@/integrations/google-analytics/actions/createConversionEvent";
import { addCategories as addOutlookCategories } from "@/integrations/microsoft-outlook/actions/addCategories";
import { createDraftEmail as createOutlookDraftEmail } from "@/integrations/microsoft-outlook/actions/createDraftEmail";
import { deleteEmail as deleteOutlookEmail } from "@/integrations/microsoft-outlook/actions/deleteEmail";
import { fetchEmails as fetchOutlookEmails } from "@/integrations/microsoft-outlook/actions/fetchEmails";
import { forwardEmail as forwardOutlookEmail } from "@/integrations/microsoft-outlook/actions/forwardEmail";
import { getAttachment as getOutlookAttachment } from "@/integrations/microsoft-outlook/actions/getAttachment";
import { getProfile as getOutlookProfile } from "@/integrations/microsoft-outlook/actions/getProfile";
import { listFolders as listOutlookFolders } from "@/integrations/microsoft-outlook/actions/listFolders";
import { moveEmail as moveOutlookEmail } from "@/integrations/microsoft-outlook/actions/moveEmail";
import { replyToEmail as replyToOutlookEmail } from "@/integrations/microsoft-outlook/actions/replyToEmail";
import { sendEmail as sendOutlookEmail } from "@/integrations/microsoft-outlook/actions/sendEmail";
import { addAttendees as addOutlookCalendarAttendees } from "@/integrations/microsoft-outlook-calendar/actions/addAttendees";
import { createEvent as createOutlookCalendarEvent } from "@/integrations/microsoft-outlook-calendar/actions/createEvent";
import { deleteEvent as deleteOutlookCalendarEvent } from "@/integrations/microsoft-outlook-calendar/actions/deleteEvent";
import { listEvents as listOutlookCalendarEvents } from "@/integrations/microsoft-outlook-calendar/actions/listEvents";
import { updateEvent as updateOutlookCalendarEvent } from "@/integrations/microsoft-outlook-calendar/actions/updateEvent";
import { appendBlockChildren as notionAppendBlockChildren } from "@/integrations/notion/actions/appendBlockChildren";
import { archivePage as notionArchivePage } from "@/integrations/notion/actions/archivePage";
import { createComment as notionCreateComment } from "@/integrations/notion/actions/createComment";
import { createDatabase as notionCreateDatabase } from "@/integrations/notion/actions/createDatabase";
import { createDatabaseEntry as notionCreateDatabaseEntry } from "@/integrations/notion/actions/createDatabaseEntry";
import { createPage as notionCreatePage } from "@/integrations/notion/actions/createPage";
import { getBlock as notionGetBlock } from "@/integrations/notion/actions/getBlock";
import { getBlockChildren as notionGetBlockChildren } from "@/integrations/notion/actions/getBlockChildren";
import { getPage as notionGetPage } from "@/integrations/notion/actions/getPage";
import { getUser as notionGetUser } from "@/integrations/notion/actions/getUser";
import { listComments as notionListComments } from "@/integrations/notion/actions/listComments";
import { listUsers as notionListUsers } from "@/integrations/notion/actions/listUsers";
import { queryDatabase as notionQueryDatabase } from "@/integrations/notion/actions/queryDatabase";
import { restorePage as notionRestorePage } from "@/integrations/notion/actions/restorePage";
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
import { updateProductVariant as shopifyUpdateProductVariant } from "@/integrations/shopify/actions/updateProductVariant";
import { addReaction as slackAddReaction } from "@/integrations/slack/actions/addReaction";
import { archiveChannel as slackArchiveChannel } from "@/integrations/slack/actions/channels/archiveChannel";
import { cancelScheduledMessage as slackCancelScheduledMessage } from "@/integrations/slack/actions/cancelScheduledMessage";
import { createChannel as slackCreateChannel } from "@/integrations/slack/actions/channels/createChannel";
import { deleteMessage as slackDeleteMessage } from "@/integrations/slack/actions/deleteMessage";
import { getChannelInfo as slackGetChannelInfo } from "@/integrations/slack/actions/channels/getChannelInfo";
import { getMessages as slackGetMessages } from "@/integrations/slack/actions/getMessages";
import { getThreadMessages as slackGetThreadMessages } from "@/integrations/slack/actions/getThreadMessages";
import { getUserInfo as slackGetUserInfo } from "@/integrations/slack/actions/users/getUserInfo";
import { inviteUsersToChannel as slackInviteUsersToChannel } from "@/integrations/slack/actions/channels/inviteUsersToChannel";
import { joinChannel as slackJoinChannel } from "@/integrations/slack/actions/channels/joinChannel";
import { leaveChannel as slackLeaveChannel } from "@/integrations/slack/actions/channels/leaveChannel";
import { listChannels as slackListChannels } from "@/integrations/slack/actions/channels/listChannels";
import { listScheduledMessages as slackListScheduledMessages } from "@/integrations/slack/actions/listScheduledMessages";
import { listUsers as slackListUsers } from "@/integrations/slack/actions/users/listUsers";
import { pinMessage as slackPinMessage } from "@/integrations/slack/actions/pinMessage";
import { postInteractiveBlocks as slackPostInteractiveBlocks } from "@/integrations/slack/actions/postInteractiveBlocks";
import { removeReaction as slackRemoveReaction } from "@/integrations/slack/actions/removeReaction";
import { removeUserFromChannel as slackRemoveUserFromChannel } from "@/integrations/slack/actions/channels/removeUserFromChannel";
import { renameChannel as slackRenameChannel } from "@/integrations/slack/actions/channels/renameChannel";
import { scheduleMessage as slackScheduleMessage } from "@/integrations/slack/actions/scheduleMessage";
import { sendChannelMessage } from "@/integrations/slack/actions/sendChannelMessage";
import { sendDirectMessage as slackSendDirectMessage } from "@/integrations/slack/actions/sendDirectMessage";
import { setChannelPurpose as slackSetChannelPurpose } from "@/integrations/slack/actions/channels/setChannelPurpose";
import { setChannelTopic as slackSetChannelTopic } from "@/integrations/slack/actions/channels/setChannelTopic";
import { unarchiveChannel as slackUnarchiveChannel } from "@/integrations/slack/actions/channels/unarchiveChannel";
import { unpinMessage as slackUnpinMessage } from "@/integrations/slack/actions/unpinMessage";
import { updateMessage as slackUpdateMessage } from "@/integrations/slack/actions/updateMessage";
import { downloadFile as slackDownloadFile } from "@/integrations/slack/actions/files/downloadFile";
import { getFileInfo as slackGetFileInfo } from "@/integrations/slack/actions/files/getFileInfo";
import { uploadFile as slackUploadFile } from "@/integrations/slack/actions/files/uploadFile";
import { cancelSubscription as stripeCancelSubscription } from "@/integrations/stripe/actions/cancelSubscription";
import { capturePaymentIntent as stripeCapturePaymentIntent } from "@/integrations/stripe/actions/capturePaymentIntent";
import { confirmPaymentIntent as stripeConfirmPaymentIntent } from "@/integrations/stripe/actions/confirmPaymentIntent";
import { createCheckoutSession as stripeCreateCheckoutSession } from "@/integrations/stripe/actions/createCheckoutSession";
import { createCustomer as stripeCreateCustomer } from "@/integrations/stripe/actions/createCustomer";
import { createInvoice as stripeCreateInvoice } from "@/integrations/stripe/actions/createInvoice";
import { createPaymentIntent as stripeCreatePaymentIntent } from "@/integrations/stripe/actions/createPaymentIntent";
import { createPaymentLink as stripeCreatePaymentLink } from "@/integrations/stripe/actions/createPaymentLink";
import { createRefund as stripeCreateRefund } from "@/integrations/stripe/actions/createRefund";
import { createSubscription as stripeCreateSubscription } from "@/integrations/stripe/actions/createSubscription";
import { findCustomer as stripeFindCustomer } from "@/integrations/stripe/actions/findCustomer";
import { findPaymentIntent as stripeFindPaymentIntent } from "@/integrations/stripe/actions/findPaymentIntent";
import { findSubscription as stripeFindSubscription } from "@/integrations/stripe/actions/findSubscription";
import { getPayments as stripeGetPayments } from "@/integrations/stripe/actions/getPayments";
import { updateCustomer as stripeUpdateCustomer } from "@/integrations/stripe/actions/updateCustomer";
import { updateSubscription as stripeUpdateSubscription } from "@/integrations/stripe/actions/updateSubscription";
// Native-nodes Slice 1 — Tier A pure-handler ports
// (docs/slices/parity/parity-native-nodes.md §7 Tier A +
// docs/slices/parity/native-nodes-1-tier-a-plan.md). No OAuth /
// manifest / scopes — registered directly into the handler registry
// under providerId "native".
import { httpRequest as nativeHttpRequest } from "@/integrations/native/actions/httpRequest";
import { formatTransformer as nativeFormatTransformer } from "@/integrations/native/actions/formatTransformer";
import { delay as nativeDelay } from "@/integrations/native/actions/delay";
// Native-nodes Slice 3 — Tier C control-flow ports
// (docs/slices/parity/native-nodes-3-tier-c-control-flow-plan.md §4).
// Consume the engine-branching contract (WorkflowEdge.label? +
// ActionHandlerResult.branchTaken? + label-aware traversal + skip
// emission). Pure handlers; no OAuth; no integration row.
import { ifThenCondition as nativeIfThenCondition } from "@/integrations/native/actions/ifThenCondition";
import { router as nativeRouter } from "@/integrations/native/actions/router";
// Slice 5.ASANA-1 — 5 Asana task/comment actions (first net-new provider,
// no V1 code). REST via _shared/asana/api; all writes wrapped in
// refreshAndRetry (hourly-expiring tokens).
import { createTask as asanaCreateTask } from "@/integrations/asana/actions/tasks/createTask";
import { updateTask as asanaUpdateTask } from "@/integrations/asana/actions/tasks/updateTask";
import { completeTask as asanaCompleteTask } from "@/integrations/asana/actions/tasks/completeTask";
import { getTask as asanaGetTask } from "@/integrations/asana/actions/tasks/getTask";
import { addCommentToTask as asanaAddCommentToTask } from "@/integrations/asana/actions/comments/addCommentToTask";
// ASANA-2 — subtask create + paginated project task list (held scopes).
import { createSubtask as asanaCreateSubtask } from "@/integrations/asana/actions/tasks/createSubtask";
import { listTasksInProject as asanaListTasksInProject } from "@/integrations/asana/actions/tasks/listTasksInProject";
// TYPEFORM-2 — first Typeform actions (2 reads via GET /forms/{id}/responses;
// new responses:read scope). TYPEFORM-1 deliberately shipped zero actions.
import { listResponses as typeformListResponses } from "@/integrations/typeform/actions/listResponses";
import { getResponse as typeformGetResponse } from "@/integrations/typeform/actions/getResponse";
// QUICKBOOKS-1 — 7 bounded QuickBooks Online actions (3 customer, 4
// invoice). All realm-scoped via actions/_resolveRealm; create_invoice
// drafts only (send_invoice is the separate, explicitly customer-facing
// email send).
import { createCustomer as quickbooksCreateCustomer } from "@/integrations/quickbooks/actions/createCustomer";
import { findCustomer as quickbooksFindCustomer } from "@/integrations/quickbooks/actions/findCustomer";
import { getCustomer as quickbooksGetCustomer } from "@/integrations/quickbooks/actions/getCustomer";
import { createInvoice as quickbooksCreateInvoice } from "@/integrations/quickbooks/actions/createInvoice";
import { sendInvoice as quickbooksSendInvoice } from "@/integrations/quickbooks/actions/sendInvoice";
import { getInvoice as quickbooksGetInvoice } from "@/integrations/quickbooks/actions/getInvoice";
import { listInvoices as quickbooksListInvoices } from "@/integrations/quickbooks/actions/listInvoices";
import type { ActionHandler } from "./types";

/**
 * Hand-maintained inventory of every action handler the V2 execution engine
 * dispatches. Extracted from `_registry.ts` (max-lines lint cleanup, AI-28
 * follow-up). The split is data-only: lookups, duplicate detection, and the
 * public `getActionHandler` / `listRegisteredHandlers` APIs all stay in
 * `_registry.ts`.
 *
 * Adding a new action handler still means: add the import below, add the
 * entry to `ALL_HANDLERS`, ship a PR. Reviewer scans the diff to see which
 * provider/action the slice covers — no implicit auto-discovery.
 *
 * Underscore-prefixed module name = internal sibling; consumers continue to
 * import the public surface from `_registry.ts` only.
 */

export interface HandlerEntry {
  provider: string;
  /** Provider-scoped type matching WorkflowNode.type. */
  type: string;
  handler: ActionHandler;
}

export const ALL_HANDLERS: ReadonlyArray<HandlerEntry> = [
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
  { provider: "slack", type: "list_channels", handler: slackListChannels },
  { provider: "slack", type: "get_channel_info", handler: slackGetChannelInfo },
  { provider: "slack", type: "create_channel", handler: slackCreateChannel },
  { provider: "slack", type: "archive_channel", handler: slackArchiveChannel },
  { provider: "slack", type: "unarchive_channel", handler: slackUnarchiveChannel },
  { provider: "slack", type: "rename_channel", handler: slackRenameChannel },
  { provider: "slack", type: "join_channel", handler: slackJoinChannel },
  { provider: "slack", type: "leave_channel", handler: slackLeaveChannel },
  { provider: "slack", type: "invite_users_to_channel", handler: slackInviteUsersToChannel },
  { provider: "slack", type: "remove_user_from_channel", handler: slackRemoveUserFromChannel },
  { provider: "slack", type: "set_channel_topic", handler: slackSetChannelTopic },
  { provider: "slack", type: "set_channel_purpose", handler: slackSetChannelPurpose },
  { provider: "slack", type: "get_user_info", handler: slackGetUserInfo },
  { provider: "slack", type: "list_users", handler: slackListUsers },
  // Slack 2.4 Commit 3 — file upload via P-S3 FileRef contract.
  { provider: "slack", type: "upload_file", handler: slackUploadFile },
  // Slack 2.4 Commit 4 — file download (stages bytes to v2_storage)
  // and metadata-only get_file_info (emits provider_url FileRef).
  { provider: "slack", type: "download_file", handler: slackDownloadFile },
  { provider: "slack", type: "get_file_info", handler: slackGetFileInfo },
  { provider: "gmail", type: "send_email", handler: sendEmail },
  // Gmail 2.1 Commit 3 — drafts + reply ports.
  { provider: "gmail", type: "create_draft", handler: gmailCreateDraft },
  { provider: "gmail", type: "create_draft_reply", handler: gmailCreateDraftReply },
  { provider: "gmail", type: "reply_to_email", handler: gmailReplyToEmail },
  // Gmail 2.2 Commit 1 — label actions (message-level only).
  { provider: "gmail", type: "add_label", handler: gmailAddLabel },
  { provider: "gmail", type: "remove_label", handler: gmailRemoveLabel },
  { provider: "gmail", type: "create_label", handler: gmailCreateLabel },
  // Gmail 2.2 Commit 2 — email lifecycle actions.
  { provider: "gmail", type: "mark_as_read", handler: gmailMarkAsRead },
  { provider: "gmail", type: "mark_as_unread", handler: gmailMarkAsUnread },
  { provider: "gmail", type: "archive_email", handler: gmailArchiveEmail },
  { provider: "gmail", type: "delete_email", handler: gmailDeleteEmail },
  // Gmail 2.2 Commit 3 — search_emails (advancedSearch folded as searchMode).
  { provider: "gmail", type: "search_emails", handler: gmailSearchEmails },
  // Gmail 2.3 Commit 5 — get_attachment (download_attachment folded
  // into get_attachment per Gmail 2.3 plan §8 decision 13.1).
  { provider: "gmail", type: "get_attachment", handler: gmailGetAttachment },
  // Slice 4.GMAIL-READ-1 — read-only metadata actions (reuse existing
  // users.labels.list / users.getProfile wrappers; metadata-only).
  { provider: "gmail", type: "list_labels", handler: gmailListLabels },
  { provider: "gmail", type: "get_profile", handler: gmailGetProfile },
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
  // Slice 4.GDRIVE-READ-2 — read-only metadata + name search.
  { provider: "google-drive", type: "get_file_metadata", handler: getFileMetadata },
  { provider: "google-drive", type: "search_files", handler: searchFiles },
  // Slice 3.GDOCS-2 — Google Docs runtime port (5 actions).
  //   - share_document destructive-trio classification lands at the
  //     meta layer in GDOCS-4 (this slice ships runtime only).
  //   - export_document returns a FileRef(kind=v2_storage); V1's
  //     email/webhook/workflow-base64 destinations are DROPPED per
  //     GDOCS-1 §3.1.
  //   - update_document supports the V1 5-mode insertLocation enum
  //     (end / beginning / replace / after_text / before_text)
  //     including `*` wildcard semantics.
  { provider: "google-docs", type: "create_document", handler: googleDocsCreateDocument },
  { provider: "google-docs", type: "update_document", handler: googleDocsUpdateDocument },
  { provider: "google-docs", type: "share_document", handler: googleDocsShareDocument },
  { provider: "google-docs", type: "get_document", handler: googleDocsGetDocument },
  { provider: "google-docs", type: "export_document", handler: googleDocsExportDocument },
  { provider: "google-sheets", type: "read_rows", handler: readRows },
  { provider: "google-sheets", type: "append_row", handler: appendRow },
  { provider: "google-sheets", type: "update_row", handler: updateRow },
  { provider: "google-sheets", type: "clear_range", handler: clearRange },
  { provider: "google-sheets", type: "get_sheet_metadata", handler: getSheetMetadata },
  // Google Sheets 2.1 Commit 1 — single-cell read + write actions
  // (parity-google-sheets.md §7 + accepted audit decisions).
  { provider: "google-sheets", type: "get_cell_value", handler: getCellValue },
  { provider: "google-sheets", type: "update_cell", handler: updateCell },
  // Google Sheets 2.1 Commit 2 — row deletion + row finder
  // (parity-google-sheets.md §7; ships single-row delete only,
  // equals-only operator only — V1 kitchen-sink shape skipped).
  { provider: "google-sheets", type: "delete_row", handler: sheetsDeleteRow },
  { provider: "google-sheets", type: "find_row", handler: sheetsFindRow },
  // Google Sheets 2.1 Commit 3 — spreadsheet lifecycle (bare
  // spreadsheets.create surface; V1 template / initialData / folder /
  // description chrome explicitly skipped per audit GS-R10).
  {
    provider: "google-sheets",
    type: "create_spreadsheet",
    handler: sheetsCreateSpreadsheet,
  },
  // Google Sheets 2.2 Commit 2 — multi-range values write
  // (parity-google-sheets.md §7; typed-only `updates[]` input — V1
  // simple-mode cellN/valueN UI chrome + JSON-string mode + raw
  // requests[] passthrough all skipped per accepted plan §10
  // Decision 1).
  { provider: "google-sheets", type: "batch_update", handler: sheetsBatchUpdate },
  // Google Sheets 2.2 Commit 3 — typed-subset cell formatting via
  // spreadsheets.batchUpdate repeatCell request. Six accepted format
  // options (backgroundColor, textColor, bold, italic,
  // horizontalAlignment, numberFormat) per plan §10 Decision 2;
  // borders / conditional formatting / data validation all deferred
  // per Decision 3.
  { provider: "google-sheets", type: "format_range", handler: sheetsFormatRange },
  { provider: "microsoft-outlook", type: "send_email", handler: sendOutlookEmail },
  // Outlook Mail 2.1 Commit 3 — compose / draft actions (parity audit
  // §7 PORT set + accepted plan §4). Mail.ReadWrite scope landed in
  // Commit 2; only create_draft_email needs it but all three ride the
  // shared Microsoft OAuth + refreshAndRetry pipeline.
  { provider: "microsoft-outlook", type: "reply_to_email", handler: replyToOutlookEmail },
  { provider: "microsoft-outlook", type: "forward_email", handler: forwardOutlookEmail },
  { provider: "microsoft-outlook", type: "create_draft_email", handler: createOutlookDraftEmail },
  // Outlook Mail 2.2 Commit 2 — lifecycle trio (parity audit §7 PORT
  // set + 2.2 plan §6). All three require Mail.ReadWrite (already in
  // manifest from 2.1 P-O1). delete_email has REQUIRED Q11 deleteMode
  // enum — no destructive hidden defaults.
  { provider: "microsoft-outlook", type: "move_email", handler: moveOutlookEmail },
  { provider: "microsoft-outlook", type: "delete_email", handler: deleteOutlookEmail },
  { provider: "microsoft-outlook", type: "add_categories", handler: addOutlookCategories },
  // Outlook Mail 2.2 Commit 3 — V1-shape fetch_emails (D-OM1). Read-
  // only; Mail.Read scope already in manifest. Owns $filter vs $search
  // mutual-exclusion routing inside the wrapper.
  { provider: "microsoft-outlook", type: "fetch_emails", handler: fetchOutlookEmails },
  // Outlook Mail 2.3 Commit 4 — get_attachment (P-O2 fileAttachment-only).
  // Stages bytes to workflow_files via stageFileToStorage (P-S3); returns
  // FileRef[] in `attachments`. itemAttachment + referenceAttachment
  // emit metadata-only stubs with `skipped: true`.
  { provider: "microsoft-outlook", type: "get_attachment", handler: getOutlookAttachment },
  // Slice 4.OUTLOOK-READ-1 — read-only metadata actions (reuse existing
  // listMailFolders + a provider-local /me profile wrapper; metadata-only).
  { provider: "microsoft-outlook", type: "list_folders", handler: listOutlookFolders },
  { provider: "microsoft-outlook", type: "get_profile", handler: getOutlookProfile },
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
  // Microsoft Excel parity Commit 1 — row update + delete actions
  // (parity-microsoft-excel.md §7 + accepted audit decisions).
  { provider: "microsoft-excel", type: "update_row", handler: excelUpdateRow },
  { provider: "microsoft-excel", type: "delete_row", handler: excelDeleteRow },
  // Microsoft Excel parity Commit 2 — worksheet rename + delete actions.
  { provider: "microsoft-excel", type: "rename_worksheet", handler: excelRenameWorksheet },
  { provider: "microsoft-excel", type: "delete_worksheet", handler: excelDeleteWorksheet },
  // Slice 4.EXCEL-READ-2 — read-only range + table reads (reuse existing
  // Excel API wrappers; metadata/value-bounded, no file content).
  { provider: "microsoft-excel", type: "read_range", handler: excelReadRange },
  { provider: "microsoft-excel", type: "read_table_rows", handler: excelReadTableRows },
  { provider: "microsoft-excel", type: "find_row", handler: excelFindRow },
  { provider: "microsoft-onedrive", type: "upload_file", handler: uploadOneDriveFile },
  { provider: "microsoft-onedrive", type: "get_file", handler: getOneDriveFile },
  { provider: "microsoft-onedrive", type: "create_folder", handler: createOneDriveFolder },
  { provider: "microsoft-onedrive", type: "delete_item", handler: deleteOneDriveItem },
  { provider: "microsoft-onedrive", type: "move_item", handler: moveOneDriveItem },
  { provider: "microsoft-onedrive", type: "copy_item", handler: copyOneDriveItem },
  { provider: "microsoft-onedrive", type: "list_items", handler: listOneDriveItems },
  // Microsoft OneNote — Slice 3.ONENOTE-2 (12 actions). Trigger
  // actions ship in ONENOTE-5 (polling triggers — Microsoft Graph
  // deprecated OneNote subscriptions in May 2023).
  { provider: "microsoft-onenote", type: "create_page", handler: oneNoteCreatePage },
  { provider: "microsoft-onenote", type: "create_notebook", handler: oneNoteCreateNotebook },
  { provider: "microsoft-onenote", type: "create_section", handler: oneNoteCreateSection },
  { provider: "microsoft-onenote", type: "update_page", handler: oneNoteUpdatePage },
  { provider: "microsoft-onenote", type: "get_page_content", handler: oneNoteGetPageContent },
  { provider: "microsoft-onenote", type: "list_pages", handler: oneNoteListPages },
  { provider: "microsoft-onenote", type: "copy_page", handler: oneNoteCopyPage },
  { provider: "microsoft-onenote", type: "delete_page", handler: oneNoteDeletePage },
  { provider: "microsoft-onenote", type: "list_notebooks", handler: oneNoteListNotebooks },
  { provider: "microsoft-onenote", type: "list_sections", handler: oneNoteListSections },
  { provider: "microsoft-onenote", type: "get_notebook_details", handler: oneNoteGetNotebookDetails },
  { provider: "microsoft-onenote", type: "get_section_details", handler: oneNoteGetSectionDetails },
  // Monday.com — Slice 3.MONDAY-2 (10 actions). The remaining 14 V1
  // actions (archive / duplicate / search / file / board+group writes /
  // single-resource gets) are deferred to MONDAY-N polish per D-MON1.
  // Triggers ship in MONDAY-5 via Monday's create_webhook lifecycle.
  { provider: "monday", type: "create_item", handler: mondayCreateItem },
  { provider: "monday", type: "update_item", handler: mondayUpdateItem },
  { provider: "monday", type: "create_update", handler: mondayCreateUpdate },
  { provider: "monday", type: "create_subitem", handler: mondayCreateSubitem },
  { provider: "monday", type: "delete_item", handler: mondayDeleteItem },
  { provider: "monday", type: "move_item", handler: mondayMoveItem },
  { provider: "monday", type: "get_item", handler: mondayGetItem },
  { provider: "monday", type: "list_items", handler: mondayListItems },
  { provider: "monday", type: "list_boards", handler: mondayListBoards },
  { provider: "monday", type: "list_users", handler: mondayListUsers },
  // Slice 3.MONDAY-4 — remaining 14 actions (full V1 parity; 24 total).
  { provider: "monday", type: "archive_item", handler: mondayArchiveItem },
  { provider: "monday", type: "duplicate_item", handler: mondayDuplicateItem },
  { provider: "monday", type: "create_board", handler: mondayCreateBoard },
  { provider: "monday", type: "create_group", handler: mondayCreateGroup },
  { provider: "monday", type: "duplicate_board", handler: mondayDuplicateBoard },
  { provider: "monday", type: "add_column", handler: mondayAddColumn },
  { provider: "monday", type: "search_items", handler: mondaySearchItems },
  { provider: "monday", type: "list_subitems", handler: mondayListSubitems },
  { provider: "monday", type: "list_updates", handler: mondayListUpdates },
  { provider: "monday", type: "get_board", handler: mondayGetBoard },
  { provider: "monday", type: "list_groups", handler: mondayListGroups },
  { provider: "monday", type: "get_user", handler: mondayGetUser },
  { provider: "monday", type: "add_file", handler: mondayAddFile },
  { provider: "monday", type: "download_file", handler: mondayDownloadFile },
  // Slice 3.DROPBOX-2 — 11 Dropbox actions (full accepted surface).
  { provider: "dropbox", type: "upload_file", handler: dropboxUploadFile },
  { provider: "dropbox", type: "download_file", handler: dropboxDownloadFile },
  { provider: "dropbox", type: "get_file_metadata", handler: dropboxGetFileMetadata },
  { provider: "dropbox", type: "list_folder", handler: dropboxListFolder },
  { provider: "dropbox", type: "search_files", handler: dropboxSearchFiles },
  { provider: "dropbox", type: "create_folder", handler: dropboxCreateFolder },
  { provider: "dropbox", type: "move_file", handler: dropboxMoveFile },
  { provider: "dropbox", type: "copy_file", handler: dropboxCopyFile },
  { provider: "dropbox", type: "delete_file", handler: dropboxDeleteFile },
  { provider: "dropbox", type: "create_shared_link", handler: dropboxCreateSharedLink },
  { provider: "dropbox", type: "get_temporary_link", handler: dropboxGetTemporaryLink },
  // Slice 3.FACEBOOK-2 — 8 Facebook Pages actions (full accepted surface).
  { provider: "facebook", type: "create_post", handler: facebookCreatePost },
  { provider: "facebook", type: "update_post", handler: facebookUpdatePost },
  { provider: "facebook", type: "comment_on_post", handler: facebookCommentOnPost },
  { provider: "facebook", type: "upload_photo", handler: facebookUploadPhoto },
  { provider: "facebook", type: "upload_video", handler: facebookUploadVideo },
  { provider: "facebook", type: "get_page_insights", handler: facebookGetPageInsights },
  { provider: "facebook", type: "send_message", handler: facebookSendMessage },
  { provider: "facebook", type: "delete_post", handler: facebookDeletePost },
  // Slice 3.GOOGLE-ANALYTICS-2 — GA4 runtime (6 actions, no triggers).
  // create_measurement_secret + get_user_activity are intentionally NOT
  // registered (deferred — D-GA1 audit §4).
  { provider: "google-analytics", type: "run_report", handler: googleAnalyticsRunReport },
  { provider: "google-analytics", type: "run_pivot_report", handler: googleAnalyticsRunPivotReport },
  { provider: "google-analytics", type: "get_realtime_data", handler: googleAnalyticsGetRealtimeData },
  { provider: "google-analytics", type: "find_conversion", handler: googleAnalyticsFindConversion },
  { provider: "google-analytics", type: "send_event", handler: googleAnalyticsSendEvent },
  { provider: "google-analytics", type: "create_conversion_event", handler: googleAnalyticsCreateConversionEvent },
  { provider: "microsoft-teams", type: "send_channel_message", handler: teamsSendChannelMessage },
  { provider: "microsoft-teams", type: "send_chat_message", handler: teamsSendChatMessage },
  { provider: "microsoft-teams", type: "reply_to_channel_message", handler: teamsReplyToChannelMessage },
  { provider: "microsoft-teams", type: "get_channel_details", handler: teamsGetChannelDetails },
  { provider: "microsoft-teams", type: "get_team_members", handler: teamsGetTeamMembers },
  // Slice 4.TEAMS-READ-2 — read-only list actions (reuse teamsList /
  // channelsList; new channelMessagesList wrapper; metadata-only).
  { provider: "microsoft-teams", type: "list_teams", handler: teamsListTeams },
  { provider: "microsoft-teams", type: "list_channels", handler: teamsListChannels },
  { provider: "microsoft-teams", type: "list_channel_messages", handler: teamsListChannelMessages },
  { provider: "notion", type: "create_page", handler: notionCreatePage },
  { provider: "notion", type: "update_page", handler: notionUpdatePage },
  { provider: "notion", type: "query_database", handler: notionQueryDatabase },
  { provider: "notion", type: "create_database_entry", handler: notionCreateDatabaseEntry },
  { provider: "notion", type: "append_block_children", handler: notionAppendBlockChildren },
  { provider: "notion", type: "get_page", handler: notionGetPage },
  { provider: "notion", type: "search", handler: notionSearch },
  // Notion 2.1 Commit 1 — page lifecycle.
  { provider: "notion", type: "archive_page", handler: notionArchivePage },
  { provider: "notion", type: "restore_page", handler: notionRestorePage },
  // Notion 2.1 Commit 2 — user lookups.
  { provider: "notion", type: "get_user", handler: notionGetUser },
  { provider: "notion", type: "list_users", handler: notionListUsers },
  // Notion 2.1 Commit 3 — comments.
  { provider: "notion", type: "create_comment", handler: notionCreateComment },
  { provider: "notion", type: "list_comments", handler: notionListComments },
  // Notion 2.1 Commit 4 — database create + block reads.
  { provider: "notion", type: "create_database", handler: notionCreateDatabase },
  { provider: "notion", type: "get_block", handler: notionGetBlock },
  { provider: "notion", type: "get_block_children", handler: notionGetBlockChildren },
  { provider: "airtable", type: "list_records", handler: airtableListRecords },
  { provider: "airtable", type: "get_record", handler: airtableGetRecord },
  { provider: "airtable", type: "find_record", handler: airtableFindRecord },
  { provider: "airtable", type: "create_record", handler: airtableCreateRecord },
  { provider: "airtable", type: "update_record", handler: airtableUpdateRecord },
  { provider: "airtable", type: "delete_record", handler: airtableDeleteRecord },
  { provider: "airtable", type: "get_base_schema", handler: airtableGetBaseSchema },
  { provider: "airtable", type: "get_table_schema", handler: airtableGetTableSchema },
  // Airtable 2.1 Commit 2 — P-S3 FileRef consumer; writes a file into
  // an Airtable attachment field. v2_storage → signed URL; signed_url
  // passthrough; provider_url rejected with AirtableAddAttachmentConfigError.
  { provider: "airtable", type: "add_attachment", handler: airtableAddAttachment },
  // Airtable 2.1 Commit 3 — true batch create (max 10 records,
  // all-or-nothing per NPD-A1). Single POST per call.
  { provider: "airtable", type: "create_multiple_records", handler: airtableCreateMultipleRecords },
  // Airtable 2.1 Commit 4 — true batch update (max 10 records,
  // all-or-nothing per NPD-A1). Single PATCH per call. PATCH semantics
  // per record: only the fields present on each entry are updated.
  { provider: "airtable", type: "update_multiple_records", handler: airtableUpdateMultipleRecords },
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
  { provider: "stripe", type: "create_checkout_session", handler: stripeCreateCheckoutSession },
  { provider: "stripe", type: "create_payment_link", handler: stripeCreatePaymentLink },
  { provider: "stripe", type: "create_invoice", handler: stripeCreateInvoice },
  { provider: "stripe", type: "get_payments", handler: stripeGetPayments },
  // Stripe 2.1 Commit 5 — read-only finder actions.
  // Direct id lookup only (parity-stripe M5/M6); no list/search fallback.
  // 404 → { found: false, ... } per find-semantic; no Idempotency-Key on GET.
  { provider: "stripe", type: "find_subscription", handler: stripeFindSubscription },
  { provider: "stripe", type: "find_payment_intent", handler: stripeFindPaymentIntent },
  { provider: "shopify", type: "create_order", handler: shopifyCreateOrder },
  { provider: "shopify", type: "update_order_status", handler: shopifyUpdateOrderStatus },
  { provider: "shopify", type: "add_order_note", handler: shopifyAddOrderNote },
  { provider: "shopify", type: "create_fulfillment", handler: shopifyCreateFulfillment },
  { provider: "shopify", type: "create_product", handler: shopifyCreateProduct },
  { provider: "shopify", type: "update_product", handler: shopifyUpdateProduct },
  { provider: "shopify", type: "create_product_variant", handler: shopifyCreateProductVariant },
  // Shopify 2.1 Commit 1 — REST PUT /variants/{id}.json. The only
  // net-new action gap surfaced by parity-shopify §5. Inventory
  // updates intentionally out of scope; workflow authors compose
  // update_inventory downstream (matches V1's documented boundary).
  { provider: "shopify", type: "update_product_variant", handler: shopifyUpdateProductVariant },
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
  // HubSpot 2.1 — 4 net-new actions (audit accepted PORT set).
  { provider: "hubspot", type: "remove_line_item", handler: hubspotRemoveLineItem },
  { provider: "hubspot", type: "get_line_items", handler: hubspotGetLineItems },
  { provider: "hubspot", type: "remove_from_list", handler: hubspotRemoveFromList },
  { provider: "hubspot", type: "get_products", handler: hubspotGetProducts },
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
  // Mailchimp 2.1 Commit 1 — read-tier actions.
  { provider: "mailchimp", type: "get_subscribers", handler: mailchimpGetSubscribers },
  { provider: "mailchimp", type: "get_campaign", handler: mailchimpGetCampaign },
  { provider: "mailchimp", type: "get_campaign_stats", handler: mailchimpGetCampaignStats },
  // Mailchimp 2.1 Commit 2 — unsubscribe state-change (drops V1 M-R3 dead flags).
  { provider: "mailchimp", type: "unsubscribe_subscriber", handler: mailchimpUnsubscribeSubscriber },
  { provider: "trello", type: "create_card", handler: trelloCreateCard },
  { provider: "trello", type: "update_card", handler: trelloUpdateCard },
  { provider: "trello", type: "move_card", handler: trelloMoveCard },
  { provider: "trello", type: "archive_card", handler: trelloArchiveCard },
  { provider: "trello", type: "add_comment", handler: trelloAddComment },
  { provider: "trello", type: "add_label_to_card", handler: trelloAddLabelToCard },
  { provider: "trello", type: "create_list", handler: trelloCreateList },
  { provider: "trello", type: "create_board", handler: trelloCreateBoard },
  // Eden (EDEN-4) — batch 1, all live-certified against mcp.eden.so.
  { provider: "eden", type: "list_workspaces", handler: edenListWorkspaces },
  { provider: "eden", type: "list_schedules", handler: edenListSchedules },
  { provider: "eden", type: "list_scheduled_posts", handler: edenListScheduledPosts },
  { provider: "eden", type: "create_board", handler: edenCreateBoard },
  { provider: "eden", type: "create_note", handler: edenCreateNote },
  { provider: "eden", type: "read_board", handler: edenReadBoard },
  { provider: "eden", type: "trash_board", handler: edenTrashBoard },
  // Eden (EDEN-5) — Batch 2 notes area (live-certified).
  { provider: "eden", type: "read_note", handler: edenReadNote },
  { provider: "eden", type: "append_to_note", handler: edenAppendToNote },
  { provider: "eden", type: "update_note", handler: edenUpdateNote },
  { provider: "eden", type: "rename_note", handler: edenRenameNote },
  { provider: "eden", type: "create_sticky_note", handler: edenCreateStickyNote },
  { provider: "eden", type: "list_notes", handler: edenListNotes },
  { provider: "eden", type: "search_items", handler: edenSearchItems },
  // Eden (EDEN-5) — Batch 2 boards area (live-certified).
  { provider: "eden", type: "list_boards", handler: edenListBoards },
  { provider: "eden", type: "list_board_items", handler: edenListBoardItems },
  { provider: "eden", type: "rename_board", handler: edenRenameBoard },
  { provider: "eden", type: "save_links_to_board", handler: edenSaveLinksToBoard },
  // Slice 3.DISCORD-2 — 5 V1-manifest-declared action handlers.
  // delete_message is destructive (bulk + filter modes — see handler
  // docstring). Triggers + the 18 unsurfaced V1 handlers are NOT
  // ported in this slice (Slice 3.DISCORD-1 decisions D-DC1 + D-DC3).
  { provider: "discord", type: "send_message", handler: discordSendMessage },
  { provider: "discord", type: "edit_message", handler: discordEditMessage },
  { provider: "discord", type: "delete_message", handler: discordDeleteMessage },
  { provider: "discord", type: "fetch_messages", handler: discordFetchMessages },
  { provider: "discord", type: "assign_role", handler: discordAssignRole },
  // Native-nodes Slice 1 — Tier A pure-handler ports.
  // Pure handlers: no OAuth, no integration lookup, no manifest entry.
  // Dispatched by the engine via the standard (provider, type) key.
  { provider: "native", type: "http_request", handler: nativeHttpRequest },
  // Native-nodes Slice 1 Commit 2 — text format converter
  // (HTML / Markdown / Plain / Slack Markdown). In-tree converter; no
  // turndown / no LLM / no network. See
  // docs/slices/parity/native-nodes-1-tier-a-plan.md §5.
  {
    provider: "native",
    type: "format_transformer",
    handler: nativeFormatTransformer,
  },
  // Native-nodes Slice 1 Commit 3 — narrow in-process delay (≤30s).
  // No durable / unbounded delay surface; that requires pause/resume
  // infrastructure and is deferred to Phase 6 (NPD-N6). See
  // docs/slices/parity/native-nodes-1-tier-a-plan.md §6.
  { provider: "native", type: "delay", handler: nativeDelay },
  // Native-nodes Slice 3 Commit 2 — boolean branching action backing
  // the engine's label-aware traversal. Returns branchTaken "true" /
  // "false" / null (when onFalse: "skip"). See
  // docs/slices/parity/native-nodes-3-tier-c-control-flow-plan.md §5.
  {
    provider: "native",
    type: "if_then_condition",
    handler: nativeIfThenCondition,
  },
  // Native-nodes Slice 3 Commit 3 — N-label branching action.
  // First-match-wins evaluation; returns branchTaken as the matched
  // route label, else configured defaultRoute, else null. See
  // docs/slices/parity/native-nodes-3-tier-c-control-flow-plan.md §6.
  { provider: "native", type: "router", handler: nativeRouter },
  // Slice 5.ASANA-1 — Asana first slice (5 actions).
  { provider: "asana", type: "create_task", handler: asanaCreateTask },
  { provider: "asana", type: "update_task", handler: asanaUpdateTask },
  { provider: "asana", type: "complete_task", handler: asanaCompleteTask },
  { provider: "asana", type: "add_comment_to_task", handler: asanaAddCommentToTask },
  { provider: "asana", type: "get_task", handler: asanaGetTask },
  // ASANA-2 — follow-up slice (2 actions).
  { provider: "asana", type: "create_subtask", handler: asanaCreateSubtask },
  { provider: "asana", type: "list_tasks_in_project", handler: asanaListTasksInProject },
  // TYPEFORM-2 — follow-up slice (2 read actions; completed responses only,
  // found:false lookup semantics on get_response).
  { provider: "typeform", type: "list_responses", handler: typeformListResponses },
  { provider: "typeform", type: "get_response", handler: typeformGetResponse },
  // QUICKBOOKS-1 — 3 customer + 4 invoice actions (bounded outputs,
  // found:false lookup semantics on find/get; draft-only invoice create).
  { provider: "quickbooks", type: "create_customer", handler: quickbooksCreateCustomer },
  { provider: "quickbooks", type: "find_customer", handler: quickbooksFindCustomer },
  { provider: "quickbooks", type: "get_customer", handler: quickbooksGetCustomer },
  { provider: "quickbooks", type: "create_invoice", handler: quickbooksCreateInvoice },
  { provider: "quickbooks", type: "send_invoice", handler: quickbooksSendInvoice },
  { provider: "quickbooks", type: "get_invoice", handler: quickbooksGetInvoice },
  { provider: "quickbooks", type: "list_invoices", handler: quickbooksListInvoices },
];

