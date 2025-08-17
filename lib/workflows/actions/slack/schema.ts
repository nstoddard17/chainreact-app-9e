import { FieldSchema } from '../../../ai/smartAIAgent';

export const sendMessage: FieldSchema[] = [
  {
    name: 'channel',
    type: 'string',
    required: true,
    description: 'Slack channel ID, name (#channel), or user ID (@user) to send message to',
    examples: ['#general', '#project-alpha', '@john.doe', 'C1234567890'],
    priority: 'high'
  },
  {
    name: 'text',
    type: 'string',
    required: true,
    description: 'Message content - supports Slack markdown formatting',
    examples: [
      'Hello team! The deployment is complete ✅',
      '*Important:* Please review the new documentation at <https://docs.company.com>',
      'Daily standup reminder:\n• What did you work on yesterday?\n• What are you working on today?\n• Any blockers?'
    ],
    priority: 'high'
  },
  {
    name: 'username',
    type: 'string',
    required: false,
    description: 'Display name for the bot/sender',
    examples: ['ChainReact Bot', 'Deployment Notifier', 'System Alert'],
    priority: 'medium'
  },
  {
    name: 'icon_emoji',
    type: 'string',
    required: false,
    description: 'Emoji to use as the sender icon',
    examples: [':robot_face:', ':bell:', ':warning:', ':rocket:'],
    priority: 'low'
  },
  {
    name: 'icon_url',
    type: 'url',
    required: false,
    description: 'URL to an image to use as the sender icon',
    examples: ['https://example.com/bot-avatar.png'],
    priority: 'low'
  },
  {
    name: 'thread_ts',
    type: 'string',
    required: false,
    description: 'Timestamp of parent message to reply in thread',
    examples: ['1234567890.123456'],
    priority: 'medium'
  }
];

export const createChannel: FieldSchema[] = [
  {
    name: 'name',
    type: 'string',
    required: true,
    description: 'Channel name (lowercase, no spaces, use hyphens)',
    examples: ['project-alpha', 'team-engineering', 'random-chat'],
    priority: 'high'
  },
  {
    name: 'is_private',
    type: 'boolean',
    required: false,
    description: 'Create as private channel',
    examples: [false, true],
    priority: 'medium'
  },
  {
    name: 'purpose',
    type: 'string',
    required: false,
    description: 'Channel purpose/description',
    examples: [
      'Discuss Project Alpha development',
      'Engineering team coordination',
      'Random discussions and team bonding'
    ],
    priority: 'medium'
  },
  {
    name: 'topic',
    type: 'string',
    required: false,
    description: 'Channel topic (appears in header)',
    examples: [
      'Sprint 5 - Due March 15th',
      'Engineering standup daily at 9am',
      'Fun discussions welcome!'
    ],
    priority: 'low'
  }
];

export const inviteToChannel: FieldSchema[] = [
  {
    name: 'channel',
    type: 'string',
    required: true,
    description: 'Channel ID or name to invite users to',
    examples: ['#project-alpha', 'C1234567890'],
    priority: 'high'
  },
  {
    name: 'users',
    type: 'array',
    required: true,
    description: 'Array of user IDs or usernames to invite',
    examples: [
      ['U1234567890'],
      ['john.doe', 'jane.smith'],
      ['@developer1', '@designer2']
    ],
    priority: 'high'
  }
];

export const scheduleMessage: FieldSchema[] = [
  {
    name: 'channel',
    type: 'string',
    required: true,
    description: 'Channel ID, name, or user to send scheduled message to',
    examples: ['#general', '@john.doe', 'C1234567890'],
    priority: 'high'
  },
  {
    name: 'text',
    type: 'string',
    required: true,
    description: 'Message content to send',
    examples: [
      'Good morning team! Don\'t forget about the 10am meeting.',
      'Reminder: Code freeze starts in 1 hour',
      'Weekly report is ready for review'
    ],
    priority: 'high'
  },
  {
    name: 'post_at',
    type: 'date',
    required: true,
    description: 'Unix timestamp or ISO date when to send the message',
    examples: [
      '2024-03-15T09:00:00Z',
      '1710489600',
      '2024-03-15 09:00:00'
    ],
    priority: 'high'
  },
  {
    name: 'thread_ts',
    type: 'string',
    required: false,
    description: 'Timestamp of parent message to reply in thread',
    examples: ['1234567890.123456'],
    priority: 'low'
  }
];

export const uploadFile: FieldSchema[] = [
  {
    name: 'channels',
    type: 'array',
    required: true,
    description: 'Array of channel IDs or names to share the file to',
    examples: [
      ['#general'],
      ['#project-alpha', '#team-updates'],
      ['C1234567890']
    ],
    priority: 'high'
  },
  {
    name: 'file',
    type: 'string',
    required: true,
    description: 'File path, URL, or base64 encoded content to upload',
    examples: [
      '/path/to/report.pdf',
      'https://example.com/image.png',
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...'
    ],
    priority: 'high'
  },
  {
    name: 'filename',
    type: 'string',
    required: false,
    description: 'Name for the uploaded file',
    examples: ['weekly-report.pdf', 'screenshot.png', 'data-export.csv'],
    priority: 'medium'
  },
  {
    name: 'title',
    type: 'string',
    required: false,
    description: 'Title for the file upload',
    examples: ['Weekly Report', 'Bug Screenshot', 'Performance Data'],
    priority: 'medium'
  },
  {
    name: 'initial_comment',
    type: 'string',
    required: false,
    description: 'Comment to include with the file upload',
    examples: [
      'Here is this week\'s performance report',
      'Screenshot of the bug we discussed',
      'Latest data export for analysis'
    ],
    priority: 'medium'
  },
  {
    name: 'thread_ts',
    type: 'string',
    required: false,
    description: 'Timestamp of parent message to upload file in thread',
    examples: ['1234567890.123456'],
    priority: 'low'
  }
];