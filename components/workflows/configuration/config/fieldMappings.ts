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
    from: "gmail-recent-recipients",
    to: "gmail-recent-recipients",
    labelIds: "gmail_labels",
  },
  gmail_trigger_new_attachment: {
    from: "gmail-recent-recipients",
    to: "gmail-recent-recipients",
  },
  gmail_action_send_email: {
    to: "gmail-recent-recipients",
    cc: "gmail-recent-recipients",
    bcc: "gmail-recent-recipients",
    messageId: "gmail-recent-recipients",
    labelIds: "gmail_labels",
  },
  gmail_action_add_label: {
    email: "gmail-recent-recipients",
    labelIds: "gmail_labels",
  },
  gmail_action_search_email: {
    labels: "gmail_labels",
    labelFilters: "gmail_labels",
    emailAddress: "gmail-recent-recipients",
  },
};

// Discord field mappings
const discordMappings: Record<string, FieldMapping> = {
  discord_trigger_new_message: {
    channelId: "discord_channels",
    guildId: "discord_guilds",
    authorFilter: "discord_channel_members",  // Use discord_channel_members to get members who can access the channel
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
};

// Slack field mappings
const slackMappings: Record<string, FieldMapping> = {
  slack_action_create_channel: {
    workspaceId: "slack_workspaces",
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
  },
  trello_trigger_comment_added: {
    boardId: "trello_boards",
  },
  trello_trigger_member_changed: {
    boardId: "trello_boards",
  },
  trello_action_create_card: {
    boardId: "trello_boards",
    listId: "trello_lists",
    template: "trello-card-templates",
  },
  trello_action_create_list: {
    boardId: "trello_boards",
  },
  trello_action_move_card: {
    boardId: "trello_boards",
    cardId: "trello_cards",
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
};

// Google Sheets field mappings
const googleSheetsMappings: Record<string, FieldMapping> = {
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
    folderId: "google-drive-folders",
  },
  google_drive_action_upload_file: {
    folderId: "google-drive-folders",
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
  google_docs_action_export_document: {
    documentId: "google-docs-documents",
    driveFolder: "google-drive-folders",
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
};

// Microsoft Outlook field mappings
const outlookMappings: Record<string, FieldMapping> = {
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
    channelId: "teams_channels",
  },
  "teams_action_send_message": {
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

// HubSpot field mappings
const hubspotMappings: Record<string, FieldMapping> = {
  hubspot_action_create_contact: {
    associatedCompanyId: "hubspot_companies",
    jobtitle: "hubspot_job_titles",
    department: "hubspot_departments",
    industry: "hubspot_industries",
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
};

// Default field mappings for unmapped fields
const defaultMappings: FieldMapping = {
  channelId: "channels",
  folderId: "folders",
  fileId: "files",
  documentId: "documents",
  databaseId: "databases",
  from: "gmail-recent-recipients",
  to: "gmail-recent-recipients",
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
  ...outlookMappings,
  ...teamsMappings,
  ...onenoteMappings,
  ...facebookMappings,
  ...hubspotMappings,
  default: defaultMappings,
};

/**
 * Get resource type for a field in a specific node
 */
export function getResourceTypeForField(fieldName: string, nodeType: string): string | null {
  // First check node-specific mapping
  const nodeMapping = fieldToResourceMap[nodeType];
  if (nodeMapping && nodeMapping[fieldName]) {
    return nodeMapping[fieldName];
  }

  // Fall back to default mapping
  if (fieldToResourceMap.default[fieldName]) {
    return fieldToResourceMap.default[fieldName];
  }

  // No mapping found
  return null;
}