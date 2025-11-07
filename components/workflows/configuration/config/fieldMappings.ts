import { logger } from '@/lib/utils/logger'

/**
 * Field to Resource Type Mappings
 * Maps field names to their corresponding resource types for dynamic data loading
 */

export interface FieldMapping {
  [fieldName: string]: string;
}

export interface NodeFieldMappings {
  [nodeType: string]: FieldMapping;
}

// Gmail field mappings
const gmailMappings: Record<string, FieldMapping> = {
  gmail_trigger_new_email: {
    from: "gmail-enhanced-recipients",
    to: "gmail-enhanced-recipients",
    labelIds: "gmail_labels",
  },
  gmail_trigger_new_attachment: {
    from: "gmail-enhanced-recipients",
    to: "gmail-enhanced-recipients",
  },
  gmail_action_send_email: {
    to: "gmail-enhanced-recipients",
    cc: "gmail-enhanced-recipients",
    bcc: "gmail-enhanced-recipients",
    messageId: "gmail-enhanced-recipients",
    labelIds: "gmail_labels",
  },
  gmail_action_add_label: {
    email: "gmail-enhanced-recipients",
    labelIds: "gmail_labels",
  },
  gmail_action_search_email: {
    labels: "gmail_labels",
    labelFilters: "gmail_labels",
    emailAddress: "gmail-enhanced-recipients",
  },
};

// Discord field mappings
const discordMappings: Record<string, FieldMapping> = {
  discord_trigger_new_message: {
    channelId: "discord_channels",
    guildId: "discord_guilds",
    authorFilter: "discord_channel_members", // Use discord_channel_members to get members who can access the channel
  },
  discord_trigger_member_join: {
    guildId: "discord_guilds",
    channelFilter: "discord_channels",
  },
  discord_trigger_slash_command: {
    guildId: "discord_guilds",
    command: "discord_commands",
  },
  discord_action_send_message: {
    channelId: "discord_channels",
    guildId: "discord_guilds",
  },
  discord_action_edit_message: {
    channelId: "discord_channels",
    guildId: "discord_guilds",
    messageId: "discord_messages",
  },
  discord_action_delete_message: {
    guildId: "discord_guilds",
    channelId: "discord_channels",
    userId: "discord_channel_members",
    userIds: "discord_channel_members",
    messageIds: "discord_messages",
  },
  discord_action_fetch_messages: {
    channelId: "discord_channels",
    guildId: "discord_guilds",
    filterAuthor: "discord_members",
  },
  discord_action_assign_role: {
    guildId: "discord_guilds",
    userId: "discord_members",
    roleId: "discord_roles",
  },
};

// Slack field mappings
const slackMappings: Record<string, FieldMapping> = {
  slack_action_send_message: {
    channel: "slack_channels",
  },
  slack_action_create_channel: {
    workspace: "slack_workspaces",
    addPeople: "slack_users",
  },
  slack_action_get_messages: {
    channel: "slack_channels",
  },
  slack_trigger_message_channels: {
    channel: "slack_channels",
  },
  slack_trigger_message_groups: {
    channel: "slack_channels",
  },
  slack_trigger_reaction_added: {
    channel: "slack_channels",
    emoji: "slack_emoji_catalog",
  },
  slack_trigger_reaction_removed: {
    channel: "slack_channels",
  },
  slack_trigger_member_joined_channel: {
    channel: "slack_channels",
  },
  slack_trigger_member_left_channel: {
    channel: "slack_channels",
  },
};

// Trello field mappings
const trelloMappings: Record<string, FieldMapping> = {
  trello_trigger_new_card: {
    boardId: "trello_boards",
    listId: "trello_lists",
  },
  trello_trigger_card_updated: {
    boardId: "trello_boards",
    listId: "trello_lists",
  },
  trello_trigger_card_moved: {
    boardId: "trello_boards",
    watchedLists: "trello_lists",
  },
  trello_trigger_comment_added: {
    boardId: "trello_boards",
    listId: "trello_lists",
    cardId: "trello_cards",
  },
  trello_trigger_member_changed: {
    boardId: "trello_boards",
  },
  trello_action_create_card: {
    boardId: "trello_boards",
    listId: "trello_lists",
    idMembers: "trello_board_members",
    idLabels: "trello_board_labels",
    idCardSource: "trello_all_cards",
  },
  trello_action_create_board: {
    template: "trello_board_templates",
    sourceBoardId: "trello_boards",
  },
  trello_action_create_list: {
    boardId: "trello_boards",
  },
  trello_action_move_card: {
    boardId: "trello_boards",
    cardId: "trello_cards",
    listId: "trello_lists",
  },
  trello_action_get_cards: {
    boardId: "trello_boards",
    listId: "trello_lists",
  },
};

// Google Calendar field mappings
const googleCalendarMappings: Record<string, FieldMapping> = {
  google_calendar_action_create_event: {
    calendarId: "google-calendars",
    // Note: attendees is a simple email list, doesn't need dynamic loading
    // Removed mapping to avoid dependency on Gmail integration
  },
  google_calendar_trigger_new_event: {
    calendars: "google-calendars",
  },
  google_calendar_trigger_event_updated: {
    calendars: "google-calendars",
  },
  google_calendar_trigger_event_canceled: {
    calendars: "google-calendars",
  },
};

// Google Sheets field mappings
const googleSheetsMappings: Record<string, FieldMapping> = {
  // Triggers
  google_sheets_trigger_new_row: {
    spreadsheetId: "google-sheets_spreadsheets",
    sheetName: "google-sheets_sheets",
  },
  google_sheets_trigger_new_worksheet: {
    spreadsheetId: "google-sheets_spreadsheets",
  },
  google_sheets_trigger_updated_row: {
    spreadsheetId: "google-sheets_spreadsheets",
    sheetName: "google-sheets_sheets",
  },
  // Actions
  google_sheets_unified_action: {
    spreadsheetId: "google-sheets_spreadsheets",
    sheetName: "google-sheets_sheets",
  },
  "google-sheets_action_create_row": {
    spreadsheetId: "google-sheets_spreadsheets",
    sheetName: "google-sheets_sheets",
  },
  "google-sheets_action_update_row": {
    spreadsheetId: "google-sheets_spreadsheets",
    sheetName: "google-sheets_sheets",
    matchColumn: "google-sheets_columns",
  },
  "google-sheets_action_delete_row": {
    spreadsheetId: "google-sheets_spreadsheets",
    sheetName: "google-sheets_sheets",
    matchColumn: "google-sheets_columns",
  },
  "google-sheets_action_list_rows": {
    spreadsheetId: "google-sheets_spreadsheets",
    sheetName: "google-sheets_sheets",
    filterColumn: "google-sheets_columns",
    filterValue: "google-sheets_column_values",
    sortColumn: "google-sheets_columns",
    dateColumn: "google-sheets_columns",
  },
  "google-sheets_action_export_sheet": {
    spreadsheetId: "google-sheets_spreadsheets",
    sheetName: "google-sheets_sheets",
    filterColumn: "google-sheets_columns",
    filterValue: "google-sheets_column_values",
    sortColumn: "google-sheets_columns",
    dateColumn: "google-sheets_columns",
  },
};

// Google Drive field mappings
const googleDriveMappings: Record<string, FieldMapping> = {
  "google-drive:new_file_in_folder": {
    folderId: "google-drive-folders",
  },
  "google-drive:new_folder_in_folder": {
    folderId: "google-drive-folders",
    parentFolderId: "google-drive-folders",
  },
  "google-drive:upload_file": {
    folderId: "google-drive-folders",
  },
  "google-drive:create_folder": {
    parentFolderId: "google-drive-folders",
  },
  "google-drive:create_file": {
    folderId: "google-drive-folders",
  },
  "google-drive:file_updated": {
    fileId: "google-drive-files",
  },
  google_drive_action_upload_file: {
    folderId: "google-drive-folders",
  },
  "google-drive:get_file": {
    folderId: "google-drive-folders",
    fileId: "google-drive-files",
  },
};

// Google Docs field mappings
const googleDocsMappings: Record<string, FieldMapping> = {
  google_docs_action_create_document: {
    folderId: "google-drive-folders",
  },
  google_docs_action_update_document: {
    documentId: "google-docs-documents",
  },
  google_docs_action_share_document: {
    documentId: "google-docs-documents",
  },
  google_docs_action_get_document: {
    documentId: "google-docs-documents",
  },
  google_docs_trigger_document_modified: {
    documentId: "google-docs-documents",
  },
  google_docs_trigger_document_updated: {
    documentId: "google-docs-documents",
  },
};

// Airtable field mappings
const airtableMappings: Record<string, FieldMapping> = {
  airtable_action_create_record: {
    baseId: "airtable_bases",
    tableName: "airtable_tables",
    draftName: "airtable_draft_names",
    designer: "airtable_designers",
    associatedProject: "airtable_projects",
    feedback: "airtable_feedback",
    tasks: "airtable_tasks",
  },
  airtable_action_update_record: {
    baseId: "airtable_bases",
    tableName: "airtable_tables",
  },
  airtable_action_list_records: {
    baseId: "airtable_bases",
    tableName: "airtable_tables",
    filterField: "airtable_fields",
    filterValue: "airtable_field_values",
  },
  airtable_action_find_record: {
    baseId: "airtable_bases",
    tableName: "airtable_tables",
    searchField: "airtable_fields",
  },
  airtable_trigger_new_record: {
    baseId: "airtable_bases",
    tableName: "airtable_tables",
  },
  airtable_trigger_record_updated: {
    baseId: "airtable_bases",
    tableName: "airtable_tables",
    watchedFieldIds: "airtable_fields",
  },
  airtable_trigger_table_deleted: {
    baseId: "airtable_bases",
    watchedTables: "airtable_tables",
  },
};

// Dropbox field mappings
const dropboxMappings: Record<string, FieldMapping> = {
  dropbox_action_upload_file: {
    path: "dropbox-folders",
  },
  dropbox_trigger_new_file: {
    path: "dropbox-folders",
  },
  dropbox_action_get_file: {
    path: "dropbox-folders",
    filePath: "dropbox-files",
  },
};

// Microsoft Outlook field mappings
const outlookMappings: Record<string, FieldMapping> = {
  "microsoft-outlook_trigger_new_email": {
    from: "outlook-enhanced-recipients",
    folder: "outlook_folders",
  },
  "microsoft-outlook_trigger_email_sent": {
    to: "outlook-enhanced-recipients",
  },
  "microsoft-outlook_action_send_email": {
    to: "outlook-enhanced-recipients",
    cc: "outlook-enhanced-recipients",
    bcc: "outlook-enhanced-recipients",
  },
  "microsoft-outlook_action_forward_email": {
    to: "outlook-enhanced-recipients",
    cc: "outlook-enhanced-recipients",
    bcc: "outlook-enhanced-recipients",
    messageId: "outlook_messages",
  },
  "microsoft-outlook_action_create_meeting": {
    attendees: "outlook-enhanced-recipients",
  },
  "microsoft-outlook_action_create_calendar_event": {
    attendees: "outlook-enhanced-recipients",
    calendarId: "outlook_calendars",
  },
  "microsoft-outlook_action_add_folder": {
    messageId: "outlook_messages",
    folderId: "outlook_folders",
  },
  "microsoft-outlook_action_archive_email": {
    messageId: "outlook_messages",
  },
  "microsoft-outlook_action_search_email": {
    folderId: "outlook_folders",
  },
  "microsoft-outlook_action_move_email": {
    messageId: "outlook_messages",
    sourceFolderId: "outlook_folders",
    destinationFolderId: "outlook_folders",
  },
  "microsoft-outlook_action_mark_as_read": {
    messageId: "outlook_messages",
  },
  "microsoft-outlook_action_mark_as_unread": {
    messageId: "outlook_messages",
  },
  "microsoft-outlook_action_reply_to_email": {
    messageId: "outlook_messages",
  },
  "microsoft-outlook_action_fetch_emails": {
    folderId: "outlook_folders",
  },
  "microsoft-outlook_action_get_calendar_events": {
    calendarId: "outlook_calendars",
  },
};

// Microsoft Teams field mappings
const teamsMappings: Record<string, FieldMapping> = {
  "teams_trigger_new_message": {
    teamId: "teams_teams",
    channelId: "teams_channels",
  },
  "teams_action_send_message": {
    teamId: "teams_teams",
    channelId: "teams_channels",
  },
  "teams_action_send_chat_message": {
    chatId: "teams_chats",
  },
  "teams_action_create_channel": {
    teamId: "teams_teams",
  },
  "teams_action_add_member_to_team": {
    teamId: "teams_teams",
    userEmail: "outlook-enhanced-recipients",
  },
  "teams_action_send_adaptive_card": {
    teamId: "teams_teams",
    channelId: "teams_channels",
  },
  "teams_action_get_team_members": {
    teamId: "teams_teams",
  },
  "teams_trigger_user_joins_team": {
    teamId: "teams_teams",
  },
  "microsoft-teams_action_add_team_member": {
    userEmail: "outlook-enhanced-recipients",
    teamId: "teams_teams",
  },
};

// Microsoft OneNote field mappings
const onenoteMappings: Record<string, FieldMapping> = {
  "microsoft-onenote_action_create_page": {
    notebookId: "onenote_notebooks",
    sectionId: "onenote_sections",
  },
  "microsoft-onenote_action_create_section": {
    notebookId: "onenote_notebooks",
  },
  "microsoft-onenote_action_update_page": {
    notebookId: "onenote_notebooks",
    sectionId: "onenote_sections",
    pageId: "onenote_pages",
  },
  "microsoft-onenote_action_get_page_content": {
    notebookId: "onenote_notebooks",
    sectionId: "onenote_sections",
    pageId: "onenote_pages",
  },
  "microsoft-onenote_action_get_pages": {
    notebookId: "onenote_notebooks",
    sectionId: "onenote_sections",
  },
  "microsoft-onenote_action_copy_page": {
    sourceNotebookId: "onenote_notebooks",
    sourceSectionId: "onenote_sections",
    sourcePageId: "onenote_pages",
    targetNotebookId: "onenote_notebooks",
    targetSectionId: "onenote_sections",
  },
  "microsoft-onenote_action_search": {
    notebookId: "onenote_notebooks",
    sectionId: "onenote_sections",
  },
  "microsoft-onenote_action_delete_page": {
    notebookId: "onenote_notebooks",
    sectionId: "onenote_sections",
    pageId: "onenote_pages",
  },
};

// OneDrive field mappings
const onedriveMappings: Record<string, FieldMapping> = {
  "onedrive_action_upload_file": {
    folderId: "onedrive-folders",
  },
  "onedrive_trigger_new_file": {
    folderId: "onedrive-folders",
  },
  "onedrive_trigger_file_modified": {
    folderId: "onedrive-folders",
    fileId: "onedrive-files",
  },
  "onedrive_action_get_file": {
    folderId: "onedrive-folders",
    fileId: "onedrive-files",
  },
};

// Microsoft Excel field mappings
const microsoftExcelMappings: Record<string, FieldMapping> = {
  "microsoft_excel_unified_action": {
    workbookId: "microsoft-excel_workbooks",
    worksheetName: "microsoft-excel_worksheets",
    columnMapping: "microsoft_excel_column_mapper",
    dataPreview: "microsoft_excel_data_preview",
    updateColumn: "microsoft-excel_columns",
    updateValue: "microsoft-excel_column_values",
    matchColumn: "microsoft-excel_columns",
    deleteColumn: "microsoft-excel_columns",
    deleteValue: "microsoft-excel_column_values",
    filterColumn: "microsoft-excel_columns",
    filterValue: "microsoft-excel_column_values",
    sortColumn: "microsoft-excel_columns",
  },
  "microsoft-excel_action_export_sheet": {
    workbookId: "microsoft-excel_workbooks",
    worksheetName: "microsoft-excel_worksheets",
    filterColumn: "microsoft-excel_columns",
    filterValue: "microsoft-excel_column_values",
    sortColumn: "microsoft-excel_columns",
    dateColumn: "microsoft-excel_columns",
  },
  "microsoft_excel_action_create_workbook": {
    folderPath: "microsoft-excel_folders",
  },
  "microsoft_excel_trigger_new_row": {
    workbookId: "microsoft-excel_workbooks",
    worksheetName: "microsoft-excel_worksheets",
  },
  "microsoft_excel_trigger_new_worksheet": {
    workbookId: "microsoft-excel_workbooks",
  },
  "microsoft_excel_trigger_updated_row": {
    workbookId: "microsoft-excel_workbooks",
    worksheetName: "microsoft-excel_worksheets",
  },
};

// Facebook field mappings
const facebookMappings: Record<string, FieldMapping> = {
  facebook_action_create_post: {
    pageId: "facebook_pages",
    shareToGroups: "facebook_groups",
  },
  facebook_action_get_page_insights: {
    pageId: "facebook_pages",
  },
  facebook_action_send_message: {
    pageId: "facebook_pages",
    recipientId: "facebook_conversations",
  },
  facebook_action_comment_on_post: {
    pageId: "facebook_pages",
    postId: "facebook_posts",
  },
};

// Box field mappings
const boxMappings: Record<string, FieldMapping> = {
  box_action_get_file: {
    folderId: "box-folders",
    fileId: "box-files",
  },
  box_action_upload_file: {
    path: "box-folders",
  },
};

// Mailchimp field mappings
const mailchimpMappings: Record<string, FieldMapping> = {
  mailchimp_action_get_subscribers: {
    audience_id: "mailchimp_audiences",
  },
  mailchimp_action_add_subscriber: {
    audience_id: "mailchimp_audiences",
  },
  mailchimp_action_update_subscriber: {
    audience_id: "mailchimp_audiences",
  },
  mailchimp_action_remove_subscriber: {
    audience_id: "mailchimp_audiences",
  },
  mailchimp_action_add_tag: {
    audience_id: "mailchimp_audiences",
  },
  mailchimp_action_remove_tag: {
    audience_id: "mailchimp_audiences",
  },
  mailchimp_action_create_campaign: {
    audience_id: "mailchimp_audiences",
  },
  mailchimp_action_send_campaign: {
    campaign_id: "mailchimp_campaigns",
  },
};

// Monday.com field mappings
const mondayMappings: Record<string, FieldMapping> = {
  monday_action_create_item: {
    boardId: "monday_boards",
    groupId: "monday_groups",
  },
  monday_action_update_item: {
    boardId: "monday_boards",
    itemId: "monday_items",
  },
  monday_action_create_update: {
    itemId: "monday_items",
  },
  monday_trigger_new_item: {
    boardId: "monday_boards",
  },
  monday_trigger_new_board: {},
  monday_trigger_column_changed: {
    boardId: "monday_boards",
    columnId: "monday_columns",
  },
};

// HubSpot field mappings
const hubspotMappings: Record<string, FieldMapping> = {
  hubspot_action_create_contact: {
    associatedCompanyId: "hubspot_companies",
    jobtitle: "hubspot_job_titles",
    department: "hubspot_departments",
    industry: "hubspot_industries",
    hs_lead_status: "hubspot_lead_status_options",
    favorite_content_topics: "hubspot_content_topics_options",
    preferred_channels: "hubspot_preferred_channels_options",
  },
  hubspot_action_create_deal: {
    associatedContactId: "hubspot_contacts",
    associatedCompanyId: "hubspot_companies",
  },
  hubspot_action_add_contact_to_list: {
    listId: "hubspot_lists",
  },
  hubspot_action_update_deal: {
    dealId: "hubspot_deals",
  },
  // Dynamic HubSpot object actions
  hubspot_action_create_object: {
    objectType: "hubspot_objects",
    properties: "hubspot_object_properties", // Dynamic based on objectType
  },
  hubspot_action_update_object: {
    objectType: "hubspot_objects",
    recordId: "hubspot_object_records", // Dynamic based on objectType
    properties: "hubspot_object_properties", // Dynamic based on objectType
  },
  hubspot_action_upsert_object: {
    objectType: "hubspot_objects",
    identifierProperty: "hubspot_object_identifier_properties", // Dynamic based on objectType
    properties: "hubspot_object_properties", // Dynamic based on objectType
  },
};

// AI Agent field mappings
const aiMappings: Record<string, FieldMapping> = {
  ai_agent: {
    inputNodeId: "previous_nodes",
    memoryIntegration: "connected_integrations",
    customMemoryIntegrations: "connected_integrations",
  },
};

// Notion field mappings
const notionMappings: Record<string, FieldMapping> = {
  notion_action_retrieve_page: {
    workspace: "notion_workspaces",
    page: "notion_pages",
  },
  notion_action_archive_page: {
    workspace: "notion_workspaces",
    page_id: "notion_pages",
  },
  notion_action_query_database: {
    workspace: "notion_workspaces",
    database_id: "notion_databases",
  },
  notion_action_update_database: {
    workspace: "notion_workspaces",
    database_id: "notion_databases",
  },
  notion_action_append_blocks: {
    workspace: "notion_workspaces",
    page_id: "notion_pages",
    after: "notion_page_blocks",
  },
  notion_action_update_block: {
    workspace: "notion_workspaces",
    page_id: "notion_pages",
    block_id: "notion_page_blocks",
  },
  notion_action_delete_block: {
    workspace: "notion_workspaces",
    page_id: "notion_pages",
    block_id: "notion_page_blocks",
  },
  notion_action_retrieve_block_children: {
    block_id: "notion_blocks",
  },
  notion_action_list_users: {
    workspace: "notion_workspaces",
  },
  notion_action_retrieve_user: {
    workspace: "notion_workspaces",
    user_id: "notion_users",
  },
  notion_action_create_comment: {
    workspace: "notion_workspaces",
    page_id: "notion_pages",
    parent_id: "notion_blocks",
  },
  notion_action_retrieve_comments: {
    block_id: "notion_blocks",
  },
  notion_action_search: {
    workspace: "notion_workspaces",
  },
  notion_action_duplicate_page: {
    workspace: "notion_workspaces",
    source_page_id: "notion_pages",
    destination_page_id: "notion_pages",
    destination_database_id: "notion_databases",
  },
  notion_action_sync_database_entries: {
    workspace: "notion_workspaces",
    database_id: "notion_databases",
  },
  // Deprecated - replaced by notion_action_manage_page
  // notion_action_update_page: {
  //   workspace: "notion_workspaces",
  //   page: "notion_pages",
  // },
  notion_action_search_pages: {
    filter: "notion_filter_types",
  },
  // Simple create page action (for backwards compatibility with templates)
  notion_action_create_page: {
    databaseId: "notion_databases",
  },
  // Deprecated - replaced by notion_action_manage_page
  // notion_action_append_to_page: {
  //   workspace: "notion_workspaces",
  //   page: "notion_pages",
  // },
  // Deprecated - replaced by notion_action_manage_database
  // notion_action_create_database: {
  //   workspace: "notion_workspaces",
  //   template: "notion_database_templates",
  // },

  // Unified Notion actions
  notion_action_manage_page: {
    workspace: "notion_workspaces",
    page: "notion_pages",
    database: "notion_databases",
    parentDatabase: "notion_databases",
    parentPage: "notion_pages",
    destinationPage: "notion_pages",
    pageFields: "notion_page_blocks",
  },
  notion_action_manage_database: {
    workspace: "notion_workspaces",
    database: "notion_databases",
  },
  notion_action_manage_users: {
    workspace: "notion_workspaces",
    userId: "notion_users",
  },
  notion_action_manage_comments: {
    workspace: "notion_workspaces",
    page: "notion_pages",
  },
  notion_action_search: {
    workspace: "notion_workspaces",
  },
  notion_action_get_page_details: {
    workspace: "notion_workspaces",
    page: "notion_pages",
  },
  notion_action_manage_users: {
    workspace: "notion_workspaces",
    userId: "notion_users",
  },
  notion_action_manage_comments: {
    workspace: "notion_workspaces",
    page: "notion_pages",
  },
};

// HITL (Human-in-the-Loop) field mappings
const hitlMappings: Record<string, FieldMapping> = {
  hitl_conversation: {
    discordGuildId: "discord_guilds",
    discordChannelId: "discord_channels",
  },
};

// GitHub field mappings
const githubMappings: Record<string, FieldMapping> = {
  github_action_create_issue: {
    repository: "github_repositories",
    assignees: "github_assignees",
    labels: "github_labels",
    milestone: "github_milestones",
  },
};

// Twitter field mappings
const twitterMappings: Record<string, FieldMapping> = {
  twitter_action_reply_to_tweet: {
    tweetId: "twitter_mentions",
  },
  twitter_trigger_search_match: {},
  twitter_trigger_user_tweet: {},
};

// Default field mappings for unmapped fields
const defaultMappings: FieldMapping = {
  channelId: "channels",
  folderId: "folders",
  fileId: "files",
  documentId: "documents",
  databaseId: "databases",
  from: "gmail-enhanced-recipients",
  to: "gmail-enhanced-recipients",
  // Removed attendees mapping - it shouldn't default to Gmail
  // attendees fields should be simple text inputs for email addresses
  labelIds: "gmail_labels",
};

// Combine all mappings
export const fieldToResourceMap: NodeFieldMappings = {
  ...gmailMappings,
  ...discordMappings,
  ...slackMappings,
  ...trelloMappings,
  ...googleCalendarMappings,
  ...googleSheetsMappings,
  ...googleDriveMappings,
  ...googleDocsMappings,
  ...airtableMappings,
  ...dropboxMappings,
  ...outlookMappings,
  ...teamsMappings,
  ...onenoteMappings,
  ...onedriveMappings,
  ...microsoftExcelMappings,
  ...facebookMappings,
  ...boxMappings,
  ...mailchimpMappings,
  ...mondayMappings,
  ...hubspotMappings,
  ...notionMappings,
  ...aiMappings,
  ...hitlMappings,
  ...githubMappings,
  ...twitterMappings,
  default: defaultMappings,
};

/**
 * Get resource type for a field in a specific node
 */
export function getResourceTypeForField(fieldName: string, nodeType: string): string | null {
  // Debug logging for Trello template field
  if (fieldName === 'template' && nodeType?.includes('trello')) {
    logger.debug('[FieldMapping] Checking Trello template field:', { fieldName, nodeType });
  }

  // First check node-specific mapping
  const nodeMapping = fieldToResourceMap[nodeType];
  if (nodeMapping && nodeMapping[fieldName]) {
    const resourceType = nodeMapping[fieldName];
    if (fieldName === 'template') {
      logger.debug('[FieldMapping] Found resource type for template:', resourceType);
    }
    return resourceType;
  }

  // Fall back to default mapping
  if (fieldToResourceMap.default[fieldName]) {
    return fieldToResourceMap.default[fieldName];
  }

  // No mapping found
  if (fieldName === 'template') {
    logger.debug('[FieldMapping] No resource type found for template field in:', nodeType);
  }
  return null;
}
