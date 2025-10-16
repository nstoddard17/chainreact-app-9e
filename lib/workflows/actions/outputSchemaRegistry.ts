/**
 * Output Schema Registry
 * Central registry for action output schemas
 * This is the single source of truth for what variables are available from each action
 */

import { OutputField, getNotionManagePageSchema, getNotionManageDatabaseSchema, getNotionManageUsersSchema } from './notion/schemas'

export type { OutputField }

/**
 * Function to get output schema for a given action type and config
 * Returns the schema that describes what outputs will be available
 */
export function getActionOutputSchema(actionType: string, config?: any): OutputField[] {
  // Handle Notion unified actions with dynamic schemas based on operation
  if (actionType === 'notion_action_manage_page') {
    return getNotionManagePageSchema(config?.operation)
  }

  if (actionType === 'notion_action_manage_database') {
    return getNotionManageDatabaseSchema(config?.operation)
  }

  if (actionType === 'notion_action_manage_users') {
    return getNotionManageUsersSchema(config?.operation)
  }

  // Fallback to static registry for other actions
  const schema = OUTPUT_SCHEMA_REGISTRY[actionType]
  return schema || []
}

/**
 * Static output schema registry for all actions
 * For actions with static outputs (not dependent on configuration)
 */
const OUTPUT_SCHEMA_REGISTRY: Record<string, OutputField[]> = {
  // Discord Trigger
  'discord_trigger_new_message': [
    { name: 'messageId', label: 'Message ID', type: 'string' },
    { name: 'content', label: 'Content', type: 'string' },
    { name: 'authorId', label: 'Author ID', type: 'string' },
    { name: 'authorName', label: 'Author Name', type: 'string' },
    { name: 'channelId', label: 'Channel ID', type: 'string' },
    { name: 'channelName', label: 'Channel Name', type: 'string' },
    { name: 'guildId', label: 'Guild ID', type: 'string' },
    { name: 'guildName', label: 'Guild Name', type: 'string' },
    { name: 'timestamp', label: 'Timestamp', type: 'string' },
    { name: 'attachments', label: 'Attachments', type: 'array' },
    { name: 'mentions', label: 'Mentions', type: 'array' }
  ],

  // Discord Actions
  'discord_action_send_message': [
    { name: 'messageId', label: 'Message ID', type: 'string' },
    { name: 'content', label: 'Content', type: 'string' },
    { name: 'channelName', label: 'Channel Name', type: 'string' }
  ],
  'discord_action_add_reaction': [
    { name: 'success', label: 'Success', type: 'boolean' },
    { name: 'messageId', label: 'Message ID', type: 'string' }
  ],

  // Gmail Actions
  'gmail_action_send_email': [
    { name: 'messageId', label: 'Message ID', type: 'string' },
    { name: 'subject', label: 'Subject', type: 'string' }
  ],
  'gmail_action_reply_email': [
    { name: 'messageId', label: 'Message ID', type: 'string' },
    { name: 'subject', label: 'Subject', type: 'string' }
  ],
  'gmail_action_search_email': [
    { name: 'emails', label: 'Emails', type: 'array' },
    { name: 'count', label: 'Count', type: 'number' },
    { name: 'from', label: 'From', type: 'string' },
    { name: 'subject', label: 'Subject', type: 'string' },
    { name: 'body', label: 'Body', type: 'string' },
    { name: 'attachments', label: 'Attachments', type: 'array' }
  ],

  // Slack Actions
  'slack_action_send_message': [
    { name: 'messageId', label: 'Message ID', type: 'string' },
    { name: 'text', label: 'Text', type: 'string' },
    { name: 'channel', label: 'Channel', type: 'string' }
  ],

  // AI/OpenAI
  'openai_action_chat_completion': [
    { name: 'response', label: 'Response', type: 'string' },
    { name: 'usage', label: 'Usage', type: 'object' }
  ],
  'ai_agent': [
    { name: 'output', label: 'Output', type: 'string' }
  ],
  'ai_message': [
    { name: 'output', label: 'Output', type: 'string' },
    { name: 'structured_output', label: 'Structured Output', type: 'object' }
  ],

  // GitHub Actions
  'github_action_create_issue': [
    { name: 'issueId', label: 'Issue ID', type: 'string' },
    { name: 'title', label: 'Title', type: 'string' },
    { name: 'url', label: 'URL', type: 'string' }
  ],

  // Trello Actions
  'trello_action_create_card': [
    { name: 'cardId', label: 'Card ID', type: 'string' },
    { name: 'name', label: 'Name', type: 'string' },
    { name: 'url', label: 'URL', type: 'string' }
  ],
  'trello_action_move_card': [
    { name: 'cardId', label: 'Card ID', type: 'string' },
    { name: 'listName', label: 'List Name', type: 'string' }
  ],

  // HubSpot Actions
  'hubspot_action_create_contact': [
    { name: 'contactId', label: 'Contact ID', type: 'string' },
    { name: 'email', label: 'Email', type: 'string' }
  ],

  // Webhook
  'webhook_trigger': [
    { name: 'body', label: 'Body', type: 'object' },
    { name: 'headers', label: 'Headers', type: 'object' },
    { name: 'method', label: 'Method', type: 'string' }
  ],
  'webhook_action': [
    { name: 'response', label: 'Response', type: 'object' },
    { name: 'statusCode', label: 'Status Code', type: 'number' }
  ],

  // Google Sheets Actions
  'google_sheets_action_add_row': [
    { name: 'rowId', label: 'Row ID', type: 'string' },
    { name: 'values', label: 'Values', type: 'array' }
  ],
  'google_sheets_action_read_data': [
    { name: 'data', label: 'Data', type: 'array' },
    { name: 'range', label: 'Range', type: 'string' }
  ],

  // Google Calendar Actions
  'google_calendar_action_create_event': [
    { name: 'eventId', label: 'Event ID', type: 'string' },
    { name: 'htmlLink', label: 'Event Link', type: 'string' },
    { name: 'start', label: 'Start Time', type: 'string' },
    { name: 'end', label: 'End Time', type: 'string' },
    { name: 'meetLink', label: 'Meet Link', type: 'string' }
  ],

  // Microsoft/Outlook Actions
  'outlook_action_send_email': [
    { name: 'messageId', label: 'Message ID', type: 'string' },
    { name: 'subject', label: 'Subject', type: 'string' }
  ],

  // ==================== TRIGGERS ====================

  // Airtable Triggers
  'airtable_trigger_new_record': [
    { name: 'baseId', label: 'Base ID', type: 'string' },
    { name: 'tableId', label: 'Table ID', type: 'string' },
    { name: 'tableName', label: 'Table Name', type: 'string' },
    { name: 'recordId', label: 'Record ID', type: 'string' },
    { name: 'fields', label: 'Fields', type: 'object' },
    { name: 'createdAt', label: 'Created At', type: 'string' },
    { name: 'recordBatch', label: 'Record Batch', type: 'array' }
  ],
  'airtable_trigger_record_updated': [
    { name: 'baseId', label: 'Base ID', type: 'string' },
    { name: 'tableId', label: 'Table ID', type: 'string' },
    { name: 'tableName', label: 'Table Name', type: 'string' },
    { name: 'recordId', label: 'Record ID', type: 'string' },
    { name: 'changedFields', label: 'Current Values', type: 'object' },
    { name: 'previousValues', label: 'Previous Values', type: 'object' },
    { name: 'updatedAt', label: 'Updated At', type: 'string' },
    { name: 'recordBatch', label: 'Record Batch', type: 'array' }
  ],
  'airtable_trigger_table_deleted': [
    { name: 'baseId', label: 'Base ID', type: 'string' },
    { name: 'tableId', label: 'Table ID', type: 'string' },
    { name: 'deletedAt', label: 'Deleted At', type: 'string' }
  ],

  // Discord Triggers
  'discord_trigger_member_join': [
    { name: 'memberId', label: 'Member ID', type: 'string' },
    { name: 'memberTag', label: 'Member Tag', type: 'string' },
    { name: 'memberUsername', label: 'Username', type: 'string' },
    { name: 'memberDiscriminator', label: 'Discriminator', type: 'string' },
    { name: 'memberAvatar', label: 'Avatar Hash', type: 'string' },
    { name: 'guildId', label: 'Server ID', type: 'string' },
    { name: 'guildName', label: 'Server Name', type: 'string' },
    { name: 'joinedAt', label: 'Join Time', type: 'string' },
    { name: 'inviteCode', label: 'Invite Code', type: 'string' },
    { name: 'inviteUrl', label: 'Invite URL', type: 'string' },
    { name: 'inviterTag', label: 'Inviter Tag', type: 'string' },
    { name: 'inviterId', label: 'Inviter ID', type: 'string' },
    { name: 'inviteUses', label: 'Invite Uses', type: 'number' },
    { name: 'inviteMaxUses', label: 'Invite Max Uses', type: 'number' },
    { name: 'timestamp', label: 'Event Time', type: 'string' }
  ],
  'discord_trigger_slash_command': [
    { name: 'commandName', label: 'Command Name', type: 'string' },
    { name: 'userId', label: 'User ID', type: 'string' },
    { name: 'userName', label: 'User Name', type: 'string' },
    { name: 'channelId', label: 'Channel ID', type: 'string' },
    { name: 'channelName', label: 'Channel Name', type: 'string' },
    { name: 'guildId', label: 'Server ID', type: 'string' },
    { name: 'guildName', label: 'Server Name', type: 'string' },
    { name: 'options', label: 'Command Options', type: 'object' },
    { name: 'timestamp', label: 'Command Time', type: 'string' }
  ],

  // Gmail Triggers (with webhook implementation)
  'gmail_trigger_new_email': [
    { name: 'id', label: 'Email ID', type: 'string' },
    { name: 'threadId', label: 'Thread ID', type: 'string' },
    { name: 'from', label: 'From', type: 'string' },
    { name: 'to', label: 'To', type: 'string' },
    { name: 'subject', label: 'Subject', type: 'string' },
    { name: 'body', label: 'Body', type: 'string' },
    { name: 'snippet', label: 'Snippet', type: 'string' },
    { name: 'attachments', label: 'Attachments', type: 'array' },
    { name: 'receivedAt', label: 'Received At', type: 'string' }
  ],

  // HubSpot Triggers
  'hubspot_trigger_contact_created': [
    { name: 'contactId', label: 'Contact ID', type: 'string' },
    { name: 'email', label: 'Email', type: 'string' },
    { name: 'firstName', label: 'First Name', type: 'string' },
    { name: 'lastName', label: 'Last Name', type: 'string' },
    { name: 'company', label: 'Company', type: 'string' },
    { name: 'phone', label: 'Phone', type: 'string' },
    { name: 'hubspotOwner', label: 'HubSpot Owner', type: 'string' },
    { name: 'lifecycleStage', label: 'Lifecycle Stage', type: 'string' },
    { name: 'leadStatus', label: 'Lead Status', type: 'string' },
    { name: 'createDate', label: 'Create Date', type: 'string' },
    { name: 'portalId', label: 'Portal ID', type: 'string' }
  ],
  'hubspot_trigger_contact_deleted': [
    { name: 'contactId', label: 'Contact ID', type: 'string' },
    { name: 'email', label: 'Email', type: 'string' },
    { name: 'firstName', label: 'First Name', type: 'string' },
    { name: 'lastName', label: 'Last Name', type: 'string' },
    { name: 'deleteTimestamp', label: 'Delete Timestamp', type: 'string' },
    { name: 'portalId', label: 'Portal ID', type: 'string' }
  ],
  'hubspot_trigger_contact_updated': [
    { name: 'contactId', label: 'Contact ID', type: 'string' },
    { name: 'propertyName', label: 'Property Name', type: 'string' },
    { name: 'propertyValue', label: 'New Property Value', type: 'string' },
    { name: 'previousValue', label: 'Previous Value', type: 'string' },
    { name: 'email', label: 'Email', type: 'string' },
    { name: 'firstName', label: 'First Name', type: 'string' },
    { name: 'lastName', label: 'Last Name', type: 'string' },
    { name: 'company', label: 'Company', type: 'string' },
    { name: 'updateTimestamp', label: 'Update Timestamp', type: 'string' },
    { name: 'portalId', label: 'Portal ID', type: 'string' }
  ],
  'hubspot_trigger_company_created': [
    { name: 'companyId', label: 'Company ID', type: 'string' },
    { name: 'name', label: 'Company Name', type: 'string' },
    { name: 'domain', label: 'Website Domain', type: 'string' },
    { name: 'industry', label: 'Industry', type: 'string' },
    { name: 'city', label: 'City', type: 'string' },
    { name: 'state', label: 'State', type: 'string' },
    { name: 'country', label: 'Country', type: 'string' },
    { name: 'numberOfEmployees', label: 'Number of Employees', type: 'string' },
    { name: 'annualRevenue', label: 'Annual Revenue', type: 'string' },
    { name: 'hubspotOwner', label: 'HubSpot Owner', type: 'string' },
    { name: 'createDate', label: 'Create Date', type: 'string' },
    { name: 'portalId', label: 'Portal ID', type: 'string' }
  ],
  'hubspot_trigger_company_deleted': [
    { name: 'companyId', label: 'Company ID', type: 'string' },
    { name: 'name', label: 'Company Name', type: 'string' },
    { name: 'domain', label: 'Website Domain', type: 'string' },
    { name: 'deleteTimestamp', label: 'Delete Timestamp', type: 'string' },
    { name: 'portalId', label: 'Portal ID', type: 'string' }
  ],
  'hubspot_trigger_company_updated': [
    { name: 'companyId', label: 'Company ID', type: 'string' },
    { name: 'propertyName', label: 'Property Name', type: 'string' },
    { name: 'propertyValue', label: 'New Property Value', type: 'string' },
    { name: 'previousValue', label: 'Previous Value', type: 'string' },
    { name: 'name', label: 'Company Name', type: 'string' },
    { name: 'domain', label: 'Website Domain', type: 'string' },
    { name: 'updateTimestamp', label: 'Update Timestamp', type: 'string' },
    { name: 'portalId', label: 'Portal ID', type: 'string' }
  ],
  'hubspot_trigger_deal_created': [
    { name: 'dealId', label: 'Deal ID', type: 'string' },
    { name: 'dealName', label: 'Deal Name', type: 'string' },
    { name: 'amount', label: 'Deal Amount', type: 'string' },
    { name: 'dealStage', label: 'Deal Stage', type: 'string' },
    { name: 'pipeline', label: 'Pipeline', type: 'string' },
    { name: 'closeDate', label: 'Close Date', type: 'string' },
    { name: 'dealType', label: 'Deal Type', type: 'string' },
    { name: 'hubspotOwner', label: 'HubSpot Owner', type: 'string' },
    { name: 'associatedContacts', label: 'Associated Contacts', type: 'array' },
    { name: 'associatedCompanies', label: 'Associated Companies', type: 'array' },
    { name: 'createDate', label: 'Create Date', type: 'string' },
    { name: 'portalId', label: 'Portal ID', type: 'string' }
  ],
  'hubspot_trigger_deal_deleted': [
    { name: 'dealId', label: 'Deal ID', type: 'string' },
    { name: 'dealName', label: 'Deal Name', type: 'string' },
    { name: 'amount', label: 'Deal Amount', type: 'string' },
    { name: 'dealStage', label: 'Deal Stage', type: 'string' },
    { name: 'deleteTimestamp', label: 'Delete Timestamp', type: 'string' },
    { name: 'portalId', label: 'Portal ID', type: 'string' }
  ],
  'hubspot_trigger_deal_updated': [
    { name: 'dealId', label: 'Deal ID', type: 'string' },
    { name: 'propertyName', label: 'Property Name', type: 'string' },
    { name: 'propertyValue', label: 'New Property Value', type: 'string' },
    { name: 'previousValue', label: 'Previous Value', type: 'string' },
    { name: 'dealName', label: 'Deal Name', type: 'string' },
    { name: 'amount', label: 'Deal Amount', type: 'string' },
    { name: 'dealStage', label: 'Deal Stage', type: 'string' },
    { name: 'pipeline', label: 'Pipeline', type: 'string' },
    { name: 'updateTimestamp', label: 'Update Timestamp', type: 'string' },
    { name: 'portalId', label: 'Portal ID', type: 'string' }
  ],

  // Microsoft/Outlook Triggers
  'microsoft-outlook_trigger_new_email': [
    { name: 'id', label: 'Email ID', type: 'string' },
    { name: 'conversationId', label: 'Conversation ID', type: 'string' },
    { name: 'from', label: 'From', type: 'object' },
    { name: 'to', label: 'To', type: 'array' },
    { name: 'cc', label: 'CC', type: 'array' },
    { name: 'bcc', label: 'BCC', type: 'array' },
    { name: 'subject', label: 'Subject', type: 'string' },
    { name: 'body', label: 'Body', type: 'string' },
    { name: 'bodyPreview', label: 'Body Preview', type: 'string' },
    { name: 'attachments', label: 'Attachments', type: 'array' },
    { name: 'receivedDateTime', label: 'Received At', type: 'string' },
    { name: 'importance', label: 'Importance', type: 'string' },
    { name: 'isRead', label: 'Is Read', type: 'boolean' },
    { name: 'hasAttachments', label: 'Has Attachments', type: 'boolean' },
    { name: 'folder', label: 'Folder', type: 'string' }
  ],
  'microsoft-outlook_trigger_email_sent': [
    { name: 'id', label: 'Email ID', type: 'string' },
    { name: 'conversationId', label: 'Conversation ID', type: 'string' },
    { name: 'from', label: 'From', type: 'object' },
    { name: 'to', label: 'To', type: 'array' },
    { name: 'cc', label: 'CC', type: 'array' },
    { name: 'bcc', label: 'BCC', type: 'array' },
    { name: 'subject', label: 'Subject', type: 'string' },
    { name: 'body', label: 'Body', type: 'string' },
    { name: 'bodyPreview', label: 'Body Preview', type: 'string' },
    { name: 'attachments', label: 'Attachments', type: 'array' },
    { name: 'sentDateTime', label: 'Sent At', type: 'string' },
    { name: 'importance', label: 'Importance', type: 'string' },
    { name: 'hasAttachments', label: 'Has Attachments', type: 'boolean' }
  ],

  // Notion Triggers
  'notion_trigger_new_page': [
    { name: 'pageId', label: 'Page ID', type: 'string' },
    { name: 'databaseId', label: 'Database ID', type: 'string' },
    { name: 'title', label: 'Title', type: 'string' },
    { name: 'url', label: 'URL', type: 'string' },
    { name: 'createdAt', label: 'Created At', type: 'string' }
  ],
  'notion_trigger_page_updated': [
    { name: 'pageId', label: 'Page ID', type: 'string' },
    { name: 'databaseId', label: 'Database ID', type: 'string' },
    { name: 'title', label: 'Title', type: 'string' },
    { name: 'changedProperties', label: 'Changed Properties', type: 'object' },
    { name: 'updatedAt', label: 'Updated At', type: 'string' },
    { name: 'url', label: 'URL', type: 'string' }
  ],
  'notion_trigger_comment_added': [
    { name: 'pageId', label: 'Page ID', type: 'string' },
    { name: 'commentId', label: 'Comment ID', type: 'string' },
    { name: 'commentText', label: 'Comment Text', type: 'string' },
    { name: 'authorId', label: 'Author ID', type: 'string' },
    { name: 'authorName', label: 'Author Name', type: 'string' },
    { name: 'createdAt', label: 'Created At', type: 'string' }
  ],

  // Slack Triggers
  'slack_trigger_message_channels': [
    { name: 'messageText', label: 'Message Text', type: 'string' },
    { name: 'userId', label: 'User ID', type: 'string' },
    { name: 'userName', label: 'User Name', type: 'string' },
    { name: 'channelId', label: 'Channel ID', type: 'string' },
    { name: 'channelName', label: 'Channel Name', type: 'string' },
    { name: 'timestamp', label: 'Timestamp', type: 'string' },
    { name: 'threadTs', label: 'Thread Timestamp', type: 'string' },
    { name: 'teamId', label: 'Workspace ID', type: 'string' }
  ],
  'slack_trigger_reaction_added': [
    { name: 'reaction', label: 'Reaction Emoji', type: 'string' },
    { name: 'userId', label: 'User ID', type: 'string' },
    { name: 'userName', label: 'User Name', type: 'string' },
    { name: 'messageUserId', label: 'Message Author ID', type: 'string' },
    { name: 'channelId', label: 'Channel ID', type: 'string' },
    { name: 'channelName', label: 'Channel Name', type: 'string' },
    { name: 'messageTimestamp', label: 'Message Timestamp', type: 'string' },
    { name: 'eventTimestamp', label: 'Reaction Timestamp', type: 'string' },
    { name: 'teamId', label: 'Workspace ID', type: 'string' }
  ],

  // Stripe Triggers
  'stripe_trigger_customer_created': [
    { name: 'customerId', label: 'Customer ID', type: 'string' },
    { name: 'email', label: 'Email', type: 'string' },
    { name: 'name', label: 'Name', type: 'string' },
    { name: 'phone', label: 'Phone', type: 'string' },
    { name: 'created', label: 'Created Date', type: 'string' },
    { name: 'metadata', label: 'Metadata', type: 'object' }
  ],
  'stripe_trigger_payment_succeeded': [
    { name: 'paymentIntentId', label: 'Payment Intent ID', type: 'string' },
    { name: 'customerId', label: 'Customer ID', type: 'string' },
    { name: 'amount', label: 'Amount', type: 'number' },
    { name: 'currency', label: 'Currency', type: 'string' },
    { name: 'status', label: 'Status', type: 'string' },
    { name: 'created', label: 'Created Date', type: 'string' },
    { name: 'metadata', label: 'Metadata', type: 'object' }
  ],
  'stripe_trigger_invoice_payment_failed': [
    { name: 'invoiceId', label: 'Invoice ID', type: 'string' },
    { name: 'customerId', label: 'Customer ID', type: 'string' },
    { name: 'subscriptionId', label: 'Subscription ID', type: 'string' },
    { name: 'amount', label: 'Amount', type: 'number' },
    { name: 'currency', label: 'Currency', type: 'string' },
    { name: 'attemptCount', label: 'Attempt Count', type: 'number' },
    { name: 'nextPaymentAttempt', label: 'Next Payment Attempt', type: 'string' },
    { name: 'failureReason', label: 'Failure Reason', type: 'string' }
  ],
  'stripe_trigger_subscription_created': [
    { name: 'subscriptionId', label: 'Subscription ID', type: 'string' },
    { name: 'customerId', label: 'Customer ID', type: 'string' },
    { name: 'status', label: 'Status', type: 'string' },
    { name: 'currentPeriodStart', label: 'Current Period Start', type: 'string' },
    { name: 'currentPeriodEnd', label: 'Current Period End', type: 'string' },
    { name: 'planId', label: 'Plan ID', type: 'string' },
    { name: 'created', label: 'Created Date', type: 'string' }
  ],
  'stripe_trigger_subscription_deleted': [
    { name: 'subscriptionId', label: 'Subscription ID', type: 'string' },
    { name: 'customerId', label: 'Customer ID', type: 'string' },
    { name: 'status', label: 'Status', type: 'string' },
    { name: 'canceledAt', label: 'Cancelled At', type: 'string' },
    { name: 'planId', label: 'Plan ID', type: 'string' },
    { name: 'reason', label: 'Cancellation Reason', type: 'string' }
  ],

  // Teams Triggers
  'teams_trigger_new_message': [
    { name: 'messageId', label: 'Message ID', type: 'string' },
    { name: 'content', label: 'Message Content', type: 'string' },
    { name: 'senderId', label: 'Sender ID', type: 'string' },
    { name: 'senderName', label: 'Sender Name', type: 'string' },
    { name: 'channelId', label: 'Channel ID', type: 'string' },
    { name: 'channelName', label: 'Channel Name', type: 'string' },
    { name: 'timestamp', label: 'Message Time', type: 'string' },
    { name: 'attachments', label: 'Attachments', type: 'array' }
  ],
  'teams_trigger_user_joins_team': [
    { name: 'userId', label: 'User ID', type: 'string' },
    { name: 'userName', label: 'User Name', type: 'string' },
    { name: 'userEmail', label: 'User Email', type: 'string' },
    { name: 'teamId', label: 'Team ID', type: 'string' },
    { name: 'teamName', label: 'Team Name', type: 'string' },
    { name: 'joinTime', label: 'Join Time', type: 'string' },
    { name: 'role', label: 'User Role', type: 'string' }
  ],

  // Trello Triggers
  'trello_trigger_new_card': [
    { name: 'boardId', label: 'Board ID', type: 'string' },
    { name: 'listId', label: 'List ID', type: 'string' },
    { name: 'cardId', label: 'Card ID', type: 'string' },
    { name: 'name', label: 'Name', type: 'string' },
    { name: 'desc', label: 'Description', type: 'string' },
    { name: 'url', label: 'URL', type: 'string' },
    { name: 'createdAt', label: 'Created At', type: 'string' }
  ],
  'trello_trigger_card_moved': [
    { name: 'boardId', label: 'Board ID', type: 'string' },
    { name: 'fromListId', label: 'From List ID', type: 'string' },
    { name: 'toListId', label: 'To List ID', type: 'string' },
    { name: 'cardId', label: 'Card ID', type: 'string' },
    { name: 'movedAt', label: 'Moved At', type: 'string' }
  ],
  'trello_trigger_card_updated': [
    { name: 'boardId', label: 'Board ID', type: 'string' },
    { name: 'listId', label: 'List ID', type: 'string' },
    { name: 'cardId', label: 'Card ID', type: 'string' },
    { name: 'changedFields', label: 'Changed Fields', type: 'object' },
    { name: 'previousValues', label: 'Previous Values', type: 'object' },
    { name: 'updatedAt', label: 'Updated At', type: 'string' }
  ],
  'trello_trigger_comment_added': [
    { name: 'boardId', label: 'Board ID', type: 'string' },
    { name: 'cardId', label: 'Card ID', type: 'string' },
    { name: 'commentId', label: 'Comment ID', type: 'string' },
    { name: 'commentText', label: 'Comment Text', type: 'string' },
    { name: 'authorId', label: 'Author ID', type: 'string' },
    { name: 'authorName', label: 'Author Name', type: 'string' },
    { name: 'createdAt', label: 'Created At', type: 'string' }
  ],
  'trello_trigger_member_changed': [
    { name: 'boardId', label: 'Board ID', type: 'string' },
    { name: 'cardId', label: 'Card ID', type: 'string' },
    { name: 'action', label: 'Action', type: 'string' },
    { name: 'memberId', label: 'Member ID', type: 'string' },
    { name: 'memberName', label: 'Member Name', type: 'string' },
    { name: 'changedAt', label: 'Changed At', type: 'string' }
  ],

  // Twitter Triggers
  'twitter_trigger_new_follower': [
    { name: 'followerId', label: 'Follower ID', type: 'string' },
    { name: 'followerUsername', label: 'Follower Username', type: 'string' },
    { name: 'followerName', label: 'Follower Name', type: 'string' },
    { name: 'followerBio', label: 'Follower Bio', type: 'string' },
    { name: 'followerProfileImage', label: 'Follower Profile Image', type: 'string' },
    { name: 'followedAt', label: 'Followed At', type: 'string' }
  ],
  'twitter_trigger_new_mention': [
    { name: 'tweetId', label: 'Tweet ID', type: 'string' },
    { name: 'tweetText', label: 'Tweet Text', type: 'string' },
    { name: 'authorId', label: 'Author ID', type: 'string' },
    { name: 'authorUsername', label: 'Author Username', type: 'string' },
    { name: 'authorName', label: 'Author Name', type: 'string' },
    { name: 'createdAt', label: 'Created At', type: 'string' },
    { name: 'retweetCount', label: 'Retweet Count', type: 'number' },
    { name: 'likeCount', label: 'Like Count', type: 'number' },
    { name: 'replyCount', label: 'Reply Count', type: 'number' }
  ],
  'twitter_trigger_new_direct_message': [
    { name: 'messageId', label: 'Message ID', type: 'string' },
    { name: 'messageText', label: 'Message Text', type: 'string' },
    { name: 'senderId', label: 'Sender ID', type: 'string' },
    { name: 'senderUsername', label: 'Sender Username', type: 'string' },
    { name: 'senderName', label: 'Sender Name', type: 'string' },
    { name: 'sentAt', label: 'Sent At', type: 'string' },
    { name: 'hasMedia', label: 'Has Media', type: 'boolean' }
  ],
  'twitter_trigger_search_match': [
    { name: 'tweetId', label: 'Tweet ID', type: 'string' },
    { name: 'tweetText', label: 'Tweet Text', type: 'string' },
    { name: 'authorId', label: 'Author ID', type: 'string' },
    { name: 'authorUsername', label: 'Author Username', type: 'string' },
    { name: 'authorName', label: 'Author Name', type: 'string' },
    { name: 'createdAt', label: 'Created At', type: 'string' },
    { name: 'retweetCount', label: 'Retweet Count', type: 'number' },
    { name: 'likeCount', label: 'Like Count', type: 'number' },
    { name: 'replyCount', label: 'Reply Count', type: 'number' },
    { name: 'hasMedia', label: 'Has Media', type: 'boolean' }
  ],
  'twitter_trigger_user_tweet': [
    { name: 'tweetId', label: 'Tweet ID', type: 'string' },
    { name: 'tweetText', label: 'Tweet Text', type: 'string' },
    { name: 'authorId', label: 'Author ID', type: 'string' },
    { name: 'authorUsername', label: 'Author Username', type: 'string' },
    { name: 'authorName', label: 'Author Name', type: 'string' },
    { name: 'createdAt', label: 'Created At', type: 'string' },
    { name: 'retweetCount', label: 'Retweet Count', type: 'number' },
    { name: 'likeCount', label: 'Like Count', type: 'number' },
    { name: 'replyCount', label: 'Reply Count', type: 'number' },
    { name: 'hasMedia', label: 'Has Media', type: 'boolean' }
  ],

  // ==================== TRIGGERS WITHOUT WEBHOOKS (TODO) ====================
  // These triggers are defined but don't have webhook handlers implemented yet.
  // Once webhook handlers are built, move their schemas above and populate with actual fields.

  'dropbox_trigger_new_file': [], // TODO: Implement webhook handler
  'facebook_trigger_new_post': [], // TODO: Implement webhook handler
  'facebook_trigger_new_comment': [], // TODO: Implement webhook handler
  'github_trigger_new_commit': [], // TODO: Implement webhook handler
  'google_calendar_trigger_new_event': [], // TODO: Implement webhook handler
  'google_calendar_trigger_event_updated': [], // TODO: Implement webhook handler
  'google_calendar_trigger_event_canceled': [], // TODO: Implement webhook handler
  'google_docs_trigger_new_document': [], // TODO: Implement webhook handler
  'google_docs_trigger_document_updated': [], // TODO: Implement webhook handler
  'google_sheets_trigger_new_row': [], // TODO: Implement webhook handler
  'google_sheets_trigger_updated_row': [], // TODO: Implement webhook handler
  'google_sheets_trigger_new_worksheet': [], // TODO: Implement webhook handler
  'gumroad_trigger_new_sale': [], // TODO: Implement webhook handler
  'gumroad_trigger_new_subscriber': [], // TODO: Implement webhook handler
  'mailchimp_trigger_new_subscriber': [], // TODO: Implement webhook handler
  'mailchimp_trigger_email_opened': [], // TODO: Implement webhook handler
  'manychat_trigger_new_subscriber': [], // TODO: Implement webhook handler
  'microsoft_excel_trigger_new_row': [], // TODO: Implement webhook handler
  'microsoft_excel_trigger_updated_row': [], // TODO: Implement webhook handler
  'microsoft_excel_trigger_new_worksheet': [], // TODO: Implement webhook handler
  'onedrive_trigger_new_file': [], // TODO: Implement webhook handler
  'onedrive_trigger_file_modified': [], // TODO: Implement webhook handler
  'stripe_trigger_new_payment': [], // TODO: Implement webhook handler (use payment_succeeded instead?)

  // Special triggers
  'manual': [], // Manual trigger has no outputs
  'schedule': [], // Schedule trigger has no dynamic outputs
  'webhook': [] // Webhook trigger outputs are fully dynamic based on incoming payload
}

/**
 * Check if an action type has a defined schema
 */
export function hasOutputSchema(actionType: string): boolean {
  // Check dynamic schemas first
  if (actionType.startsWith('notion_action_manage_')) {
    return true
  }

  // Check static registry
  return actionType in OUTPUT_SCHEMA_REGISTRY
}

/**
 * Get human-readable label for a field name
 * Fallback for when schema doesn't exist
 */
export function humanizeFieldName(fieldName: string): string {
  return fieldName
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Infer type from a runtime value
 * Used for runtime schema discovery
 */
export function inferType(value: any): OutputField['type'] {
  if (value === null || value === undefined) return 'string'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'object'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  return 'string'
}

/**
 * Discover schema from runtime output data
 * Creates output fields from actual execution results
 */
export function discoverSchemaFromRuntime(output: Record<string, any>): OutputField[] {
  if (!output || typeof output !== 'object') return []

  return Object.keys(output).map(key => ({
    name: key,
    label: humanizeFieldName(key),
    type: inferType(output[key]),
    description: `Runtime discovered field`
  }))
}

/**
 * Merge static schema with runtime discovered fields
 * Prefers static schema labels, adds any extra runtime fields
 */
export function mergeSchemas(
  staticSchema: OutputField[],
  runtimeOutput?: Record<string, any>
): OutputField[] {
  if (!runtimeOutput) return staticSchema

  const runtimeSchema = discoverSchemaFromRuntime(runtimeOutput)
  const staticFieldNames = new Set(staticSchema.map(f => f.name))

  // Add runtime-only fields that aren't in static schema
  const extraRuntimeFields = runtimeSchema.filter(f => !staticFieldNames.has(f.name))

  return [...staticSchema, ...extraRuntimeFields]
}
