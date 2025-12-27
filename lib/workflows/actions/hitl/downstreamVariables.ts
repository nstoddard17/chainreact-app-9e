/**
 * Downstream Variable Mapping for HITL Node
 * Maps downstream node types to the variables the AI should extract
 */

export interface DownstreamVariable {
  name: string
  label: string
  type: string
  description: string
}

/**
 * Comprehensive mapping of downstream node types to their required input variables
 * When HITL detects these nodes downstream, it will tell the AI to extract these specific variables
 */
export const DOWNSTREAM_VARIABLE_MAP: Record<string, DownstreamVariable[]> = {
  // ============================================
  // EMAIL ACTIONS
  // ============================================
  'gmail_action_send_email': [
    { name: 'recipientEmail', label: 'Recipient Email', type: 'string', description: 'Email address to send to' },
    { name: 'emailSubject', label: 'Email Subject', type: 'string', description: 'Subject line of the email' },
    { name: 'emailBody', label: 'Email Body', type: 'string', description: 'Body content of the email' },
    { name: 'ccEmails', label: 'CC Emails', type: 'string', description: 'CC email addresses (comma-separated)' },
    { name: 'bccEmails', label: 'BCC Emails', type: 'string', description: 'BCC email addresses (comma-separated)' },
  ],
  // Alias for backwards compatibility
  'gmail_send_email': [
    { name: 'recipientEmail', label: 'Recipient Email', type: 'string', description: 'Email address to send to' },
    { name: 'emailSubject', label: 'Email Subject', type: 'string', description: 'Subject line of the email' },
    { name: 'emailBody', label: 'Email Body', type: 'string', description: 'Body content of the email' },
    { name: 'ccEmails', label: 'CC Emails', type: 'string', description: 'CC email addresses (comma-separated)' },
    { name: 'bccEmails', label: 'BCC Emails', type: 'string', description: 'BCC email addresses (comma-separated)' },
  ],
  'gmail_action_reply_to_email': [
    { name: 'emailBody', label: 'Reply Body', type: 'string', description: 'Body content of the reply email' },
    { name: 'replySubject', label: 'Reply Subject', type: 'string', description: 'Subject line (optional, defaults to Re:)' },
  ],
  'gmail_reply_email': [
    { name: 'emailBody', label: 'Reply Body', type: 'string', description: 'Body content of the reply email' },
    { name: 'replySubject', label: 'Reply Subject', type: 'string', description: 'Subject line (optional, defaults to Re:)' },
  ],
  'outlook_send_email': [
    { name: 'recipientEmail', label: 'Recipient Email', type: 'string', description: 'Email address to send to' },
    { name: 'emailSubject', label: 'Email Subject', type: 'string', description: 'Subject line of the email' },
    { name: 'emailBody', label: 'Email Body', type: 'string', description: 'Body content of the email' },
    { name: 'ccEmails', label: 'CC Emails', type: 'string', description: 'CC email addresses' },
  ],
  'mailchimp_send_email': [
    { name: 'recipientEmail', label: 'Recipient Email', type: 'string', description: 'Email address to send to' },
    { name: 'emailSubject', label: 'Email Subject', type: 'string', description: 'Subject line of the email' },
    { name: 'emailBody', label: 'Email Body', type: 'string', description: 'Body content of the email' },
  ],
  'sendgrid_send_email': [
    { name: 'recipientEmail', label: 'Recipient Email', type: 'string', description: 'Email address to send to' },
    { name: 'emailSubject', label: 'Email Subject', type: 'string', description: 'Subject line of the email' },
    { name: 'emailBody', label: 'Email Body', type: 'string', description: 'Body content of the email' },
  ],

  // ============================================
  // CHAT/MESSAGING ACTIONS
  // ============================================
  'slack_send_message': [
    { name: 'slackMessage', label: 'Slack Message', type: 'string', description: 'Message content to send to Slack' },
  ],
  'slack_send_dm': [
    { name: 'slackMessage', label: 'Slack Message', type: 'string', description: 'Direct message content' },
    { name: 'recipientUser', label: 'Recipient User', type: 'string', description: 'User to send DM to' },
  ],
  'discord_send_message': [
    { name: 'discordMessage', label: 'Discord Message', type: 'string', description: 'Message content to send to Discord' },
  ],
  'teams_send_message': [
    { name: 'teamsMessage', label: 'Teams Message', type: 'string', description: 'Message content to send to Teams' },
  ],
  'telegram_send_message': [
    { name: 'telegramMessage', label: 'Telegram Message', type: 'string', description: 'Message content to send' },
  ],
  'twilio_send_sms': [
    { name: 'smsMessage', label: 'SMS Message', type: 'string', description: 'SMS message content' },
    { name: 'phoneNumber', label: 'Phone Number', type: 'string', description: 'Recipient phone number' },
  ],

  // ============================================
  // TASK/PROJECT MANAGEMENT
  // ============================================
  'asana_create_task': [
    { name: 'taskTitle', label: 'Task Title', type: 'string', description: 'Title of the task' },
    { name: 'taskDescription', label: 'Task Description', type: 'string', description: 'Detailed description of the task' },
    { name: 'dueDate', label: 'Due Date', type: 'string', description: 'Task due date' },
    { name: 'assignee', label: 'Assignee', type: 'string', description: 'Person to assign the task to' },
    { name: 'priority', label: 'Priority', type: 'string', description: 'Task priority level' },
  ],
  'asana_update_task': [
    { name: 'taskTitle', label: 'Task Title', type: 'string', description: 'Updated task title' },
    { name: 'taskDescription', label: 'Task Description', type: 'string', description: 'Updated task description' },
    { name: 'taskStatus', label: 'Task Status', type: 'string', description: 'New status for the task' },
  ],
  'trello_create_card': [
    { name: 'cardTitle', label: 'Card Title', type: 'string', description: 'Title of the Trello card' },
    { name: 'cardDescription', label: 'Card Description', type: 'string', description: 'Description of the card' },
    { name: 'dueDate', label: 'Due Date', type: 'string', description: 'Card due date' },
  ],
  'notion_create_page': [
    { name: 'pageTitle', label: 'Page Title', type: 'string', description: 'Title of the Notion page' },
    { name: 'pageContent', label: 'Page Content', type: 'string', description: 'Content of the page' },
  ],
  'notion_update_page': [
    { name: 'pageTitle', label: 'Page Title', type: 'string', description: 'Updated page title' },
    { name: 'pageContent', label: 'Page Content', type: 'string', description: 'Updated page content' },
  ],
  'monday_create_item': [
    { name: 'itemName', label: 'Item Name', type: 'string', description: 'Name of the Monday.com item' },
    { name: 'itemDescription', label: 'Item Description', type: 'string', description: 'Description of the item' },
    { name: 'status', label: 'Status', type: 'string', description: 'Item status' },
  ],
  'clickup_create_task': [
    { name: 'taskTitle', label: 'Task Title', type: 'string', description: 'Title of the ClickUp task' },
    { name: 'taskDescription', label: 'Task Description', type: 'string', description: 'Task description' },
    { name: 'dueDate', label: 'Due Date', type: 'string', description: 'Task due date' },
    { name: 'priority', label: 'Priority', type: 'string', description: 'Task priority' },
  ],
  'jira_create_issue': [
    { name: 'issueTitle', label: 'Issue Title', type: 'string', description: 'Title/summary of the Jira issue' },
    { name: 'issueDescription', label: 'Issue Description', type: 'string', description: 'Detailed description' },
    { name: 'priority', label: 'Priority', type: 'string', description: 'Issue priority' },
    { name: 'assignee', label: 'Assignee', type: 'string', description: 'Person to assign the issue to' },
  ],
  'linear_create_issue': [
    { name: 'issueTitle', label: 'Issue Title', type: 'string', description: 'Title of the Linear issue' },
    { name: 'issueDescription', label: 'Issue Description', type: 'string', description: 'Issue description' },
    { name: 'priority', label: 'Priority', type: 'string', description: 'Issue priority' },
  ],
  'todoist_create_task': [
    { name: 'taskTitle', label: 'Task Title', type: 'string', description: 'Title of the Todoist task' },
    { name: 'taskDescription', label: 'Task Description', type: 'string', description: 'Task description' },
    { name: 'dueDate', label: 'Due Date', type: 'string', description: 'Task due date' },
  ],

  // ============================================
  // CRM ACTIONS
  // ============================================
  'hubspot_create_contact': [
    { name: 'contactName', label: 'Contact Name', type: 'string', description: 'Full name of the contact' },
    { name: 'contactEmail', label: 'Contact Email', type: 'string', description: 'Email address of the contact' },
    { name: 'companyName', label: 'Company Name', type: 'string', description: 'Company the contact works for' },
    { name: 'phoneNumber', label: 'Phone Number', type: 'string', description: 'Contact phone number' },
    { name: 'notes', label: 'Notes', type: 'string', description: 'Additional notes about the contact' },
  ],
  'hubspot_update_contact': [
    { name: 'contactEmail', label: 'Contact Email', type: 'string', description: 'Email to identify the contact' },
    { name: 'notes', label: 'Notes', type: 'string', description: 'Updated notes' },
  ],
  'hubspot_create_deal': [
    { name: 'dealName', label: 'Deal Name', type: 'string', description: 'Name of the deal' },
    { name: 'dealAmount', label: 'Deal Amount', type: 'number', description: 'Value of the deal' },
    { name: 'dealStage', label: 'Deal Stage', type: 'string', description: 'Current stage of the deal' },
  ],
  'salesforce_create_record': [
    { name: 'recordName', label: 'Record Name', type: 'string', description: 'Name of the Salesforce record' },
    { name: 'recordDescription', label: 'Record Description', type: 'string', description: 'Description of the record' },
  ],
  'pipedrive_create_deal': [
    { name: 'dealTitle', label: 'Deal Title', type: 'string', description: 'Title of the deal' },
    { name: 'dealValue', label: 'Deal Value', type: 'number', description: 'Value of the deal' },
    { name: 'notes', label: 'Notes', type: 'string', description: 'Deal notes' },
  ],

  // ============================================
  // DOCUMENT/CONTENT ACTIONS
  // ============================================
  'google_docs_create': [
    { name: 'documentTitle', label: 'Document Title', type: 'string', description: 'Title of the Google Doc' },
    { name: 'documentContent', label: 'Document Content', type: 'string', description: 'Content of the document' },
  ],
  'google_docs_update': [
    { name: 'documentContent', label: 'Document Content', type: 'string', description: 'Updated content' },
  ],
  'google_sheets_add_row': [
    { name: 'rowData', label: 'Row Data', type: 'object', description: 'Data to add as a new row' },
  ],
  'airtable_create_record': [
    { name: 'recordData', label: 'Record Data', type: 'object', description: 'Data for the new Airtable record' },
  ],
  'dropbox_upload': [
    { name: 'fileName', label: 'File Name', type: 'string', description: 'Name of the file to upload' },
    { name: 'fileContent', label: 'File Content', type: 'string', description: 'Content of the file' },
  ],

  // ============================================
  // CALENDAR ACTIONS
  // ============================================
  'google_calendar_create_event': [
    { name: 'eventTitle', label: 'Event Title', type: 'string', description: 'Title of the calendar event' },
    { name: 'eventDescription', label: 'Event Description', type: 'string', description: 'Description of the event' },
    { name: 'eventDate', label: 'Event Date', type: 'string', description: 'Date of the event' },
    { name: 'eventTime', label: 'Event Time', type: 'string', description: 'Time of the event' },
    { name: 'attendees', label: 'Attendees', type: 'string', description: 'Email addresses of attendees' },
  ],
  'outlook_calendar_create_event': [
    { name: 'eventTitle', label: 'Event Title', type: 'string', description: 'Title of the calendar event' },
    { name: 'eventDescription', label: 'Event Description', type: 'string', description: 'Description of the event' },
    { name: 'eventDate', label: 'Event Date', type: 'string', description: 'Date of the event' },
    { name: 'eventTime', label: 'Event Time', type: 'string', description: 'Time of the event' },
  ],

  // ============================================
  // SOCIAL MEDIA
  // ============================================
  'twitter_post': [
    { name: 'tweetContent', label: 'Tweet Content', type: 'string', description: 'Content of the tweet' },
  ],
  'linkedin_post': [
    { name: 'postContent', label: 'Post Content', type: 'string', description: 'Content of the LinkedIn post' },
  ],
  'facebook_post': [
    { name: 'postContent', label: 'Post Content', type: 'string', description: 'Content of the Facebook post' },
  ],
  'instagram_post': [
    { name: 'caption', label: 'Caption', type: 'string', description: 'Caption for the Instagram post' },
  ],

  // ============================================
  // SUPPORT/TICKETING
  // ============================================
  'zendesk_create_ticket': [
    { name: 'ticketSubject', label: 'Ticket Subject', type: 'string', description: 'Subject of the support ticket' },
    { name: 'ticketDescription', label: 'Ticket Description', type: 'string', description: 'Detailed description of the issue' },
    { name: 'priority', label: 'Priority', type: 'string', description: 'Ticket priority level' },
  ],
  'freshdesk_create_ticket': [
    { name: 'ticketSubject', label: 'Ticket Subject', type: 'string', description: 'Subject of the ticket' },
    { name: 'ticketDescription', label: 'Ticket Description', type: 'string', description: 'Description of the issue' },
  ],
  'intercom_send_message': [
    { name: 'message', label: 'Message', type: 'string', description: 'Message to send via Intercom' },
  ],

  // ============================================
  // E-COMMERCE
  // ============================================
  'shopify_create_order': [
    { name: 'orderNotes', label: 'Order Notes', type: 'string', description: 'Notes for the order' },
  ],
  'shopify_action_create_order': [
    { name: 'orderNotes', label: 'Order Notes', type: 'string', description: 'Notes for the order' },
  ],
  'shopify_update_order': [
    { name: 'orderStatus', label: 'Order Status', type: 'string', description: 'New status for the order' },
    { name: 'orderNotes', label: 'Order Notes', type: 'string', description: 'Updated notes' },
  ],
  'shopify_action_update_order_status': [
    { name: 'orderStatus', label: 'Order Status', type: 'string', description: 'New status for the order' },
    { name: 'orderNotes', label: 'Order Notes', type: 'string', description: 'Updated notes' },
  ],
  'shopify_action_create_product': [
    { name: 'productTitle', label: 'Product Title', type: 'string', description: 'Title of the product' },
    { name: 'productDescription', label: 'Product Description', type: 'string', description: 'Description of the product' },
    { name: 'productPrice', label: 'Product Price', type: 'number', description: 'Price of the product' },
  ],
  'shopify_action_create_customer': [
    { name: 'customerName', label: 'Customer Name', type: 'string', description: 'Name of the customer' },
    { name: 'customerEmail', label: 'Customer Email', type: 'string', description: 'Email of the customer' },
    { name: 'customerPhone', label: 'Customer Phone', type: 'string', description: 'Phone number of the customer' },
  ],
  'stripe_create_invoice': [
    { name: 'invoiceAmount', label: 'Invoice Amount', type: 'number', description: 'Amount to invoice' },
    { name: 'invoiceDescription', label: 'Invoice Description', type: 'string', description: 'Description for the invoice' },
  ],
  'stripe_action_create_invoice': [
    { name: 'invoiceAmount', label: 'Invoice Amount', type: 'number', description: 'Amount to invoice' },
    { name: 'invoiceDescription', label: 'Invoice Description', type: 'string', description: 'Description for the invoice' },
  ],
  'stripe_action_create_customer': [
    { name: 'customerName', label: 'Customer Name', type: 'string', description: 'Name of the customer' },
    { name: 'customerEmail', label: 'Customer Email', type: 'string', description: 'Email of the customer' },
    { name: 'customerDescription', label: 'Customer Description', type: 'string', description: 'Description of the customer' },
  ],
  'stripe_action_create_subscription': [
    { name: 'subscriptionPlan', label: 'Subscription Plan', type: 'string', description: 'Plan ID for the subscription' },
    { name: 'subscriptionNotes', label: 'Subscription Notes', type: 'string', description: 'Notes about the subscription' },
  ],

  // ============================================
  // GITHUB ACTIONS
  // ============================================
  'github_action_create_issue': [
    { name: 'issueTitle', label: 'Issue Title', type: 'string', description: 'Title of the GitHub issue' },
    { name: 'issueBody', label: 'Issue Body', type: 'string', description: 'Body content of the issue' },
    { name: 'issueLabels', label: 'Issue Labels', type: 'string', description: 'Labels to apply (comma-separated)' },
  ],
  'github_action_create_pull_request': [
    { name: 'prTitle', label: 'PR Title', type: 'string', description: 'Title of the pull request' },
    { name: 'prBody', label: 'PR Body', type: 'string', description: 'Description of the pull request' },
  ],
  'github_action_add_comment': [
    { name: 'commentBody', label: 'Comment', type: 'string', description: 'Comment content to add' },
  ],
  'github_action_create_gist': [
    { name: 'gistDescription', label: 'Gist Description', type: 'string', description: 'Description of the gist' },
    { name: 'gistContent', label: 'Gist Content', type: 'string', description: 'Content of the gist file' },
  ],

  // ============================================
  // MICROSOFT EXCEL ACTIONS
  // ============================================
  'microsoft_excel_action_add_row': [
    { name: 'rowData', label: 'Row Data', type: 'object', description: 'Data to add as a new row' },
  ],
  'microsoft_excel_action_update_row': [
    { name: 'rowData', label: 'Row Data', type: 'object', description: 'Data to update in the row' },
  ],
  'microsoft_excel_action_create_workbook': [
    { name: 'workbookName', label: 'Workbook Name', type: 'string', description: 'Name of the new workbook' },
  ],
  'microsoft_excel_action_create_worksheet': [
    { name: 'worksheetName', label: 'Worksheet Name', type: 'string', description: 'Name of the new worksheet' },
  ],

  // ============================================
  // ONEDRIVE ACTIONS
  // ============================================
  'onedrive_action_upload_file': [
    { name: 'fileName', label: 'File Name', type: 'string', description: 'Name of the file to upload' },
    { name: 'fileContent', label: 'File Content', type: 'string', description: 'Content of the file' },
  ],
  'onedrive_action_create_folder': [
    { name: 'folderName', label: 'Folder Name', type: 'string', description: 'Name of the folder to create' },
  ],
  'onedrive_action_rename_item': [
    { name: 'newName', label: 'New Name', type: 'string', description: 'New name for the item' },
  ],

  // ============================================
  // MANYCHAT ACTIONS
  // ============================================
  'manychat_action_send_message': [
    { name: 'message', label: 'Message', type: 'string', description: 'Message to send via ManyChat' },
  ],
  'manychat_action_send_dynamic_message': [
    { name: 'message', label: 'Message', type: 'string', description: 'Dynamic message content' },
  ],

  // ============================================
  // ADDITIONAL SLACK ACTIONS (with actual type names)
  // ============================================
  'slack_action_send_message': [
    { name: 'slackMessage', label: 'Slack Message', type: 'string', description: 'Message content to send to Slack' },
  ],
  'slack_action_schedule_message': [
    { name: 'slackMessage', label: 'Slack Message', type: 'string', description: 'Message to schedule' },
    { name: 'scheduleTime', label: 'Schedule Time', type: 'string', description: 'When to send the message' },
  ],
  'slack_action_add_reminder': [
    { name: 'reminderText', label: 'Reminder Text', type: 'string', description: 'Text for the reminder' },
    { name: 'reminderTime', label: 'Reminder Time', type: 'string', description: 'When to remind' },
  ],

  // ============================================
  // ADDITIONAL TEAMS ACTIONS (with actual type names)
  // ============================================
  'teams_action_send_message': [
    { name: 'teamsMessage', label: 'Teams Message', type: 'string', description: 'Message content to send to Teams' },
  ],
  'teams_action_send_chat_message': [
    { name: 'teamsMessage', label: 'Chat Message', type: 'string', description: 'Chat message content' },
  ],
  'teams_action_create_meeting': [
    { name: 'meetingTitle', label: 'Meeting Title', type: 'string', description: 'Title of the meeting' },
    { name: 'meetingDescription', label: 'Meeting Description', type: 'string', description: 'Description of the meeting' },
  ],
  'teams_action_schedule_meeting': [
    { name: 'meetingTitle', label: 'Meeting Title', type: 'string', description: 'Title of the meeting' },
    { name: 'meetingDescription', label: 'Meeting Description', type: 'string', description: 'Description of the meeting' },
    { name: 'meetingTime', label: 'Meeting Time', type: 'string', description: 'Scheduled time for the meeting' },
  ],
  'teams_action_create_channel': [
    { name: 'channelName', label: 'Channel Name', type: 'string', description: 'Name of the new channel' },
    { name: 'channelDescription', label: 'Channel Description', type: 'string', description: 'Description of the channel' },
  ],

  // ============================================
  // ADDITIONAL NOTION ACTIONS (with actual type names)
  // ============================================
  'notion_action_create_page': [
    { name: 'pageTitle', label: 'Page Title', type: 'string', description: 'Title of the Notion page' },
    { name: 'pageContent', label: 'Page Content', type: 'string', description: 'Content of the page' },
  ],
  'notion_action_update_page': [
    { name: 'pageTitle', label: 'Page Title', type: 'string', description: 'Updated page title' },
    { name: 'pageContent', label: 'Page Content', type: 'string', description: 'Updated page content' },
  ],
  'notion_action_append_to_page': [
    { name: 'pageContent', label: 'Content to Append', type: 'string', description: 'Content to add to the page' },
  ],
  'notion_action_create_database': [
    { name: 'databaseTitle', label: 'Database Title', type: 'string', description: 'Title of the database' },
  ],
  'notion_action_create_comment': [
    { name: 'commentText', label: 'Comment', type: 'string', description: 'Comment to add' },
  ],
  'notion_action_manage_page': [
    { name: 'pageTitle', label: 'Page Title', type: 'string', description: 'Title of the page' },
    { name: 'pageContent', label: 'Page Content', type: 'string', description: 'Content of the page' },
  ],

  // ============================================
  // ADDITIONAL TWITTER ACTIONS (with actual type names)
  // ============================================
  'twitter_action_post_tweet': [
    { name: 'tweetContent', label: 'Tweet Content', type: 'string', description: 'Content of the tweet' },
  ],
  'twitter_action_reply_tweet': [
    { name: 'replyContent', label: 'Reply Content', type: 'string', description: 'Content of the reply' },
  ],
  'twitter_action_send_dm': [
    { name: 'dmContent', label: 'DM Content', type: 'string', description: 'Direct message content' },
  ],

  // ============================================
  // ADDITIONAL TRELLO ACTIONS (with actual type names)
  // ============================================
  'trello_action_create_card': [
    { name: 'cardTitle', label: 'Card Title', type: 'string', description: 'Title of the Trello card' },
    { name: 'cardDescription', label: 'Card Description', type: 'string', description: 'Description of the card' },
    { name: 'dueDate', label: 'Due Date', type: 'string', description: 'Card due date' },
  ],
  'trello_action_create_board': [
    { name: 'boardName', label: 'Board Name', type: 'string', description: 'Name of the board' },
    { name: 'boardDescription', label: 'Board Description', type: 'string', description: 'Description of the board' },
  ],
  'trello_action_create_list': [
    { name: 'listName', label: 'List Name', type: 'string', description: 'Name of the list' },
  ],

  // ============================================
  // ADDITIONAL AIRTABLE ACTIONS (with actual type names)
  // ============================================
  'airtable_action_create_record': [
    { name: 'recordData', label: 'Record Data', type: 'object', description: 'Data for the new Airtable record' },
  ],
  'airtable_action_update_record': [
    { name: 'recordData', label: 'Record Data', type: 'object', description: 'Data to update in the record' },
  ],

  // ============================================
  // ADDITIONAL GOOGLE CALENDAR ACTIONS (with actual type names)
  // ============================================
  'google_calendar_action_create_event': [
    { name: 'eventTitle', label: 'Event Title', type: 'string', description: 'Title of the calendar event' },
    { name: 'eventDescription', label: 'Event Description', type: 'string', description: 'Description of the event' },
    { name: 'eventDate', label: 'Event Date', type: 'string', description: 'Date of the event' },
    { name: 'eventTime', label: 'Event Time', type: 'string', description: 'Time of the event' },
    { name: 'attendees', label: 'Attendees', type: 'string', description: 'Email addresses of attendees' },
  ],
  'google_calendar_action_update_event': [
    { name: 'eventTitle', label: 'Event Title', type: 'string', description: 'Updated event title' },
    { name: 'eventDescription', label: 'Event Description', type: 'string', description: 'Updated event description' },
  ],
  'google_calendar_action_quick_add_event': [
    { name: 'eventText', label: 'Event Text', type: 'string', description: 'Natural language event description' },
  ],

  // ============================================
  // ADDITIONAL GOOGLE DOCS ACTIONS (with actual type names)
  // ============================================
  'google_docs_action_create_document': [
    { name: 'documentTitle', label: 'Document Title', type: 'string', description: 'Title of the Google Doc' },
    { name: 'documentContent', label: 'Document Content', type: 'string', description: 'Content of the document' },
  ],
  'google_docs_action_update_document': [
    { name: 'documentContent', label: 'Document Content', type: 'string', description: 'Updated content' },
  ],

  // ============================================
  // ADDITIONAL GOOGLE SHEETS ACTIONS (with actual type names)
  // ============================================
  'google_sheets_action_append_row': [
    { name: 'rowData', label: 'Row Data', type: 'object', description: 'Data to add as a new row' },
  ],
  'google_sheets_action_update_row': [
    { name: 'rowData', label: 'Row Data', type: 'object', description: 'Data to update in the row' },
  ],
  'google_sheets_action_create_spreadsheet': [
    { name: 'spreadsheetTitle', label: 'Spreadsheet Title', type: 'string', description: 'Title of the new spreadsheet' },
  ],

  // ============================================
  // ADDITIONAL FACEBOOK ACTIONS (with actual type names)
  // ============================================
  'facebook_action_create_post': [
    { name: 'postContent', label: 'Post Content', type: 'string', description: 'Content of the Facebook post' },
  ],
  'facebook_action_send_message': [
    { name: 'message', label: 'Message', type: 'string', description: 'Message content to send' },
  ],
  'facebook_action_comment_on_post': [
    { name: 'commentText', label: 'Comment', type: 'string', description: 'Comment to add to the post' },
  ],

  // ============================================
  // ADDITIONAL MONDAY.COM ACTIONS
  // ============================================
  'monday_action_create_item': [
    { name: 'itemName', label: 'Item Name', type: 'string', description: 'Name of the Monday.com item' },
    { name: 'itemDescription', label: 'Item Description', type: 'string', description: 'Description of the item' },
  ],
  'monday_action_create_board': [
    { name: 'boardName', label: 'Board Name', type: 'string', description: 'Name of the board' },
  ],
  'monday_action_create_group': [
    { name: 'groupName', label: 'Group Name', type: 'string', description: 'Name of the group' },
  ],
}

/**
 * Default variables that are always included regardless of downstream node
 */
export const DEFAULT_HITL_VARIABLES: DownstreamVariable[] = [
  { name: 'decision', label: 'Decision', type: 'string', description: 'User decision: approved, rejected, modified, or continued' },
  { name: 'notes', label: 'Notes', type: 'string', description: 'Additional notes from the conversation' },
]

/**
 * Get the required variables for downstream nodes from an HITL node
 * @param hitlNodeId - The ID of the HITL node
 * @param nodes - All nodes in the workflow
 * @param edges - All edges/connections in the workflow
 * @returns Array of variables the AI should extract
 */
export function getDownstreamRequiredVariables(
  hitlNodeId: string,
  nodes: any[],
  edges: any[]
): DownstreamVariable[] {
  // Find all connections FROM the HITL node
  const downstreamConnections = edges.filter(
    (edge: any) => edge.source === hitlNodeId
  )

  // Extract target node IDs
  const downstreamNodeIds = downstreamConnections.map(
    (edge: any) => edge.target
  )

  // Map IDs to actual node objects
  const downstreamNodes = downstreamNodeIds
    .map((id: string) => nodes.find((n: any) => n.id === id))
    .filter(Boolean)

  // Collect all required variables from downstream nodes
  const requiredVariables: DownstreamVariable[] = [...DEFAULT_HITL_VARIABLES]
  const seenNames = new Set(requiredVariables.map(v => v.name))

  for (const node of downstreamNodes) {
    const nodeType = node.data?.type || node.type
    const mapping = DOWNSTREAM_VARIABLE_MAP[nodeType]

    if (mapping) {
      for (const variable of mapping) {
        // Avoid duplicates
        if (!seenNames.has(variable.name)) {
          requiredVariables.push(variable)
          seenNames.add(variable.name)
        }
      }
    }
  }

  return requiredVariables
}

/**
 * Get downstream node types from an HITL node
 * @param hitlNodeId - The ID of the HITL node
 * @param nodes - All nodes in the workflow
 * @param edges - All edges/connections in the workflow
 * @returns Array of node type strings
 */
export function getDownstreamNodeTypes(
  hitlNodeId: string,
  nodes: any[],
  edges: any[]
): string[] {
  const downstreamConnections = edges.filter(
    (edge: any) => edge.source === hitlNodeId
  )

  const downstreamNodeIds = downstreamConnections.map(
    (edge: any) => edge.target
  )

  const downstreamNodes = downstreamNodeIds
    .map((id: string) => nodes.find((n: any) => n.id === id))
    .filter(Boolean)

  return downstreamNodes.map((node: any) => node.data?.type || node.type)
}

/**
 * Format downstream variables for AI system prompt
 */
export function formatVariablesForPrompt(variables: DownstreamVariable[]): string {
  if (variables.length === 0) {
    return ''
  }

  const lines = variables.map(v => `- **${v.name}** (${v.type}): ${v.description}`)

  return `
REQUIRED VARIABLES TO EXTRACT:
The next workflow step needs these specific variables. You MUST extract all of these from the conversation:

${lines.join('\n')}

When the user is ready to continue, call the continue_workflow function with ALL of these variables populated.
Use camelCase for variable names exactly as shown above.
`
}
