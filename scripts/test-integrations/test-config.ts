/**
 * Integration Test Configuration
 *
 * Defines test cases for each provider's actions and triggers.
 * The automated test runner uses this to verify all integrations work correctly.
 */

export interface ActionTest {
  nodeType: string
  actionName: string
  config: Record<string, any>
  expectedApiEndpoint?: string
  expectedMethod?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  requiredFields: string[]
  skipReason?: string // Why this test is skipped (e.g., "Requires production API key")
}

export interface TriggerTest {
  nodeType: string
  triggerName: string
  webhookPayload: any
  expectedTrigger: boolean
  requiredWebhookFields: string[]
  skipReason?: string
}

export interface ProviderTestConfig {
  provider: string
  displayName: string
  requiresRealAccount: boolean // If true, test needs actual connected account
  actions: ActionTest[]
  triggers: TriggerTest[]
  testAccountEmail?: string // Email for test account (for logging purposes only)
}

// ================================================================
// TEST CONFIGURATIONS
// ================================================================

export const testConfigs: ProviderTestConfig[] = [
  // ----------------------------------------------------------------
  // GMAIL
  // ----------------------------------------------------------------
  {
    provider: 'gmail',
    displayName: 'Gmail',
    requiresRealAccount: true,
    testAccountEmail: process.env.TEST_GMAIL_ACCOUNT,
    actions: [
      {
        nodeType: 'gmail_send_email',
        actionName: 'Send Email',
        config: {
          to: 'test@example.com',
          subject: 'Test Email',
          body: 'This is a test email from ChainReact automated testing.',
        },
        expectedApiEndpoint: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        expectedMethod: 'POST',
        requiredFields: ['to', 'subject', 'body'],
      },
    ],
    triggers: [
      {
        nodeType: 'gmail_new_email',
        triggerName: 'New Email',
        webhookPayload: {
          historyId: '12345',
          emailAddress: 'test@gmail.com',
        },
        expectedTrigger: true,
        requiredWebhookFields: ['historyId'],
      },
    ],
  },

  // ----------------------------------------------------------------
  // HUBSPOT
  // ----------------------------------------------------------------
  {
    provider: 'hubspot',
    displayName: 'HubSpot',
    requiresRealAccount: true,
    testAccountEmail: process.env.TEST_HUBSPOT_ACCOUNT,
    actions: [
      {
        nodeType: 'hubspot_create_contact',
        actionName: 'Create Contact',
        config: {
          email: 'test@example.com',
          firstname: 'Test',
          lastname: 'Contact',
        },
        expectedApiEndpoint: 'https://api.hubapi.com/crm/v3/objects/contacts',
        expectedMethod: 'POST',
        requiredFields: ['email'],
      },
      {
        nodeType: 'hubspot_update_contact',
        actionName: 'Update Contact',
        config: {
          contactId: 'test-contact-id',
          email: 'updated@example.com',
        },
        expectedApiEndpoint: 'https://api.hubapi.com/crm/v3/objects/contacts',
        expectedMethod: 'PATCH',
        requiredFields: ['contactId'],
      },
    ],
    triggers: [
      {
        nodeType: 'hubspot_contact_created',
        triggerName: 'Contact Created',
        webhookPayload: {
          objectId: 12345,
          propertyName: 'email',
          propertyValue: 'test@example.com',
          subscriptionType: 'contact.creation',
          portalId: 123456,
        },
        expectedTrigger: true,
        requiredWebhookFields: ['objectId', 'subscriptionType'],
      },
    ],
  },

  // ----------------------------------------------------------------
  // SLACK
  // ----------------------------------------------------------------
  {
    provider: 'slack',
    displayName: 'Slack',
    requiresRealAccount: true,
    actions: [
      {
        nodeType: 'slack_post_message',
        actionName: 'Post Message',
        config: {
          channel: 'general',
          text: 'Test message from ChainReact automated testing',
        },
        expectedApiEndpoint: 'https://slack.com/api/chat.postMessage',
        expectedMethod: 'POST',
        requiredFields: ['channel', 'text'],
      },
    ],
    triggers: [
      {
        nodeType: 'slack_new_message',
        triggerName: 'New Message',
        webhookPayload: {
          type: 'message',
          channel: 'C12345678',
          user: 'U12345678',
          text: 'Test message',
          ts: '1234567890.123456',
        },
        expectedTrigger: true,
        requiredWebhookFields: ['type', 'text'],
      },
    ],
  },

  // ----------------------------------------------------------------
  // DISCORD
  // ----------------------------------------------------------------
  {
    provider: 'discord',
    displayName: 'Discord',
    requiresRealAccount: true,
    actions: [
      {
        nodeType: 'discord_send_message',
        actionName: 'Send Message',
        config: {
          channel_id: 'test-channel-id',
          content: 'Test message from ChainReact',
        },
        expectedApiEndpoint: 'https://discord.com/api/v10/channels',
        expectedMethod: 'POST',
        requiredFields: ['channel_id', 'content'],
      },
    ],
    triggers: [
      {
        nodeType: 'discord_new_message',
        triggerName: 'New Message',
        webhookPayload: {
          content: 'Test message',
          author: {
            id: '123456789',
            username: 'TestUser',
          },
          channel_id: '987654321',
        },
        expectedTrigger: true,
        requiredWebhookFields: ['content', 'author', 'channel_id'],
      },
    ],
  },

  // ----------------------------------------------------------------
  // GUMROAD
  // ----------------------------------------------------------------
  {
    provider: 'gumroad',
    displayName: 'Gumroad',
    requiresRealAccount: true,
    actions: [
      {
        nodeType: 'gumroad_create_product',
        actionName: 'Create Product',
        config: {
          name: 'Test Product',
          price: 1000, // $10.00
        },
        skipReason: 'Gumroad API requires production access - test manually',
      },
    ],
    triggers: [
      {
        nodeType: 'gumroad_sale',
        triggerName: 'Sale',
        webhookPayload: {
          seller_id: 'test-seller',
          product_id: 'test-product',
          product_name: 'Test Product',
          price: 1000,
          email: 'buyer@example.com',
          purchase_email: 'buyer@example.com',
          sale_id: 'test-sale-123',
          sale_timestamp: '2025-01-01T00:00:00Z',
        },
        expectedTrigger: true,
        requiredWebhookFields: ['sale_id', 'product_id', 'email'],
      },
    ],
  },

  // ----------------------------------------------------------------
  // GOOGLE SHEETS
  // ----------------------------------------------------------------
  {
    provider: 'google-sheets',
    displayName: 'Google Sheets',
    requiresRealAccount: true,
    actions: [
      {
        nodeType: 'google_sheets_add_row',
        actionName: 'Add Row',
        config: {
          spreadsheetId: 'test-spreadsheet-id',
          sheetName: 'Sheet1',
          values: ['Test', 'Data', 'Row'],
        },
        expectedApiEndpoint: 'https://sheets.googleapis.com/v4/spreadsheets',
        expectedMethod: 'POST',
        requiredFields: ['spreadsheetId', 'values'],
      },
    ],
    triggers: [
      {
        nodeType: 'google_sheets_new_row',
        triggerName: 'New Row',
        webhookPayload: {
          spreadsheetId: 'test-id',
          sheetName: 'Sheet1',
          values: ['New', 'Row', 'Data'],
        },
        expectedTrigger: true,
        requiredWebhookFields: ['spreadsheetId', 'values'],
      },
    ],
  },

  // ----------------------------------------------------------------
  // NOTION
  // ----------------------------------------------------------------
  {
    provider: 'notion',
    displayName: 'Notion',
    requiresRealAccount: true,
    actions: [
      {
        nodeType: 'notion_create_page',
        actionName: 'Create Page',
        config: {
          parent: { database_id: 'test-database-id' },
          properties: {
            Name: {
              title: [{ text: { content: 'Test Page' } }],
            },
          },
        },
        expectedApiEndpoint: 'https://api.notion.com/v1/pages',
        expectedMethod: 'POST',
        requiredFields: ['parent', 'properties'],
      },
    ],
    triggers: [
      {
        nodeType: 'notion_new_page',
        triggerName: 'New Page',
        webhookPayload: {
          type: 'page',
          page: {
            id: 'test-page-id',
            properties: {},
          },
        },
        expectedTrigger: true,
        requiredWebhookFields: ['type', 'page'],
      },
    ],
  },

  // ----------------------------------------------------------------
  // STRIPE
  // ----------------------------------------------------------------
  {
    provider: 'stripe',
    displayName: 'Stripe',
    requiresRealAccount: true,
    actions: [
      {
        nodeType: 'stripe_create_customer',
        actionName: 'Create Customer',
        config: {
          email: 'test@example.com',
          name: 'Test Customer',
        },
        expectedApiEndpoint: 'https://api.stripe.com/v1/customers',
        expectedMethod: 'POST',
        requiredFields: ['email'],
      },
    ],
    triggers: [
      {
        nodeType: 'stripe_payment_succeeded',
        triggerName: 'Payment Succeeded',
        webhookPayload: {
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_test123',
              amount: 1000,
              currency: 'usd',
              status: 'succeeded',
            },
          },
        },
        expectedTrigger: true,
        requiredWebhookFields: ['type', 'data'],
      },
    ],
  },

  // ----------------------------------------------------------------
  // AIRTABLE
  // ----------------------------------------------------------------
  {
    provider: 'airtable',
    displayName: 'Airtable',
    requiresRealAccount: true,
    actions: [
      {
        nodeType: 'airtable_create_record',
        actionName: 'Create Record',
        config: {
          baseId: 'test-base-id',
          tableId: 'test-table-id',
          fields: {
            Name: 'Test Record',
          },
        },
        expectedApiEndpoint: 'https://api.airtable.com/v0',
        expectedMethod: 'POST',
        requiredFields: ['baseId', 'tableId', 'fields'],
      },
    ],
    triggers: [
      {
        nodeType: 'airtable_new_record',
        triggerName: 'New Record',
        webhookPayload: {
          baseId: 'test-base-id',
          tableId: 'test-table-id',
          fields: {
            id: 'rec123',
            fields: { Name: 'New Record' },
          },
        },
        expectedTrigger: true,
        requiredWebhookFields: ['baseId', 'tableId'],
      },
    ],
  },

  // ----------------------------------------------------------------
  // TRELLO
  // ----------------------------------------------------------------
  {
    provider: 'trello',
    displayName: 'Trello',
    requiresRealAccount: true,
    actions: [
      {
        nodeType: 'trello_create_card',
        actionName: 'Create Card',
        config: {
          listId: 'test-list-id',
          name: 'Test Card',
          desc: 'Test card description',
        },
        expectedApiEndpoint: 'https://api.trello.com/1/cards',
        expectedMethod: 'POST',
        requiredFields: ['listId', 'name'],
      },
    ],
    triggers: [
      {
        nodeType: 'trello_card_created',
        triggerName: 'Card Created',
        webhookPayload: {
          action: {
            type: 'createCard',
            data: {
              card: {
                id: 'test-card-id',
                name: 'New Card',
              },
            },
          },
        },
        expectedTrigger: true,
        requiredWebhookFields: ['action'],
      },
    ],
  },
]

/**
 * Get test config for a specific provider
 */
export function getProviderTestConfig(provider: string): ProviderTestConfig | undefined {
  return testConfigs.find(config => config.provider === provider)
}

/**
 * Get all providers that have test configs
 */
export function getTestedProviders(): string[] {
  return testConfigs.map(config => config.provider)
}

/**
 * Get all providers that require real accounts
 */
export function getProvidersRequiringAccounts(): string[] {
  return testConfigs
    .filter(config => config.requiresRealAccount)
    .map(config => config.provider)
}
