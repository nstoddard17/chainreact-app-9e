/**
 * Mock Trigger Data Registry
 *
 * Provides realistic mock data for every trigger type
 * Used in sandbox mode when TriggerTestMode.USE_MOCK_DATA is selected
 */

import { MockTriggerData } from './types'

export const MOCK_TRIGGER_DATA: Record<string, MockTriggerData> = {
  // Manual trigger
  'manual': {
    type: 'manual',
    description: 'Manual workflow trigger',
    data: {
      triggeredBy: 'Test User',
      triggeredAt: new Date().toISOString(),
      source: 'sandbox_test'
    }
  },

  // Webhook trigger
  'webhook': {
    type: 'webhook',
    description: 'Generic webhook payload',
    data: {
      event: 'test.webhook',
      payload: {
        id: 'test_123',
        name: 'Test Event',
        data: {
          message: 'This is a test webhook payload',
          value: 42
        }
      },
      timestamp: new Date().toISOString(),
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Sandbox-Test/1.0'
      }
    },
    variations: [
      {
        name: 'Stripe Payment',
        description: 'Stripe payment webhook',
        data: {
          event: 'payment_intent.succeeded',
          payload: {
            id: 'pi_test_123',
            amount: 5000,
            currency: 'usd',
            customer: 'cus_test_456',
            status: 'succeeded'
          }
        }
      },
      {
        name: 'GitHub Push',
        description: 'GitHub push webhook',
        data: {
          event: 'push',
          repository: {
            name: 'test-repo',
            full_name: 'user/test-repo'
          },
          commits: [
            {
              id: 'abc123',
              message: 'Test commit',
              author: { name: 'Test User', email: 'test@example.com' }
            }
          ]
        }
      }
    ]
  },

  // Schedule trigger
  'schedule': {
    type: 'schedule',
    description: 'Scheduled workflow execution',
    data: {
      scheduledTime: new Date().toISOString(),
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'America/New_York',
      executionCount: 1
    }
  },

  // Gmail triggers
  'gmail_trigger_new_email': {
    type: 'gmail_trigger_new_email',
    description: 'New email received in Gmail',
    data: {
      email: {
        id: 'test_email_123',
        threadId: 'test_thread_456',
        from: {
          name: 'John Doe',
          email: 'john.doe@example.com'
        },
        to: [
          {
            name: 'You',
            email: 'you@example.com'
          }
        ],
        subject: 'Test Email Subject',
        body: 'This is a test email body with some content.\n\nBest regards,\nJohn',
        bodyHtml: '<p>This is a test email body with some content.</p><p>Best regards,<br>John</p>',
        date: new Date().toISOString(),
        labels: ['INBOX', 'UNREAD'],
        hasAttachments: false,
        snippet: 'This is a test email body with some content. Best regards, John'
      }
    },
    variations: [
      {
        name: 'With Attachments',
        description: 'Email with PDF attachment',
        data: {
          email: {
            id: 'test_email_789',
            from: { name: 'Jane Smith', email: 'jane@example.com' },
            subject: 'Document for Review',
            body: 'Please review the attached document.',
            hasAttachments: true,
            attachments: [
              {
                filename: 'document.pdf',
                mimeType: 'application/pdf',
                size: 245678,
                attachmentId: 'att_123'
              }
            ]
          }
        }
      }
    ]
  },

  'gmail_trigger_new_attachment': {
    type: 'gmail_trigger_new_attachment',
    description: 'Email received with new attachment',
    data: {
      email: {
        id: 'test_email_att_123',
        from: { name: 'Sender Name', email: 'sender@example.com' },
        subject: 'Files Attached',
        date: new Date().toISOString()
      },
      attachment: {
        filename: 'report.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 156789,
        attachmentId: 'att_456',
        data: null // In real execution, would contain base64 data
      }
    }
  },

  'gmail_trigger_new_label': {
    type: 'gmail_trigger_new_label',
    description: 'Email labeled in Gmail',
    data: {
      email: {
        id: 'test_email_label_123',
        subject: 'Important Email',
        from: { email: 'important@example.com' },
        labels: ['INBOX', 'Important']
      },
      label: {
        id: 'Label_123',
        name: 'Important',
        type: 'user'
      }
    }
  },

  // Google Calendar triggers
  'google_calendar_trigger_new_event': {
    type: 'google_calendar_trigger_new_event',
    description: 'New calendar event created',
    data: {
      event: {
        id: 'test_event_123',
        summary: 'Team Meeting',
        description: 'Quarterly planning meeting',
        start: {
          dateTime: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
          timeZone: 'America/New_York'
        },
        end: {
          dateTime: new Date(Date.now() + 90000000).toISOString(),
          timeZone: 'America/New_York'
        },
        attendees: [
          { email: 'user1@example.com', responseStatus: 'accepted' },
          { email: 'user2@example.com', responseStatus: 'needsAction' }
        ],
        location: 'Conference Room A',
        hangoutLink: 'https://meet.google.com/abc-defg-hij'
      }
    }
  },

  'google_calendar_trigger_event_updated': {
    type: 'google_calendar_trigger_event_updated',
    description: 'Calendar event updated',
    data: {
      event: {
        id: 'test_event_456',
        summary: 'Team Meeting - UPDATED',
        updated: new Date().toISOString(),
        changes: {
          summary: { old: 'Team Meeting', new: 'Team Meeting - UPDATED' },
          start: { changed: true }
        }
      }
    }
  },

  'google_calendar_trigger_event_canceled': {
    type: 'google_calendar_trigger_event_canceled',
    description: 'Calendar event canceled',
    data: {
      event: {
        id: 'test_event_789',
        summary: 'Canceled Meeting',
        status: 'cancelled',
        canceledAt: new Date().toISOString()
      }
    }
  },

  // Google Drive triggers
  'google-drive:new_file_in_folder': {
    type: 'google-drive:new_file_in_folder',
    description: 'New file added to Google Drive folder',
    data: {
      file: {
        id: 'test_file_123',
        name: 'Q4 Report.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        webViewLink: 'https://drive.google.com/file/d/test_file_123/view',
        size: 45678,
        createdTime: new Date().toISOString(),
        modifiedTime: new Date().toISOString(),
        owners: [{ displayName: 'Test User', emailAddress: 'test@example.com' }],
        parents: ['folder_123']
      }
    }
  },

  'google-drive:new_folder_in_folder': {
    type: 'google-drive:new_folder_in_folder',
    description: 'New folder created in Google Drive',
    data: {
      folder: {
        id: 'test_folder_456',
        name: '2024 Q4',
        mimeType: 'application/vnd.google-apps.folder',
        webViewLink: 'https://drive.google.com/drive/folders/test_folder_456',
        createdTime: new Date().toISOString(),
        parents: ['parent_folder_123']
      }
    }
  },

  'google-drive:file_updated': {
    type: 'google-drive:file_updated',
    description: 'File modified in Google Drive',
    data: {
      file: {
        id: 'test_file_789',
        name: 'Budget.xlsx',
        mimeType: 'application/vnd.google-apps.spreadsheet',
        modifiedTime: new Date().toISOString(),
        modifiedBy: { displayName: 'Test User', emailAddress: 'test@example.com' },
        version: 5
      }
    }
  },

  // Discord triggers
  'discord_trigger_new_message': {
    type: 'discord_trigger_new_message',
    description: 'New message in Discord channel',
    data: {
      message: {
        id: '1234567890123456789',
        content: 'This is a test Discord message',
        author: {
          id: '9876543210987654321',
          username: 'TestUser',
          discriminator: '1234',
          avatar: 'avatar_hash'
        },
        channelId: '1111111111111111111',
        guildId: '2222222222222222222',
        timestamp: new Date().toISOString(),
        mentions: [],
        attachments: [],
        embeds: []
      }
    }
  },

  'discord_trigger_member_joined': {
    type: 'discord_trigger_member_joined',
    description: 'New member joined Discord server',
    data: {
      member: {
        id: '3333333333333333333',
        username: 'NewMember',
        discriminator: '5678',
        joinedAt: new Date().toISOString(),
        roles: [],
        guildId: '2222222222222222222'
      }
    }
  },

  'discord_trigger_member_left': {
    type: 'discord_trigger_member_left',
    description: 'Member left Discord server',
    data: {
      member: {
        id: '4444444444444444444',
        username: 'FormerMember',
        leftAt: new Date().toISOString(),
        guildId: '2222222222222222222'
      }
    }
  },

  // Slack triggers
  'slack_trigger_new_message': {
    type: 'slack_trigger_new_message',
    description: 'New message in Slack channel',
    data: {
      message: {
        ts: '1234567890.123456',
        text: 'This is a test Slack message',
        user: 'U1234567890',
        channel: 'C9876543210',
        team: 'T1111111111'
      },
      user_info: {
        id: 'U1234567890',
        name: 'testuser',
        real_name: 'Test User',
        profile: {
          email: 'test@example.com',
          image_48: 'https://secure.gravatar.com/avatar/test.jpg'
        }
      }
    }
  },

  // Notion triggers
  'notion_trigger_page_created': {
    type: 'notion_trigger_page_created',
    description: 'New page created in Notion',
    data: {
      page: {
        id: 'test_page_123',
        created_time: new Date().toISOString(),
        last_edited_time: new Date().toISOString(),
        properties: {
          Name: {
            title: [{ text: { content: 'Test Page' } }]
          },
          Status: {
            select: { name: 'In Progress' }
          }
        },
        url: 'https://notion.so/test_page_123'
      }
    }
  },

  // Airtable triggers
  'airtable_trigger_new_record': {
    type: 'airtable_trigger_new_record',
    description: 'New record created in Airtable',
    data: {
      record: {
        id: 'recTest123',
        createdTime: new Date().toISOString(),
        fields: {
          Name: 'Test Record',
          Status: 'Active',
          Email: 'test@example.com',
          Count: 5
        }
      },
      baseId: 'appTestBase123',
      tableId: 'tblTestTable456'
    }
  },

  'airtable_trigger_record_updated': {
    type: 'airtable_trigger_record_updated',
    description: 'Record updated in Airtable',
    data: {
      record: {
        id: 'recTest456',
        fields: {
          Name: 'Updated Record',
          Status: 'Completed',
          LastModified: new Date().toISOString()
        }
      }
    }
  },

  // HubSpot triggers
  'hubspot_trigger_contact_created': {
    type: 'hubspot_trigger_contact_created',
    description: 'New contact created in HubSpot',
    data: {
      contact: {
        id: '123',
        properties: {
          email: 'contact@example.com',
          firstname: 'John',
          lastname: 'Doe',
          company: 'Test Company',
          phone: '555-0123',
          createdate: new Date().toISOString()
        }
      }
    }
  },

  // Twitter triggers
  'twitter_trigger_new_mention': {
    type: 'twitter_trigger_new_mention',
    description: 'New Twitter mention',
    data: {
      tweet: {
        id: '1234567890123456789',
        text: '@yourusername This is a test mention!',
        author: {
          id: '9876543210987654321',
          username: 'testuser',
          name: 'Test User'
        },
        created_at: new Date().toISOString(),
        public_metrics: {
          like_count: 5,
          retweet_count: 2,
          reply_count: 1
        }
      }
    }
  }
}

/**
 * Get mock data for a trigger type
 */
export function getMockTriggerData(triggerType: string, variationName?: string): any {
  const mockData = MOCK_TRIGGER_DATA[triggerType]

  if (!mockData) {
    // Return generic mock data if specific trigger type not found
    return {
      triggerType,
      timestamp: new Date().toISOString(),
      testMode: true,
      message: `Mock data for ${triggerType} trigger`
    }
  }

  // If variation requested, return that
  if (variationName && mockData.variations) {
    const variation = mockData.variations.find(v => v.name === variationName)
    if (variation) {
      return variation.data
    }
  }

  // Return default mock data
  return mockData.data
}

/**
 * Get all available variations for a trigger type
 */
export function getTriggerVariations(triggerType: string): string[] {
  const mockData = MOCK_TRIGGER_DATA[triggerType]
  if (!mockData || !mockData.variations) {
    return []
  }
  return mockData.variations.map(v => v.name)
}

/**
 * Get description for a trigger's mock data
 */
export function getTriggerMockDescription(triggerType: string, variationName?: string): string {
  const mockData = MOCK_TRIGGER_DATA[triggerType]
  if (!mockData) {
    return `Mock data for ${triggerType}`
  }

  if (variationName && mockData.variations) {
    const variation = mockData.variations.find(v => v.name === variationName)
    if (variation) {
      return variation.description
    }
  }

  return mockData.description
}
