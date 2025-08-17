import { FieldSchema } from '../../../ai/smartAIAgent';

export const sendEmail: FieldSchema[] = [
  {
    name: 'to',
    type: 'email',
    required: true,
    description: 'Recipient email address or comma-separated list of emails',
    examples: ['john@example.com', 'user1@company.com, user2@company.com'],
    priority: 'high'
  },
  {
    name: 'subject',
    type: 'string',
    required: true,
    description: 'Email subject line',
    examples: ['Meeting Follow-up', 'Project Update', 'Weekly Report'],
    priority: 'high'
  },
  {
    name: 'body',
    type: 'string',
    required: true,
    description: 'Email content/message body in HTML or plain text',
    examples: [
      'Hi there,\n\nJust wanted to follow up on our meeting yesterday...',
      '<h1>Project Update</h1><p>The project is progressing well...</p>'
    ],
    priority: 'high'
  },
  {
    name: 'cc',
    type: 'array',
    required: false,
    description: 'CC (Carbon Copy) recipients - array of email addresses',
    examples: [['manager@company.com'], ['team@company.com', 'lead@company.com']],
    priority: 'medium'
  },
  {
    name: 'bcc',
    type: 'array',
    required: false,
    description: 'BCC (Blind Carbon Copy) recipients - array of email addresses',
    examples: [['archive@company.com'], ['backup@company.com']],
    priority: 'low'
  },
  {
    name: 'attachments',
    type: 'array',
    required: false,
    description: 'File attachments - array of file paths or URLs',
    examples: [
      ['/path/to/document.pdf'],
      ['report.xlsx', 'presentation.pptx']
    ],
    priority: 'medium'
  },
  {
    name: 'fromName',
    type: 'string',
    required: false,
    description: 'Display name for the sender',
    examples: ['John Smith', 'ChainReact Team', 'Support Team'],
    priority: 'low'
  },
  {
    name: 'replyTo',
    type: 'email',
    required: false,
    description: 'Reply-to email address if different from sender',
    examples: ['noreply@company.com', 'support@company.com'],
    priority: 'low'
  },
  {
    name: 'priority',
    type: 'string',
    required: false,
    description: 'Email priority level',
    examples: ['high', 'normal', 'low'],
    priority: 'low'
  },
  {
    name: 'signature',
    type: 'string',
    required: false,
    description: 'Email signature to append to the message',
    examples: ['Best regards,\nJohn Smith', 'Thank you,\nThe Team'],
    priority: 'low',
    dynamic: 'gmail_signatures'
  }
];

export const readEmails: FieldSchema[] = [
  {
    name: 'query',
    type: 'string',
    required: false,
    description: 'Gmail search query to filter emails',
    examples: [
      'is:unread from:boss@company.com',
      'subject:invoice after:2024/01/01',
      'has:attachment in:inbox'
    ],
    priority: 'high'
  },
  {
    name: 'maxResults',
    type: 'number',
    required: false,
    description: 'Maximum number of emails to retrieve (1-500)',
    examples: [10, 50, 100],
    priority: 'medium'
  },
  {
    name: 'labelIds',
    type: 'array',
    required: false,
    description: 'Array of Gmail label IDs to filter by',
    examples: [['INBOX'], ['IMPORTANT', 'UNREAD']],
    priority: 'medium'
  },
  {
    name: 'includeSpamTrash',
    type: 'boolean',
    required: false,
    description: 'Include emails from spam and trash',
    examples: [false, true],
    priority: 'low'
  }
];

export const createLabel: FieldSchema[] = [
  {
    name: 'name',
    type: 'string',
    required: true,
    description: 'Label name',
    examples: ['Project Alpha', 'Urgent', 'Clients/VIP'],
    priority: 'high'
  },
  {
    name: 'messageListVisibility',
    type: 'string',
    required: false,
    description: 'Visibility in message list',
    examples: ['show', 'hide'],
    priority: 'low'
  },
  {
    name: 'labelListVisibility',
    type: 'string',
    required: false,
    description: 'Visibility in label list',
    examples: ['labelShow', 'labelHide'],
    priority: 'low'
  }
];