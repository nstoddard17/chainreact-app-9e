/**
 * Node Configuration Questions
 *
 * Defines configuration questions for each node type to help users
 * fully configure their workflow nodes in the AI agent chat.
 *
 * All questions are skippable with smart defaults.
 */

export interface ConfigQuestionOption {
  value: string
  label: string
  isDefault?: boolean
}

export interface ConfigQuestion {
  id: string
  question: string
  type: 'radio' | 'dropdown' | 'text' | 'textarea' | 'checkbox'
  options?: ConfigQuestionOption[]
  dynamicOptions?: string // Load options from API (e.g., 'slack_channels')
  placeholder?: string
  required?: boolean
  followUp?: Record<string, ConfigQuestion> // Show follow-up based on selected value
  defaultValue?: string | boolean
}

export interface NodeConfigDefinition {
  nodeType: string
  displayName: string
  questions: ConfigQuestion[]
}

// ============================================================================
// EMAIL TRIGGERS
// ============================================================================

const gmailTriggerNewEmail: NodeConfigDefinition = {
  nodeType: 'gmail_trigger_new_email',
  displayName: 'Gmail - New Email',
  questions: [
    {
      id: 'filter_type',
      question: 'Which emails should trigger this workflow?',
      type: 'radio',
      options: [
        { value: 'all', label: 'All new emails', isDefault: true },
        { value: 'from_specific', label: 'Only from specific senders' },
        { value: 'subject_contains', label: 'Only with specific subjects' },
        { value: 'has_attachment', label: 'Only with attachments' },
        { value: 'label', label: 'Only with specific labels' },
      ],
      followUp: {
        'from_specific': {
          id: 'from_emails',
          question: 'Enter sender email addresses (comma-separated):',
          type: 'text',
          placeholder: 'user@example.com, another@example.com',
        },
        'subject_contains': {
          id: 'subject_keywords',
          question: 'Enter subject keywords to match:',
          type: 'text',
          placeholder: 'Invoice, Receipt, Order confirmation',
        },
        'label': {
          id: 'label_name',
          question: 'Which Gmail label should trigger this?',
          type: 'dropdown',
          dynamicOptions: 'gmail_labels',
        },
      },
    },
  ],
}

const outlookTriggerNewEmail: NodeConfigDefinition = {
  nodeType: 'microsoft-outlook_trigger_new_email',
  displayName: 'Outlook - New Email',
  questions: [
    {
      id: 'filter_type',
      question: 'Which emails should trigger this workflow?',
      type: 'radio',
      options: [
        { value: 'all', label: 'All new emails', isDefault: true },
        { value: 'from_specific', label: 'Only from specific senders' },
        { value: 'subject_contains', label: 'Only with specific subjects' },
        { value: 'has_attachment', label: 'Only with attachments' },
        { value: 'folder', label: 'Only from specific folder' },
      ],
      followUp: {
        'from_specific': {
          id: 'from_emails',
          question: 'Enter sender email addresses (comma-separated):',
          type: 'text',
          placeholder: 'user@example.com, another@example.com',
        },
        'subject_contains': {
          id: 'subject_keywords',
          question: 'Enter subject keywords to match:',
          type: 'text',
          placeholder: 'Invoice, Receipt, Meeting',
        },
        'folder': {
          id: 'folder_id',
          question: 'Which folder should trigger this?',
          type: 'dropdown',
          dynamicOptions: 'outlook_folders',
        },
      },
    },
  ],
}

// ============================================================================
// SLACK
// ============================================================================

const slackActionSendMessage: NodeConfigDefinition = {
  nodeType: 'slack_action_send_message',
  displayName: 'Slack - Send Message',
  // Note: Connection, workspace, and channel are handled by the schema's configSchema
  // with proper cascading (workspace -> channel). These questions are for UX preferences only.
  questions: [
    {
      id: 'message_format',
      question: 'How should the message be formatted?',
      type: 'radio',
      options: [
        { value: 'simple', label: 'Simple text message', isDefault: true },
        { value: 'detailed', label: 'Detailed with rich formatting' },
        { value: 'custom', label: 'Custom format' },
      ],
      followUp: {
        'custom': {
          id: 'custom_template',
          question: 'Enter your message template:',
          type: 'textarea',
          placeholder: 'New email from {{sender}}: {{subject}}',
        },
      },
    },
    {
      id: 'mention_users',
      question: 'Should the message mention anyone?',
      type: 'radio',
      options: [
        { value: 'none', label: 'No mentions', isDefault: true },
        { value: 'channel', label: 'Mention @channel' },
        { value: 'here', label: 'Mention @here' },
        { value: 'specific', label: 'Mention specific users' },
      ],
    },
  ],
}

const slackActionSendDirectMessage: NodeConfigDefinition = {
  nodeType: 'slack_action_send_direct_message',
  displayName: 'Slack - Send Direct Message',
  // Note: Connection, workspace, and user are handled by the schema's configSchema
  // with proper cascading (workspace -> user). These questions are for UX preferences only.
  questions: [
    {
      id: 'message_format',
      question: 'How should the message be formatted?',
      type: 'radio',
      options: [
        { value: 'simple', label: 'Simple text message', isDefault: true },
        { value: 'detailed', label: 'Detailed with formatting' },
      ],
    },
  ],
}

const slackTriggerNewMessage: NodeConfigDefinition = {
  nodeType: 'slack_trigger_message_channels',
  displayName: 'Slack - New Channel Message',
  questions: [
    {
      id: 'channel_filter',
      question: 'Which channels should trigger this?',
      type: 'radio',
      options: [
        { value: 'all', label: 'All channels', isDefault: true },
        { value: 'specific', label: 'Specific channels only' },
      ],
      followUp: {
        'specific': {
          id: 'channels',
          question: 'Select the channels:',
          type: 'dropdown',
          dynamicOptions: 'slack_channels',
        },
      },
    },
    {
      id: 'include_bot_messages',
      question: 'Should bot messages trigger this?',
      type: 'radio',
      options: [
        { value: 'no', label: 'No, only human messages', isDefault: true },
        { value: 'yes', label: 'Yes, include bot messages' },
      ],
    },
  ],
}

// ============================================================================
// DISCORD
// ============================================================================

const discordActionSendMessage: NodeConfigDefinition = {
  nodeType: 'discord_action_send_message',
  displayName: 'Discord - Send Message',
  questions: [
    {
      id: 'server',
      question: 'Which Discord server?',
      type: 'dropdown',
      dynamicOptions: 'discord_servers',
      required: true,
    },
    {
      id: 'channel',
      question: 'Which channel should receive the message?',
      type: 'dropdown',
      dynamicOptions: 'discord_channels',
      required: true,
    },
    {
      id: 'message_format',
      question: 'How should the message be formatted?',
      type: 'radio',
      options: [
        { value: 'simple', label: 'Simple text', isDefault: true },
        { value: 'embed', label: 'Rich embed with colors' },
      ],
    },
  ],
}

const discordTriggerNewMessage: NodeConfigDefinition = {
  nodeType: 'discord_trigger_new_message',
  displayName: 'Discord - New Message',
  questions: [
    {
      id: 'server',
      question: 'Which Discord server to monitor?',
      type: 'dropdown',
      dynamicOptions: 'discord_servers',
      required: true,
    },
    {
      id: 'channel_filter',
      question: 'Which channels should trigger this?',
      type: 'radio',
      options: [
        { value: 'all', label: 'All channels', isDefault: true },
        { value: 'specific', label: 'Specific channel only' },
      ],
      followUp: {
        'specific': {
          id: 'channel',
          question: 'Select the channel:',
          type: 'dropdown',
          dynamicOptions: 'discord_channels',
        },
      },
    },
  ],
}

// ============================================================================
// GOOGLE SHEETS
// ============================================================================

const googleSheetsActionAppendRow: NodeConfigDefinition = {
  nodeType: 'google-sheets_action_append_row',
  displayName: 'Google Sheets - Add Row',
  questions: [
    {
      id: 'spreadsheet',
      question: 'Which spreadsheet should receive the data?',
      type: 'dropdown',
      dynamicOptions: 'google_sheets_spreadsheets',
      required: true,
    },
    {
      id: 'sheet',
      question: 'Which sheet/tab?',
      type: 'dropdown',
      dynamicOptions: 'google_sheets_worksheets',
      required: true,
    },
    {
      id: 'insert_location',
      question: 'Where should the row be inserted?',
      type: 'radio',
      options: [
        { value: 'end', label: 'At the end (append)', isDefault: true },
        { value: 'beginning', label: 'At the beginning' },
      ],
    },
  ],
}

const googleSheetsTriggerNewRow: NodeConfigDefinition = {
  nodeType: 'google-sheets_trigger_new_row',
  displayName: 'Google Sheets - New Row',
  questions: [
    {
      id: 'spreadsheet',
      question: 'Which spreadsheet to monitor?',
      type: 'dropdown',
      dynamicOptions: 'google_sheets_spreadsheets',
      required: true,
    },
    {
      id: 'sheet',
      question: 'Which sheet/tab?',
      type: 'dropdown',
      dynamicOptions: 'google_sheets_worksheets',
      required: true,
    },
  ],
}

// ============================================================================
// NOTION
// ============================================================================

const notionActionCreatePage: NodeConfigDefinition = {
  nodeType: 'notion_action_create_page',
  displayName: 'Notion - Create Page',
  questions: [
    {
      id: 'database',
      question: 'Which Notion database should receive the new page?',
      type: 'dropdown',
      dynamicOptions: 'notion_databases',
      required: true,
    },
    {
      id: 'title_source',
      question: 'What should the page title be?',
      type: 'radio',
      options: [
        { value: 'dynamic', label: 'Generated from trigger data', isDefault: true },
        { value: 'static', label: 'Fixed title' },
      ],
      followUp: {
        'static': {
          id: 'static_title',
          question: 'Enter the page title:',
          type: 'text',
          placeholder: 'New Page Title',
        },
      },
    },
  ],
}

const notionActionUpdatePage: NodeConfigDefinition = {
  nodeType: 'notion_action_update_page',
  displayName: 'Notion - Update Page',
  questions: [
    {
      id: 'database',
      question: 'Which Notion database contains the page?',
      type: 'dropdown',
      dynamicOptions: 'notion_databases',
      required: true,
    },
    {
      id: 'find_by',
      question: 'How should we find the page to update?',
      type: 'radio',
      options: [
        { value: 'id', label: 'By page ID from trigger', isDefault: true },
        { value: 'property', label: 'By matching a property value' },
      ],
    },
  ],
}

const notionTriggerDatabaseItemCreated: NodeConfigDefinition = {
  nodeType: 'notion_trigger_database_item_created',
  displayName: 'Notion - New Database Item',
  questions: [
    {
      id: 'database',
      question: 'Which Notion database to monitor?',
      type: 'dropdown',
      dynamicOptions: 'notion_databases',
      required: true,
    },
  ],
}

// ============================================================================
// GOOGLE CALENDAR
// ============================================================================

const googleCalendarTriggerNewEvent: NodeConfigDefinition = {
  nodeType: 'google-calendar_trigger_new_event',
  displayName: 'Google Calendar - New Event',
  questions: [
    {
      id: 'calendar',
      question: 'Which calendar to monitor?',
      type: 'dropdown',
      dynamicOptions: 'google_calendars',
      required: true,
    },
    {
      id: 'event_type',
      question: 'What types of events should trigger this?',
      type: 'radio',
      options: [
        { value: 'all', label: 'All events', isDefault: true },
        { value: 'meetings', label: 'Only events with attendees' },
        { value: 'reminders', label: 'Only reminders (no attendees)' },
      ],
    },
  ],
}

const googleCalendarActionCreateEvent: NodeConfigDefinition = {
  nodeType: 'google-calendar_action_create_event',
  displayName: 'Google Calendar - Create Event',
  questions: [
    {
      id: 'calendar',
      question: 'Which calendar should receive the event?',
      type: 'dropdown',
      dynamicOptions: 'google_calendars',
      required: true,
    },
    {
      id: 'default_duration',
      question: 'What should be the default event duration?',
      type: 'radio',
      options: [
        { value: '30', label: '30 minutes', isDefault: true },
        { value: '60', label: '1 hour' },
        { value: '90', label: '1.5 hours' },
        { value: '120', label: '2 hours' },
      ],
    },
    {
      id: 'add_reminder',
      question: 'Should a reminder be added?',
      type: 'radio',
      options: [
        { value: 'email_30', label: 'Email reminder 30 min before', isDefault: true },
        { value: 'popup_15', label: 'Popup reminder 15 min before' },
        { value: 'none', label: 'No reminder' },
      ],
    },
  ],
}

// ============================================================================
// GOOGLE DRIVE
// ============================================================================

const googleDriveActionUploadFile: NodeConfigDefinition = {
  nodeType: 'google-drive:upload_file',
  displayName: 'Google Drive - Upload File',
  questions: [
    {
      id: 'folder',
      question: 'Which folder should receive the file?',
      type: 'dropdown',
      dynamicOptions: 'google_drive_folders',
      required: true,
    },
    {
      id: 'naming',
      question: 'How should the file be named?',
      type: 'radio',
      options: [
        { value: 'original', label: 'Keep original filename', isDefault: true },
        { value: 'timestamp', label: 'Add timestamp to filename' },
        { value: 'custom', label: 'Custom naming pattern' },
      ],
      followUp: {
        'custom': {
          id: 'name_pattern',
          question: 'Enter the naming pattern:',
          type: 'text',
          placeholder: '{date}_{original_name}',
        },
      },
    },
  ],
}

const googleDriveTriggerNewFile: NodeConfigDefinition = {
  nodeType: 'google-drive:new_file_in_folder',
  displayName: 'Google Drive - New File',
  questions: [
    {
      id: 'folder',
      question: 'Which folder to monitor?',
      type: 'dropdown',
      dynamicOptions: 'google_drive_folders',
      required: true,
    },
    {
      id: 'include_subfolders',
      question: 'Should subfolders also trigger this?',
      type: 'radio',
      options: [
        { value: 'no', label: 'No, only this folder', isDefault: true },
        { value: 'yes', label: 'Yes, include subfolders' },
      ],
    },
  ],
}

// ============================================================================
// HUBSPOT
// ============================================================================

const hubspotActionCreateContact: NodeConfigDefinition = {
  nodeType: 'hubspot_action_create_contact',
  displayName: 'HubSpot - Create Contact',
  questions: [
    {
      id: 'required_fields',
      question: 'What contact information is required?',
      type: 'radio',
      options: [
        { value: 'email_only', label: 'Email only', isDefault: true },
        { value: 'email_name', label: 'Email and name' },
        { value: 'full', label: 'Full contact details' },
      ],
    },
    {
      id: 'lifecycle_stage',
      question: 'What lifecycle stage should new contacts have?',
      type: 'dropdown',
      dynamicOptions: 'hubspot_lifecycle_stages',
      defaultValue: 'lead',
    },
  ],
}

const hubspotActionUpdateDeal: NodeConfigDefinition = {
  nodeType: 'hubspot_action_update_deal',
  displayName: 'HubSpot - Update Deal',
  questions: [
    {
      id: 'pipeline',
      question: 'Which pipeline is the deal in?',
      type: 'dropdown',
      dynamicOptions: 'hubspot_pipelines',
      required: true,
    },
    {
      id: 'default_stage',
      question: 'What deal stage should be the default?',
      type: 'dropdown',
      dynamicOptions: 'hubspot_deal_stages',
    },
  ],
}

const hubspotTriggerContactCreated: NodeConfigDefinition = {
  nodeType: 'hubspot_trigger_contact_created',
  displayName: 'HubSpot - New Contact',
  questions: [
    {
      id: 'filter_source',
      question: 'Should this filter by contact source?',
      type: 'radio',
      options: [
        { value: 'all', label: 'All new contacts', isDefault: true },
        { value: 'form', label: 'Only from form submissions' },
        { value: 'api', label: 'Only from API/integrations' },
      ],
    },
  ],
}

// ============================================================================
// TRELLO
// ============================================================================

const trelloActionCreateCard: NodeConfigDefinition = {
  nodeType: 'trello_action_create_card',
  displayName: 'Trello - Create Card',
  questions: [
    {
      id: 'board',
      question: 'Which board should receive the card?',
      type: 'dropdown',
      dynamicOptions: 'trello_boards',
      required: true,
    },
    {
      id: 'list',
      question: 'Which list should the card go in?',
      type: 'dropdown',
      dynamicOptions: 'trello_lists',
      required: true,
    },
    {
      id: 'add_labels',
      question: 'Should labels be added to new cards?',
      type: 'radio',
      options: [
        { value: 'no', label: 'No labels', isDefault: true },
        { value: 'yes', label: 'Add specific labels' },
      ],
      followUp: {
        'yes': {
          id: 'labels',
          question: 'Which labels?',
          type: 'dropdown',
          dynamicOptions: 'trello_labels',
        },
      },
    },
  ],
}

const trelloTriggerNewCard: NodeConfigDefinition = {
  nodeType: 'trello_trigger_new_card',
  displayName: 'Trello - New Card',
  questions: [
    {
      id: 'board',
      question: 'Which board to monitor?',
      type: 'dropdown',
      dynamicOptions: 'trello_boards',
      required: true,
    },
    {
      id: 'list_filter',
      question: 'Should this trigger for all lists?',
      type: 'radio',
      options: [
        { value: 'all', label: 'All lists', isDefault: true },
        { value: 'specific', label: 'Specific list only' },
      ],
      followUp: {
        'specific': {
          id: 'list',
          question: 'Which list?',
          type: 'dropdown',
          dynamicOptions: 'trello_lists',
        },
      },
    },
  ],
}

// ============================================================================
// AIRTABLE
// ============================================================================

const airtableActionCreateRecord: NodeConfigDefinition = {
  nodeType: 'airtable_action_create_record',
  displayName: 'Airtable - Create Record',
  questions: [
    {
      id: 'base',
      question: 'Which Airtable base?',
      type: 'dropdown',
      dynamicOptions: 'airtable_bases',
      required: true,
    },
    {
      id: 'table',
      question: 'Which table should receive the record?',
      type: 'dropdown',
      dynamicOptions: 'airtable_tables',
      required: true,
    },
  ],
}

const airtableTriggerNewRecord: NodeConfigDefinition = {
  nodeType: 'airtable_trigger_new_record',
  displayName: 'Airtable - New Record',
  questions: [
    {
      id: 'base',
      question: 'Which Airtable base to monitor?',
      type: 'dropdown',
      dynamicOptions: 'airtable_bases',
      required: true,
    },
    {
      id: 'table',
      question: 'Which table to monitor?',
      type: 'dropdown',
      dynamicOptions: 'airtable_tables',
      required: true,
    },
    {
      id: 'view_filter',
      question: 'Should this filter by view?',
      type: 'radio',
      options: [
        { value: 'all', label: 'All records', isDefault: true },
        { value: 'view', label: 'Only records in specific view' },
      ],
      followUp: {
        'view': {
          id: 'view',
          question: 'Which view?',
          type: 'dropdown',
          dynamicOptions: 'airtable_views',
        },
      },
    },
  ],
}

// ============================================================================
// MICROSOFT TEAMS
// ============================================================================

const teamsActionSendMessage: NodeConfigDefinition = {
  nodeType: 'teams_action_send_message',
  displayName: 'Teams - Send Message',
  questions: [
    {
      id: 'team',
      question: 'Which team?',
      type: 'dropdown',
      dynamicOptions: 'teams_teams',
      required: true,
    },
    {
      id: 'channel',
      question: 'Which channel should receive the message?',
      type: 'dropdown',
      dynamicOptions: 'teams_channels',
      required: true,
    },
    {
      id: 'message_format',
      question: 'How should the message be formatted?',
      type: 'radio',
      options: [
        { value: 'simple', label: 'Simple text', isDefault: true },
        { value: 'adaptive_card', label: 'Rich adaptive card' },
      ],
    },
  ],
}

const teamsTriggerNewMessage: NodeConfigDefinition = {
  nodeType: 'teams_trigger_new_message',
  displayName: 'Teams - New Message',
  questions: [
    {
      id: 'team',
      question: 'Which team to monitor?',
      type: 'dropdown',
      dynamicOptions: 'teams_teams',
      required: true,
    },
    {
      id: 'channel_filter',
      question: 'Which channels should trigger this?',
      type: 'radio',
      options: [
        { value: 'all', label: 'All channels', isDefault: true },
        { value: 'specific', label: 'Specific channel only' },
      ],
      followUp: {
        'specific': {
          id: 'channel',
          question: 'Select the channel:',
          type: 'dropdown',
          dynamicOptions: 'teams_channels',
        },
      },
    },
  ],
}

// ============================================================================
// DROPBOX
// ============================================================================

const dropboxActionUploadFile: NodeConfigDefinition = {
  nodeType: 'dropbox_action_upload_file',
  displayName: 'Dropbox - Upload File',
  questions: [
    {
      id: 'folder',
      question: 'Which folder should receive the file?',
      type: 'dropdown',
      dynamicOptions: 'dropbox_folders',
      required: true,
    },
    {
      id: 'overwrite',
      question: 'What should happen if file already exists?',
      type: 'radio',
      options: [
        { value: 'rename', label: 'Rename the new file', isDefault: true },
        { value: 'overwrite', label: 'Overwrite the existing file' },
        { value: 'skip', label: 'Skip (do not upload)' },
      ],
    },
  ],
}

const dropboxTriggerNewFile: NodeConfigDefinition = {
  nodeType: 'dropbox_trigger_new_file',
  displayName: 'Dropbox - New File',
  questions: [
    {
      id: 'folder',
      question: 'Which folder to monitor?',
      type: 'dropdown',
      dynamicOptions: 'dropbox_folders',
      required: true,
    },
    {
      id: 'include_subfolders',
      question: 'Should subfolders also trigger this?',
      type: 'radio',
      options: [
        { value: 'no', label: 'No, only this folder', isDefault: true },
        { value: 'yes', label: 'Yes, include subfolders' },
      ],
    },
  ],
}

// ============================================================================
// STRIPE
// ============================================================================

const stripeTriggerNewPayment: NodeConfigDefinition = {
  nodeType: 'stripe_trigger_new_payment',
  displayName: 'Stripe - New Payment',
  questions: [
    {
      id: 'payment_type',
      question: 'What types of payments should trigger this?',
      type: 'radio',
      options: [
        { value: 'all', label: 'All successful payments', isDefault: true },
        { value: 'one_time', label: 'One-time payments only' },
        { value: 'subscription', label: 'Subscription payments only' },
      ],
    },
    {
      id: 'minimum_amount',
      question: 'Should there be a minimum amount?',
      type: 'radio',
      options: [
        { value: 'none', label: 'No minimum', isDefault: true },
        { value: 'custom', label: 'Set minimum amount' },
      ],
      followUp: {
        'custom': {
          id: 'min_amount',
          question: 'Minimum amount (in cents):',
          type: 'text',
          placeholder: '1000',
        },
      },
    },
  ],
}

const stripeActionCreateCustomer: NodeConfigDefinition = {
  nodeType: 'stripe_action_create_customer',
  displayName: 'Stripe - Create Customer',
  questions: [
    {
      id: 'metadata',
      question: 'Should metadata be added to the customer?',
      type: 'radio',
      options: [
        { value: 'none', label: 'No metadata', isDefault: true },
        { value: 'source', label: 'Add source/origin metadata' },
        { value: 'custom', label: 'Custom metadata' },
      ],
    },
  ],
}

// ============================================================================
// SHOPIFY
// ============================================================================

const shopifyTriggerNewOrder: NodeConfigDefinition = {
  nodeType: 'shopify_trigger_new_order',
  displayName: 'Shopify - New Order',
  questions: [
    {
      id: 'order_status',
      question: 'Which orders should trigger this?',
      type: 'radio',
      options: [
        { value: 'any', label: 'Any new order', isDefault: true },
        { value: 'paid', label: 'Only paid orders' },
        { value: 'unfulfilled', label: 'Only unfulfilled orders' },
      ],
    },
    {
      id: 'minimum_total',
      question: 'Should there be a minimum order total?',
      type: 'radio',
      options: [
        { value: 'none', label: 'No minimum', isDefault: true },
        { value: 'custom', label: 'Set minimum total' },
      ],
    },
  ],
}

// ============================================================================
// GITHUB
// ============================================================================

const githubTriggerNewCommit: NodeConfigDefinition = {
  nodeType: 'github_trigger_new_commit',
  displayName: 'GitHub - New Commit',
  questions: [
    {
      id: 'repository',
      question: 'Which repository to monitor?',
      type: 'dropdown',
      dynamicOptions: 'github_repositories',
      required: true,
    },
    {
      id: 'branch_filter',
      question: 'Which branches should trigger this?',
      type: 'radio',
      options: [
        { value: 'all', label: 'All branches', isDefault: true },
        { value: 'main', label: 'Only main/master' },
        { value: 'specific', label: 'Specific branch' },
      ],
      followUp: {
        'specific': {
          id: 'branch',
          question: 'Branch name:',
          type: 'text',
          placeholder: 'develop',
        },
      },
    },
  ],
}

const githubActionCreateIssue: NodeConfigDefinition = {
  nodeType: 'github_action_create_issue',
  displayName: 'GitHub - Create Issue',
  questions: [
    {
      id: 'repository',
      question: 'Which repository should receive the issue?',
      type: 'dropdown',
      dynamicOptions: 'github_repositories',
      required: true,
    },
    {
      id: 'add_labels',
      question: 'Should labels be added?',
      type: 'radio',
      options: [
        { value: 'no', label: 'No labels', isDefault: true },
        { value: 'yes', label: 'Add labels' },
      ],
      followUp: {
        'yes': {
          id: 'labels',
          question: 'Which labels?',
          type: 'dropdown',
          dynamicOptions: 'github_labels',
        },
      },
    },
  ],
}

// ============================================================================
// EXPORT ALL DEFINITIONS
// ============================================================================

export const NODE_CONFIG_QUESTIONS: Record<string, NodeConfigDefinition> = {
  // Email
  'gmail_trigger_new_email': gmailTriggerNewEmail,
  'microsoft-outlook_trigger_new_email': outlookTriggerNewEmail,

  // Slack
  'slack_action_send_message': slackActionSendMessage,
  'slack_action_send_direct_message': slackActionSendDirectMessage,
  'slack_trigger_message_channels': slackTriggerNewMessage,

  // Discord
  'discord_action_send_message': discordActionSendMessage,
  'discord_trigger_new_message': discordTriggerNewMessage,

  // Google Sheets
  'google-sheets_action_append_row': googleSheetsActionAppendRow,
  'google-sheets_trigger_new_row': googleSheetsTriggerNewRow,

  // Notion
  'notion_action_create_page': notionActionCreatePage,
  'notion_action_update_page': notionActionUpdatePage,
  'notion_trigger_database_item_created': notionTriggerDatabaseItemCreated,

  // Google Calendar
  'google-calendar_trigger_new_event': googleCalendarTriggerNewEvent,
  'google-calendar_action_create_event': googleCalendarActionCreateEvent,

  // Google Drive
  'google-drive:upload_file': googleDriveActionUploadFile,
  'google-drive:new_file_in_folder': googleDriveTriggerNewFile,

  // HubSpot
  'hubspot_action_create_contact': hubspotActionCreateContact,
  'hubspot_action_update_deal': hubspotActionUpdateDeal,
  'hubspot_trigger_contact_created': hubspotTriggerContactCreated,

  // Trello
  'trello_action_create_card': trelloActionCreateCard,
  'trello_trigger_new_card': trelloTriggerNewCard,

  // Airtable
  'airtable_action_create_record': airtableActionCreateRecord,
  'airtable_trigger_new_record': airtableTriggerNewRecord,

  // Microsoft Teams
  'teams_action_send_message': teamsActionSendMessage,
  'teams_trigger_new_message': teamsTriggerNewMessage,

  // Dropbox
  'dropbox_action_upload_file': dropboxActionUploadFile,
  'dropbox_trigger_new_file': dropboxTriggerNewFile,

  // Stripe
  'stripe_trigger_new_payment': stripeTriggerNewPayment,
  'stripe_action_create_customer': stripeActionCreateCustomer,

  // Shopify
  'shopify_trigger_new_order': shopifyTriggerNewOrder,

  // GitHub
  'github_trigger_new_commit': githubTriggerNewCommit,
  'github_action_create_issue': githubActionCreateIssue,
}

/**
 * Get configuration questions for a node type
 */
export function getNodeConfigQuestions(nodeType: string): NodeConfigDefinition | null {
  return NODE_CONFIG_QUESTIONS[nodeType] || null
}

/**
 * Check if a node type has configuration questions
 */
export function hasConfigQuestions(nodeType: string): boolean {
  return nodeType in NODE_CONFIG_QUESTIONS
}

/**
 * Get the default values for a node type's configuration
 */
export function getDefaultConfig(nodeType: string): Record<string, string | boolean> {
  const definition = NODE_CONFIG_QUESTIONS[nodeType]
  if (!definition) return {}

  const defaults: Record<string, string | boolean> = {}

  for (const question of definition.questions) {
    if (question.defaultValue !== undefined) {
      defaults[question.id] = question.defaultValue
    } else if (question.options) {
      const defaultOption = question.options.find(o => o.isDefault)
      if (defaultOption) {
        defaults[question.id] = defaultOption.value
      }
    }
  }

  return defaults
}
