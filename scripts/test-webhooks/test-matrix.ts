/**
 * Webhook Test Matrix
 *
 * Defines all test cases for the webhook trigger test harness.
 * Each case specifies the provider, endpoint, signature scheme,
 * fixture, and explicit match/execution expectations.
 */

export interface WebhookTestCase {
  /** Unique test case ID, e.g. "github-push-001" */
  id: string

  /** Provider name */
  provider: string

  /** Expected trigger type after normalization */
  triggerType: string

  /** Human-readable description */
  description: string

  /** Webhook endpoint path (relative to base URL) */
  endpoint: string

  /** Signature scheme to use */
  signatureScheme: 'github' | 'shopify' | 'slack' | 'monday' | 'stripe' | 'discord' | 'notion' | 'generic' | 'none'

  /** Env var name that holds the secret for this provider */
  secretEnvVar: string

  /** Path to fixture file (relative to fixtures/webhooks/) */
  fixtureFile: string

  /** Extra headers to include (e.g. x-github-event) */
  extraHeaders?: Record<string, string>

  /** Content-Type header (default: application/json) */
  contentType?: string

  /** Expected HTTP status code from the endpoint */
  expectedHttpStatus: number

  /** Match expectations — explicit per test */
  expectedMatch: {
    /** Expected number of matched workflows (0 for no-match tests) */
    count: number
    /** Optional: assert a specific workflow ID was matched */
    workflowId?: string
    /** Optional: assert the trigger type that was matched */
    triggerType?: string
  }

  /** Execution expectations — separate from match */
  expectedExecution: {
    /** Whether execution sessions should exist */
    shouldExecute: boolean
    /** Expected execution status (only checked if shouldExecute=true) */
    status?: 'completed' | 'failed'
  }

  /** Tags for filtering test runs */
  tags: string[]

  /** Optional fixture-derived query params appended to the endpoint URL.
   *  Maps query param name → TestFixture field name. Resolved by runner after fixture setup. */
  endpointParams?: Record<string, 'workflowId' | 'nodeId'>
}

// ---------------------------------------------------------------------------
// Positive-match test cases (smoke tests)
// ---------------------------------------------------------------------------

const githubPush: WebhookTestCase = {
  id: 'github-push-001',
  provider: 'github',
  triggerType: 'github_trigger_new_commit',
  description: 'GitHub push event → new commit trigger',
  endpoint: '/api/webhooks/github',
  signatureScheme: 'github',
  secretEnvVar: 'GITHUB_WEBHOOK_SECRET',
  fixtureFile: 'github/push.json',
  extraHeaders: {
    'x-github-event': 'push',
    'x-github-delivery': 'test-delivery-001',
  },
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'github_trigger_new_commit',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['smoke', 'positive', 'github'],
}

const slackMessage: WebhookTestCase = {
  id: 'slack-message-001',
  provider: 'slack',
  triggerType: 'slack_trigger_new_message',
  description: 'Slack event_callback → message trigger',
  endpoint: '/api/webhooks/slack',
  signatureScheme: 'slack',
  secretEnvVar: 'SLACK_SIGNING_SECRET',
  fixtureFile: 'slack/message.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'slack_trigger_new_message',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['smoke', 'positive', 'slack'],
}

const shopifyOrderCreate: WebhookTestCase = {
  id: 'shopify-order-create-001',
  provider: 'shopify',
  triggerType: 'shopify_trigger_new_order',
  description: 'Shopify orders/create → new order trigger',
  endpoint: '/api/webhooks/shopify',
  signatureScheme: 'shopify',
  secretEnvVar: 'SHOPIFY_CLIENT_SECRET',
  fixtureFile: 'shopify/orders-create.json',
  extraHeaders: {
    'x-shopify-topic': 'orders/create',
    'x-shopify-shop-domain': 'test-shop.myshopify.com',
    'x-shopify-api-version': '2024-01',
  },
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'shopify_trigger_new_order',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['smoke', 'positive', 'shopify'],
}

const discordMessage: WebhookTestCase = {
  id: 'discord-message-001',
  provider: 'discord',
  triggerType: 'discord_trigger_new_message',
  description: 'Discord MESSAGE_CREATE → new message trigger',
  endpoint: '/api/webhooks/discord',
  signatureScheme: 'none',
  secretEnvVar: 'DISCORD_BOT_TOKEN',
  fixtureFile: 'discord/message-create.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'discord_trigger_new_message',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['smoke', 'positive', 'discord', 'generic-pipeline'],
}

const trelloCardCreate: WebhookTestCase = {
  id: 'trello-card-create-001',
  provider: 'trello',
  triggerType: 'trello_trigger_new_card',
  description: 'Trello createCard → new card trigger',
  endpoint: '/api/webhooks/trello',
  signatureScheme: 'none',
  secretEnvVar: 'TRELLO_WEBHOOK_SECRET',
  fixtureFile: 'trello/create-card.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'trello_trigger_new_card',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['smoke', 'positive', 'trello', 'generic-pipeline'],
}

// ---------------------------------------------------------------------------
// Additional positive-match test cases — Shopify
// ---------------------------------------------------------------------------

const shopifyPaidOrder: WebhookTestCase = {
  id: 'shopify-paid-order-001',
  provider: 'shopify',
  triggerType: 'shopify_trigger_new_paid_order',
  description: 'Shopify orders/paid → new paid order trigger',
  endpoint: '/api/webhooks/shopify',
  signatureScheme: 'shopify',
  secretEnvVar: 'SHOPIFY_CLIENT_SECRET',
  fixtureFile: 'shopify/orders-paid.json',
  extraHeaders: {
    'x-shopify-topic': 'orders/paid',
    'x-shopify-shop-domain': 'test-shop.myshopify.com',
    'x-shopify-api-version': '2024-01',
  },
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'shopify_trigger_new_paid_order',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'shopify'],
}

const shopifyOrderFulfilled: WebhookTestCase = {
  id: 'shopify-order-fulfilled-001',
  provider: 'shopify',
  triggerType: 'shopify_trigger_order_fulfilled',
  description: 'Shopify orders/fulfilled → order fulfilled trigger',
  endpoint: '/api/webhooks/shopify',
  signatureScheme: 'shopify',
  secretEnvVar: 'SHOPIFY_CLIENT_SECRET',
  fixtureFile: 'shopify/orders-fulfilled.json',
  extraHeaders: {
    'x-shopify-topic': 'orders/fulfilled',
    'x-shopify-shop-domain': 'test-shop.myshopify.com',
    'x-shopify-api-version': '2024-01',
  },
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'shopify_trigger_order_fulfilled',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'shopify'],
}

const shopifyOrderUpdated: WebhookTestCase = {
  id: 'shopify-order-updated-001',
  provider: 'shopify',
  triggerType: 'shopify_trigger_order_updated',
  description: 'Shopify orders/updated → order updated trigger',
  endpoint: '/api/webhooks/shopify',
  signatureScheme: 'shopify',
  secretEnvVar: 'SHOPIFY_CLIENT_SECRET',
  fixtureFile: 'shopify/orders-updated.json',
  extraHeaders: {
    'x-shopify-topic': 'orders/updated',
    'x-shopify-shop-domain': 'test-shop.myshopify.com',
    'x-shopify-api-version': '2024-01',
  },
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'shopify_trigger_order_updated',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'shopify'],
}

const shopifyAbandonedCart: WebhookTestCase = {
  id: 'shopify-abandoned-cart-001',
  provider: 'shopify',
  triggerType: 'shopify_trigger_abandoned_cart',
  description: 'Shopify checkouts/create → abandoned cart trigger',
  endpoint: '/api/webhooks/shopify',
  signatureScheme: 'shopify',
  secretEnvVar: 'SHOPIFY_CLIENT_SECRET',
  fixtureFile: 'shopify/checkouts-create.json',
  extraHeaders: {
    'x-shopify-topic': 'checkouts/create',
    'x-shopify-shop-domain': 'test-shop.myshopify.com',
    'x-shopify-api-version': '2024-01',
  },
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'shopify_trigger_abandoned_cart',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'shopify'],
}

const shopifyNewCustomer: WebhookTestCase = {
  id: 'shopify-new-customer-001',
  provider: 'shopify',
  triggerType: 'shopify_trigger_new_customer',
  description: 'Shopify customers/create → new customer trigger',
  endpoint: '/api/webhooks/shopify',
  signatureScheme: 'shopify',
  secretEnvVar: 'SHOPIFY_CLIENT_SECRET',
  fixtureFile: 'shopify/customers-create.json',
  extraHeaders: {
    'x-shopify-topic': 'customers/create',
    'x-shopify-shop-domain': 'test-shop.myshopify.com',
    'x-shopify-api-version': '2024-01',
  },
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'shopify_trigger_new_customer',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'shopify'],
}

const shopifyProductUpdated: WebhookTestCase = {
  id: 'shopify-product-updated-001',
  provider: 'shopify',
  triggerType: 'shopify_trigger_product_updated',
  description: 'Shopify products/update → product updated trigger',
  endpoint: '/api/webhooks/shopify',
  signatureScheme: 'shopify',
  secretEnvVar: 'SHOPIFY_CLIENT_SECRET',
  fixtureFile: 'shopify/products-update.json',
  extraHeaders: {
    'x-shopify-topic': 'products/update',
    'x-shopify-shop-domain': 'test-shop.myshopify.com',
    'x-shopify-api-version': '2024-01',
  },
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'shopify_trigger_product_updated',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'shopify'],
}

const shopifyInventoryLow: WebhookTestCase = {
  id: 'shopify-inventory-low-001',
  provider: 'shopify',
  triggerType: 'shopify_trigger_inventory_low',
  description: 'Shopify inventory_levels/update → inventory low trigger',
  endpoint: '/api/webhooks/shopify',
  signatureScheme: 'shopify',
  secretEnvVar: 'SHOPIFY_CLIENT_SECRET',
  fixtureFile: 'shopify/inventory-update.json',
  extraHeaders: {
    'x-shopify-topic': 'inventory_levels/update',
    'x-shopify-shop-domain': 'test-shop.myshopify.com',
    'x-shopify-api-version': '2024-01',
  },
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'shopify_trigger_inventory_low',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'shopify'],
}

// ---------------------------------------------------------------------------
// Additional positive-match test cases — Slack
// ---------------------------------------------------------------------------

const slackMessageIm: WebhookTestCase = {
  id: 'slack-message-im-001',
  provider: 'slack',
  triggerType: 'slack_trigger_message_im',
  description: 'Slack IM message → direct message trigger',
  endpoint: '/api/webhooks/slack',
  signatureScheme: 'slack',
  secretEnvVar: 'SLACK_SIGNING_SECRET',
  fixtureFile: 'slack/message-im.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 2, // matches both specific IM fixture and slack_trigger_new_message wildcard
    triggerType: 'slack_trigger_new_message',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'slack'],
}

const slackMessageMpim: WebhookTestCase = {
  id: 'slack-message-mpim-001',
  provider: 'slack',
  triggerType: 'slack_trigger_message_mpim',
  description: 'Slack MPIM message → group DM trigger',
  endpoint: '/api/webhooks/slack',
  signatureScheme: 'slack',
  secretEnvVar: 'SLACK_SIGNING_SECRET',
  fixtureFile: 'slack/message-mpim.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 2, // matches specific mpim fixture + slack_trigger_new_message wildcard
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'slack'],
}

const slackReactionAdded: WebhookTestCase = {
  id: 'slack-reaction-added-001',
  provider: 'slack',
  triggerType: 'slack_trigger_reaction_added',
  description: 'Slack reaction_added → reaction added trigger',
  endpoint: '/api/webhooks/slack',
  signatureScheme: 'slack',
  secretEnvVar: 'SLACK_SIGNING_SECRET',
  fixtureFile: 'slack/reaction-added.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'slack_trigger_reaction_added',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'slack'],
}

const slackReactionRemoved: WebhookTestCase = {
  id: 'slack-reaction-removed-001',
  provider: 'slack',
  triggerType: 'slack_trigger_reaction_removed',
  description: 'Slack reaction_removed → reaction removed trigger',
  endpoint: '/api/webhooks/slack',
  signatureScheme: 'slack',
  secretEnvVar: 'SLACK_SIGNING_SECRET',
  fixtureFile: 'slack/reaction-removed.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'slack_trigger_reaction_removed',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'slack'],
}

const slackChannelCreated: WebhookTestCase = {
  id: 'slack-channel-created-001',
  provider: 'slack',
  triggerType: 'slack_trigger_channel_created',
  description: 'Slack channel_created → channel created trigger',
  endpoint: '/api/webhooks/slack',
  signatureScheme: 'slack',
  secretEnvVar: 'SLACK_SIGNING_SECRET',
  fixtureFile: 'slack/channel-created.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'slack_trigger_channel_created',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'slack'],
}

const slackMemberJoined: WebhookTestCase = {
  id: 'slack-member-joined-001',
  provider: 'slack',
  triggerType: 'slack_trigger_member_joined_channel',
  description: 'Slack member_joined_channel → member joined trigger',
  endpoint: '/api/webhooks/slack',
  signatureScheme: 'slack',
  secretEnvVar: 'SLACK_SIGNING_SECRET',
  fixtureFile: 'slack/member-joined.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'slack_trigger_member_joined_channel',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'slack'],
}

const slackMemberLeft: WebhookTestCase = {
  id: 'slack-member-left-001',
  provider: 'slack',
  triggerType: 'slack_trigger_member_left_channel',
  description: 'Slack member_left_channel → member left trigger',
  endpoint: '/api/webhooks/slack',
  signatureScheme: 'slack',
  secretEnvVar: 'SLACK_SIGNING_SECRET',
  fixtureFile: 'slack/member-left.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'slack_trigger_member_left_channel',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'slack'],
}

const slackFileShared: WebhookTestCase = {
  id: 'slack-file-shared-001',
  provider: 'slack',
  triggerType: 'slack_trigger_file_uploaded',
  description: 'Slack file_shared → file uploaded trigger',
  endpoint: '/api/webhooks/slack',
  signatureScheme: 'slack',
  secretEnvVar: 'SLACK_SIGNING_SECRET',
  fixtureFile: 'slack/file-shared.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'slack_trigger_file_uploaded',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'slack'],
}

const slackTeamJoin: WebhookTestCase = {
  id: 'slack-team-join-001',
  provider: 'slack',
  triggerType: 'slack_trigger_user_joined_workspace',
  description: 'Slack team_join → user joined workspace trigger',
  endpoint: '/api/webhooks/slack',
  signatureScheme: 'slack',
  secretEnvVar: 'SLACK_SIGNING_SECRET',
  fixtureFile: 'slack/team-join.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'slack_trigger_user_joined_workspace',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'slack'],
}

// ---------------------------------------------------------------------------
// Additional positive-match test cases — Discord
// ---------------------------------------------------------------------------

const discordMemberJoin: WebhookTestCase = {
  id: 'discord-member-join-001',
  provider: 'discord',
  triggerType: 'discord_trigger_member_join',
  description: 'Discord GUILD_MEMBER_ADD → member join trigger',
  endpoint: '/api/webhooks/discord',
  signatureScheme: 'none',
  secretEnvVar: 'DISCORD_BOT_TOKEN',
  fixtureFile: 'discord/member-join.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'discord_trigger_member_join',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'discord'],
}

const discordSlashCommand: WebhookTestCase = {
  id: 'discord-slash-command-001',
  provider: 'discord',
  triggerType: 'discord_trigger_slash_command',
  description: 'Discord INTERACTION_CREATE → slash command trigger',
  endpoint: '/api/webhooks/discord',
  signatureScheme: 'none',
  secretEnvVar: 'DISCORD_BOT_TOKEN',
  fixtureFile: 'discord/slash-command.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'discord_trigger_slash_command',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'discord'],
}

// ---------------------------------------------------------------------------
// Additional positive-match test cases — Trello
// ---------------------------------------------------------------------------

const trelloCardUpdated: WebhookTestCase = {
  id: 'trello-card-updated-001',
  provider: 'trello',
  triggerType: 'trello_trigger_card_updated',
  description: 'Trello updateCard → card updated trigger',
  endpoint: '/api/webhooks/trello',
  signatureScheme: 'none',
  secretEnvVar: 'TRELLO_WEBHOOK_SECRET',
  fixtureFile: 'trello/update-card.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'trello_trigger_card_updated',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'trello'],
}

const trelloCardMoved: WebhookTestCase = {
  id: 'trello-card-moved-001',
  provider: 'trello',
  triggerType: 'trello_trigger_card_moved',
  description: 'Trello moveCard → card moved trigger',
  endpoint: '/api/webhooks/trello',
  signatureScheme: 'none',
  secretEnvVar: 'TRELLO_WEBHOOK_SECRET',
  fixtureFile: 'trello/move-card.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'trello_trigger_card_moved',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'trello'],
}

const trelloCommentAdded: WebhookTestCase = {
  id: 'trello-comment-added-001',
  provider: 'trello',
  triggerType: 'trello_trigger_comment_added',
  description: 'Trello commentCard → comment added trigger',
  endpoint: '/api/webhooks/trello',
  signatureScheme: 'none',
  secretEnvVar: 'TRELLO_WEBHOOK_SECRET',
  fixtureFile: 'trello/comment-card.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'trello_trigger_comment_added',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'trello'],
}

const trelloCardArchived: WebhookTestCase = {
  id: 'trello-card-archived-001',
  provider: 'trello',
  triggerType: 'trello_trigger_card_archived',
  description: 'Trello archiveCard → card archived trigger',
  endpoint: '/api/webhooks/trello',
  signatureScheme: 'none',
  secretEnvVar: 'TRELLO_WEBHOOK_SECRET',
  fixtureFile: 'trello/archive-card.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'trello_trigger_card_archived',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'trello'],
}

const trelloMemberChanged: WebhookTestCase = {
  id: 'trello-member-changed-001',
  provider: 'trello',
  triggerType: 'trello_trigger_member_changed',
  description: 'Trello addMemberToCard → member changed trigger',
  endpoint: '/api/webhooks/trello',
  signatureScheme: 'none',
  secretEnvVar: 'TRELLO_WEBHOOK_SECRET',
  fixtureFile: 'trello/add-member.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'trello_trigger_member_changed',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'trello'],
}

// ---------------------------------------------------------------------------
// Additional positive-match test cases — Monday
// ---------------------------------------------------------------------------

const mondayColumnChanged: WebhookTestCase = {
  id: 'monday-column-changed-001',
  provider: 'monday',
  triggerType: 'monday_trigger_column_changed',
  description: 'Monday change_column_value → column changed trigger',
  endpoint: '/api/webhooks/monday',
  signatureScheme: 'monday',
  secretEnvVar: 'MONDAY_SIGNING_SECRET',
  fixtureFile: 'monday/column-change.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'monday_trigger_column_changed',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'monday'],
}

const mondayItemMoved: WebhookTestCase = {
  id: 'monday-item-moved-001',
  provider: 'monday',
  triggerType: 'monday_trigger_item_moved',
  description: 'Monday move_item → item moved trigger',
  endpoint: '/api/webhooks/monday',
  signatureScheme: 'monday',
  secretEnvVar: 'MONDAY_SIGNING_SECRET',
  fixtureFile: 'monday/item-moved.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'monday_trigger_item_moved',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'monday'],
}

const mondayNewSubitem: WebhookTestCase = {
  id: 'monday-new-subitem-001',
  provider: 'monday',
  triggerType: 'monday_trigger_new_subitem',
  description: 'Monday create_subitem → new subitem trigger',
  endpoint: '/api/webhooks/monday',
  signatureScheme: 'monday',
  secretEnvVar: 'MONDAY_SIGNING_SECRET',
  fixtureFile: 'monday/create-subitem.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'monday_trigger_new_subitem',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'monday'],
}

const mondayNewUpdate: WebhookTestCase = {
  id: 'monday-new-update-001',
  provider: 'monday',
  triggerType: 'monday_trigger_new_update',
  description: 'Monday create_update → new update trigger',
  endpoint: '/api/webhooks/monday',
  signatureScheme: 'monday',
  secretEnvVar: 'MONDAY_SIGNING_SECRET',
  fixtureFile: 'monday/create-update.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'monday_trigger_new_update',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'monday'],
}

// ---------------------------------------------------------------------------
// Additional positive-match test cases — HubSpot
// ---------------------------------------------------------------------------

const hubspotContactUpdated: WebhookTestCase = {
  id: 'hubspot-contact-updated-001',
  provider: 'hubspot',
  triggerType: 'hubspot_trigger_contact_updated',
  description: 'HubSpot contact.propertyChange → contact updated trigger',
  endpoint: '/api/webhooks/hubspot',
  signatureScheme: 'none',
  secretEnvVar: 'HUBSPOT_CLIENT_SECRET',
  fixtureFile: 'hubspot/contact-updated.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'hubspot_trigger_contact_updated',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'hubspot'],
}

const hubspotContactDeleted: WebhookTestCase = {
  id: 'hubspot-contact-deleted-001',
  provider: 'hubspot',
  triggerType: 'hubspot_trigger_contact_deleted',
  description: 'HubSpot contact.deletion → contact deleted trigger',
  endpoint: '/api/webhooks/hubspot',
  signatureScheme: 'none',
  secretEnvVar: 'HUBSPOT_CLIENT_SECRET',
  fixtureFile: 'hubspot/contact-deleted.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'hubspot_trigger_contact_deleted',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'hubspot'],
}

const hubspotCompanyCreated: WebhookTestCase = {
  id: 'hubspot-company-created-001',
  provider: 'hubspot',
  triggerType: 'hubspot_trigger_company_created',
  description: 'HubSpot company.creation → company created trigger',
  endpoint: '/api/webhooks/hubspot',
  signatureScheme: 'none',
  secretEnvVar: 'HUBSPOT_CLIENT_SECRET',
  fixtureFile: 'hubspot/company-created.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'hubspot_trigger_company_created',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'hubspot'],
}

const hubspotCompanyUpdated: WebhookTestCase = {
  id: 'hubspot-company-updated-001',
  provider: 'hubspot',
  triggerType: 'hubspot_trigger_company_updated',
  description: 'HubSpot company.propertyChange → company updated trigger',
  endpoint: '/api/webhooks/hubspot',
  signatureScheme: 'none',
  secretEnvVar: 'HUBSPOT_CLIENT_SECRET',
  fixtureFile: 'hubspot/company-updated.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'hubspot_trigger_company_updated',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'hubspot'],
}

const hubspotCompanyDeleted: WebhookTestCase = {
  id: 'hubspot-company-deleted-001',
  provider: 'hubspot',
  triggerType: 'hubspot_trigger_company_deleted',
  description: 'HubSpot company.deletion → company deleted trigger',
  endpoint: '/api/webhooks/hubspot',
  signatureScheme: 'none',
  secretEnvVar: 'HUBSPOT_CLIENT_SECRET',
  fixtureFile: 'hubspot/company-deleted.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'hubspot_trigger_company_deleted',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'hubspot'],
}

const hubspotDealCreated: WebhookTestCase = {
  id: 'hubspot-deal-created-001',
  provider: 'hubspot',
  triggerType: 'hubspot_trigger_deal_created',
  description: 'HubSpot deal.creation → deal created trigger',
  endpoint: '/api/webhooks/hubspot',
  signatureScheme: 'none',
  secretEnvVar: 'HUBSPOT_CLIENT_SECRET',
  fixtureFile: 'hubspot/deal-created.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'hubspot_trigger_deal_created',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'hubspot'],
}

const hubspotDealUpdated: WebhookTestCase = {
  id: 'hubspot-deal-updated-001',
  provider: 'hubspot',
  triggerType: 'hubspot_trigger_deal_updated',
  description: 'HubSpot deal.propertyChange → deal updated trigger',
  endpoint: '/api/webhooks/hubspot',
  signatureScheme: 'none',
  secretEnvVar: 'HUBSPOT_CLIENT_SECRET',
  fixtureFile: 'hubspot/deal-updated.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'hubspot_trigger_deal_updated',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'hubspot'],
}

const hubspotDealDeleted: WebhookTestCase = {
  id: 'hubspot-deal-deleted-001',
  provider: 'hubspot',
  triggerType: 'hubspot_trigger_deal_deleted',
  description: 'HubSpot deal.deletion → deal deleted trigger',
  endpoint: '/api/webhooks/hubspot',
  signatureScheme: 'none',
  secretEnvVar: 'HUBSPOT_CLIENT_SECRET',
  fixtureFile: 'hubspot/deal-deleted.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'hubspot_trigger_deal_deleted',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'hubspot'],
}

const hubspotTicketCreated: WebhookTestCase = {
  id: 'hubspot-ticket-created-001',
  provider: 'hubspot',
  triggerType: 'hubspot_trigger_ticket_created',
  description: 'HubSpot ticket.creation → ticket created trigger',
  endpoint: '/api/webhooks/hubspot',
  signatureScheme: 'none',
  secretEnvVar: 'HUBSPOT_CLIENT_SECRET',
  fixtureFile: 'hubspot/ticket-created.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'hubspot_trigger_ticket_created',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'hubspot'],
}

const hubspotTicketUpdated: WebhookTestCase = {
  id: 'hubspot-ticket-updated-001',
  provider: 'hubspot',
  triggerType: 'hubspot_trigger_ticket_updated',
  description: 'HubSpot ticket.propertyChange → ticket updated trigger',
  endpoint: '/api/webhooks/hubspot',
  signatureScheme: 'none',
  secretEnvVar: 'HUBSPOT_CLIENT_SECRET',
  fixtureFile: 'hubspot/ticket-updated.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'hubspot_trigger_ticket_updated',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'hubspot'],
}

const hubspotTicketDeleted: WebhookTestCase = {
  id: 'hubspot-ticket-deleted-001',
  provider: 'hubspot',
  triggerType: 'hubspot_trigger_ticket_deleted',
  description: 'HubSpot ticket.deletion → ticket deleted trigger',
  endpoint: '/api/webhooks/hubspot',
  signatureScheme: 'none',
  secretEnvVar: 'HUBSPOT_CLIENT_SECRET',
  fixtureFile: 'hubspot/ticket-deleted.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'hubspot_trigger_ticket_deleted',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'hubspot'],
}

const hubspotNoteCreated: WebhookTestCase = {
  id: 'hubspot-note-created-001',
  provider: 'hubspot',
  triggerType: 'hubspot_trigger_note_created',
  description: 'HubSpot note.creation → note created trigger',
  endpoint: '/api/webhooks/hubspot',
  signatureScheme: 'none',
  secretEnvVar: 'HUBSPOT_CLIENT_SECRET',
  fixtureFile: 'hubspot/note-created.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'hubspot_trigger_note_created',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'hubspot'],
}

const hubspotTaskCreated: WebhookTestCase = {
  id: 'hubspot-task-created-001',
  provider: 'hubspot',
  triggerType: 'hubspot_trigger_task_created',
  description: 'HubSpot task.creation → task created trigger',
  endpoint: '/api/webhooks/hubspot',
  signatureScheme: 'none',
  secretEnvVar: 'HUBSPOT_CLIENT_SECRET',
  fixtureFile: 'hubspot/task-created.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'hubspot_trigger_task_created',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'hubspot'],
}

const hubspotCallCreated: WebhookTestCase = {
  id: 'hubspot-call-created-001',
  provider: 'hubspot',
  triggerType: 'hubspot_trigger_call_created',
  description: 'HubSpot call.creation → call created trigger',
  endpoint: '/api/webhooks/hubspot',
  signatureScheme: 'none',
  secretEnvVar: 'HUBSPOT_CLIENT_SECRET',
  fixtureFile: 'hubspot/call-created.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'hubspot_trigger_call_created',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'hubspot'],
}

const hubspotMeetingCreated: WebhookTestCase = {
  id: 'hubspot-meeting-created-001',
  provider: 'hubspot',
  triggerType: 'hubspot_trigger_meeting_created',
  description: 'HubSpot meeting.creation → meeting created trigger',
  endpoint: '/api/webhooks/hubspot',
  signatureScheme: 'none',
  secretEnvVar: 'HUBSPOT_CLIENT_SECRET',
  fixtureFile: 'hubspot/meeting-created.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'hubspot_trigger_meeting_created',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'hubspot'],
}

const hubspotFormSubmission: WebhookTestCase = {
  id: 'hubspot-form-submission-001',
  provider: 'hubspot',
  triggerType: 'hubspot_trigger_form_submission',
  description: 'HubSpot form.submission → form submission trigger',
  endpoint: '/api/webhooks/hubspot',
  signatureScheme: 'none',
  secretEnvVar: 'HUBSPOT_CLIENT_SECRET',
  fixtureFile: 'hubspot/form-submission.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'hubspot_trigger_form_submission',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'hubspot'],
}

// ---------------------------------------------------------------------------
// Additional positive-match test cases — Facebook
// ---------------------------------------------------------------------------

const facebookComment: WebhookTestCase = {
  id: 'facebook-comment-001',
  provider: 'facebook',
  triggerType: 'facebook_trigger_new_comment',
  description: 'Facebook page comment → new comment trigger',
  endpoint: '/api/webhooks/facebook',
  signatureScheme: 'none',
  secretEnvVar: 'FACEBOOK_APP_SECRET',
  fixtureFile: 'facebook/page-comment.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'facebook_trigger_new_comment',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'facebook'],
}

// ---------------------------------------------------------------------------
// Additional positive-match test cases — Gumroad
// ---------------------------------------------------------------------------

const gumroadRefund: WebhookTestCase = {
  id: 'gumroad-refund-001',
  provider: 'gumroad',
  triggerType: 'gumroad_trigger_sale_refunded',
  description: 'Gumroad refund ping → sale refunded trigger',
  endpoint: '/api/webhooks/gumroad',
  signatureScheme: 'none',
  secretEnvVar: 'GUMROAD_WEBHOOK_SECRET',
  fixtureFile: 'gumroad/refund.json',
  contentType: 'application/x-www-form-urlencoded',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'gumroad_trigger_sale_refunded',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'gumroad', 'form-encoded'],
}

const gumroadDispute: WebhookTestCase = {
  id: 'gumroad-dispute-001',
  provider: 'gumroad',
  triggerType: 'gumroad_trigger_dispute',
  description: 'Gumroad dispute ping → dispute trigger',
  endpoint: '/api/webhooks/gumroad',
  signatureScheme: 'none',
  secretEnvVar: 'GUMROAD_WEBHOOK_SECRET',
  fixtureFile: 'gumroad/dispute.json',
  contentType: 'application/x-www-form-urlencoded',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'gumroad_trigger_dispute',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'gumroad', 'form-encoded'],
}

const gumroadDisputeWon: WebhookTestCase = {
  id: 'gumroad-dispute-won-001',
  provider: 'gumroad',
  triggerType: 'gumroad_trigger_dispute_won',
  description: 'Gumroad dispute won ping → dispute won trigger',
  endpoint: '/api/webhooks/gumroad',
  signatureScheme: 'none',
  secretEnvVar: 'GUMROAD_WEBHOOK_SECRET',
  fixtureFile: 'gumroad/dispute-won.json',
  contentType: 'application/x-www-form-urlencoded',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'gumroad_trigger_dispute_won',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'gumroad', 'form-encoded'],
}

const gumroadCancellation: WebhookTestCase = {
  id: 'gumroad-cancellation-001',
  provider: 'gumroad',
  triggerType: 'gumroad_trigger_subscription_cancelled',
  description: 'Gumroad cancellation ping → subscription cancelled trigger',
  endpoint: '/api/webhooks/gumroad',
  signatureScheme: 'none',
  secretEnvVar: 'GUMROAD_WEBHOOK_SECRET',
  fixtureFile: 'gumroad/cancellation.json',
  contentType: 'application/x-www-form-urlencoded',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'gumroad_trigger_subscription_cancelled',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'gumroad', 'form-encoded'],
}

const gumroadSubUpdated: WebhookTestCase = {
  id: 'gumroad-sub-updated-001',
  provider: 'gumroad',
  triggerType: 'gumroad_trigger_subscription_updated',
  description: 'Gumroad subscription updated ping → subscription updated trigger',
  endpoint: '/api/webhooks/gumroad',
  signatureScheme: 'none',
  secretEnvVar: 'GUMROAD_WEBHOOK_SECRET',
  fixtureFile: 'gumroad/subscription-updated.json',
  contentType: 'application/x-www-form-urlencoded',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'gumroad_trigger_subscription_updated',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'gumroad', 'form-encoded'],
}

const gumroadSubEnded: WebhookTestCase = {
  id: 'gumroad-sub-ended-001',
  provider: 'gumroad',
  triggerType: 'gumroad_trigger_subscription_ended',
  description: 'Gumroad subscription ended ping → subscription ended trigger',
  endpoint: '/api/webhooks/gumroad',
  signatureScheme: 'none',
  secretEnvVar: 'GUMROAD_WEBHOOK_SECRET',
  fixtureFile: 'gumroad/subscription-ended.json',
  contentType: 'application/x-www-form-urlencoded',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'gumroad_trigger_subscription_ended',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'gumroad', 'form-encoded'],
}

const gumroadSubRestarted: WebhookTestCase = {
  id: 'gumroad-sub-restarted-001',
  provider: 'gumroad',
  triggerType: 'gumroad_trigger_subscription_restarted',
  description: 'Gumroad subscription restarted ping → subscription restarted trigger',
  endpoint: '/api/webhooks/gumroad',
  signatureScheme: 'none',
  secretEnvVar: 'GUMROAD_WEBHOOK_SECRET',
  fixtureFile: 'gumroad/subscription-restarted.json',
  contentType: 'application/x-www-form-urlencoded',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'gumroad_trigger_subscription_restarted',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'gumroad', 'form-encoded'],
}

// ---------------------------------------------------------------------------
// Additional positive-match test cases — Stripe
// ---------------------------------------------------------------------------

const stripePaymentFailed: WebhookTestCase = {
  id: 'stripe-payment-failed-001',
  provider: 'stripe',
  triggerType: 'stripe_trigger_payment_failed',
  description: 'Stripe payment_intent.payment_failed → payment failed trigger',
  endpoint: '/api/webhooks/stripe-integration',
  signatureScheme: 'stripe',
  secretEnvVar: 'STRIPE_WEBHOOK_SECRET',
  fixtureFile: 'stripe/payment-failed.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'stripe_trigger_payment_failed',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  endpointParams: { workflowId: 'workflowId' },
  tags: ['positive', 'stripe'],
}

const stripeChargeSucceeded: WebhookTestCase = {
  id: 'stripe-charge-succeeded-001',
  provider: 'stripe',
  triggerType: 'stripe_trigger_charge_succeeded',
  description: 'Stripe charge.succeeded → charge succeeded trigger',
  endpoint: '/api/webhooks/stripe-integration',
  signatureScheme: 'stripe',
  secretEnvVar: 'STRIPE_WEBHOOK_SECRET',
  fixtureFile: 'stripe/charge-succeeded.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'stripe_trigger_charge_succeeded',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  endpointParams: { workflowId: 'workflowId' },
  tags: ['positive', 'stripe'],
}

const stripeChargeFailed: WebhookTestCase = {
  id: 'stripe-charge-failed-001',
  provider: 'stripe',
  triggerType: 'stripe_trigger_charge_failed',
  description: 'Stripe charge.failed → charge failed trigger',
  endpoint: '/api/webhooks/stripe-integration',
  signatureScheme: 'stripe',
  secretEnvVar: 'STRIPE_WEBHOOK_SECRET',
  fixtureFile: 'stripe/charge-failed.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'stripe_trigger_charge_failed',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  endpointParams: { workflowId: 'workflowId' },
  tags: ['positive', 'stripe'],
}

const stripeRefundedCharge: WebhookTestCase = {
  id: 'stripe-refunded-charge-001',
  provider: 'stripe',
  triggerType: 'stripe_trigger_refunded_charge',
  description: 'Stripe charge.refunded → refunded charge trigger',
  endpoint: '/api/webhooks/stripe-integration',
  signatureScheme: 'stripe',
  secretEnvVar: 'STRIPE_WEBHOOK_SECRET',
  fixtureFile: 'stripe/charge-refunded.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'stripe_trigger_refunded_charge',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  endpointParams: { workflowId: 'workflowId' },
  tags: ['positive', 'stripe'],
}

const stripeSubCreated: WebhookTestCase = {
  id: 'stripe-sub-created-001',
  provider: 'stripe',
  triggerType: 'stripe_trigger_subscription_created',
  description: 'Stripe customer.subscription.created → subscription created trigger',
  endpoint: '/api/webhooks/stripe-integration',
  signatureScheme: 'stripe',
  secretEnvVar: 'STRIPE_WEBHOOK_SECRET',
  fixtureFile: 'stripe/subscription-created.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'stripe_trigger_subscription_created',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  endpointParams: { workflowId: 'workflowId' },
  tags: ['positive', 'stripe'],
}

const stripeSubUpdated: WebhookTestCase = {
  id: 'stripe-sub-updated-001',
  provider: 'stripe',
  triggerType: 'stripe_trigger_subscription_updated',
  description: 'Stripe customer.subscription.updated → subscription updated trigger',
  endpoint: '/api/webhooks/stripe-integration',
  signatureScheme: 'stripe',
  secretEnvVar: 'STRIPE_WEBHOOK_SECRET',
  fixtureFile: 'stripe/subscription-updated.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'stripe_trigger_subscription_updated',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  endpointParams: { workflowId: 'workflowId' },
  tags: ['positive', 'stripe'],
}

const stripeSubDeleted: WebhookTestCase = {
  id: 'stripe-sub-deleted-001',
  provider: 'stripe',
  triggerType: 'stripe_trigger_subscription_deleted',
  description: 'Stripe customer.subscription.deleted → subscription deleted trigger',
  endpoint: '/api/webhooks/stripe-integration',
  signatureScheme: 'stripe',
  secretEnvVar: 'STRIPE_WEBHOOK_SECRET',
  fixtureFile: 'stripe/subscription-deleted.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'stripe_trigger_subscription_deleted',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  endpointParams: { workflowId: 'workflowId' },
  tags: ['positive', 'stripe'],
}

const stripeInvoiceCreated: WebhookTestCase = {
  id: 'stripe-invoice-created-001',
  provider: 'stripe',
  triggerType: 'stripe_trigger_invoice_created',
  description: 'Stripe invoice.created → invoice created trigger',
  endpoint: '/api/webhooks/stripe-integration',
  signatureScheme: 'stripe',
  secretEnvVar: 'STRIPE_WEBHOOK_SECRET',
  fixtureFile: 'stripe/invoice-created.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'stripe_trigger_invoice_created',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  endpointParams: { workflowId: 'workflowId' },
  tags: ['positive', 'stripe'],
}

const stripeInvoicePaid: WebhookTestCase = {
  id: 'stripe-invoice-paid-001',
  provider: 'stripe',
  triggerType: 'stripe_trigger_invoice_paid',
  description: 'Stripe invoice.paid → invoice paid trigger',
  endpoint: '/api/webhooks/stripe-integration',
  signatureScheme: 'stripe',
  secretEnvVar: 'STRIPE_WEBHOOK_SECRET',
  fixtureFile: 'stripe/invoice-paid.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'stripe_trigger_invoice_paid',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  endpointParams: { workflowId: 'workflowId' },
  tags: ['positive', 'stripe'],
}

const stripeInvoiceFailed: WebhookTestCase = {
  id: 'stripe-invoice-failed-001',
  provider: 'stripe',
  triggerType: 'stripe_trigger_invoice_payment_failed',
  description: 'Stripe invoice.payment_failed → invoice payment failed trigger',
  endpoint: '/api/webhooks/stripe-integration',
  signatureScheme: 'stripe',
  secretEnvVar: 'STRIPE_WEBHOOK_SECRET',
  fixtureFile: 'stripe/invoice-payment-failed.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'stripe_trigger_invoice_payment_failed',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  endpointParams: { workflowId: 'workflowId' },
  tags: ['positive', 'stripe'],
}

const stripeCustomerUpdated: WebhookTestCase = {
  id: 'stripe-customer-updated-001',
  provider: 'stripe',
  triggerType: 'stripe_trigger_customer_updated',
  description: 'Stripe customer.updated → customer updated trigger',
  endpoint: '/api/webhooks/stripe-integration',
  signatureScheme: 'stripe',
  secretEnvVar: 'STRIPE_WEBHOOK_SECRET',
  fixtureFile: 'stripe/customer-updated.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'stripe_trigger_customer_updated',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  endpointParams: { workflowId: 'workflowId' },
  tags: ['positive', 'stripe'],
}

const stripeDispute: WebhookTestCase = {
  id: 'stripe-dispute-001',
  provider: 'stripe',
  triggerType: 'stripe_trigger_new_dispute',
  description: 'Stripe charge.dispute.created → new dispute trigger',
  endpoint: '/api/webhooks/stripe-integration',
  signatureScheme: 'stripe',
  secretEnvVar: 'STRIPE_WEBHOOK_SECRET',
  fixtureFile: 'stripe/dispute-created.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'stripe_trigger_new_dispute',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  endpointParams: { workflowId: 'workflowId' },
  tags: ['positive', 'stripe'],
}

const stripeCheckout: WebhookTestCase = {
  id: 'stripe-checkout-001',
  provider: 'stripe',
  triggerType: 'stripe_trigger_checkout_session_completed',
  description: 'Stripe checkout.session.completed → checkout session completed trigger',
  endpoint: '/api/webhooks/stripe-integration',
  signatureScheme: 'stripe',
  secretEnvVar: 'STRIPE_WEBHOOK_SECRET',
  fixtureFile: 'stripe/checkout-completed.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'stripe_trigger_checkout_session_completed',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  endpointParams: { workflowId: 'workflowId' },
  tags: ['positive', 'stripe'],
}

// ---------------------------------------------------------------------------
// Additional positive-match test cases — Notion
// ---------------------------------------------------------------------------

const notionItemUpdated: WebhookTestCase = {
  id: 'notion-item-updated-001',
  provider: 'notion',
  triggerType: 'notion_trigger_database_item_updated',
  description: 'Notion page.updated → database item updated trigger',
  endpoint: '/api/webhooks/notion',
  signatureScheme: 'notion',
  secretEnvVar: 'NOTION_WEBHOOK_SECRET',
  fixtureFile: 'notion/page-updated.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'notion_trigger_database_item_updated',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  endpointParams: { workflowId: 'workflowId', nodeId: 'nodeId' },
  tags: ['positive', 'notion'],
}

const notionPageContent: WebhookTestCase = {
  id: 'notion-page-content-001',
  provider: 'notion',
  triggerType: 'notion_trigger_page_content_updated',
  description: 'Notion page content updated → page content updated trigger',
  endpoint: '/api/webhooks/notion',
  signatureScheme: 'notion',
  secretEnvVar: 'NOTION_WEBHOOK_SECRET',
  fixtureFile: 'notion/page-content-updated.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 2, // page.content_updated matches both page_content_updated AND database_item_updated
    triggerType: 'notion_trigger_page_content_updated',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  endpointParams: { workflowId: 'workflowId', nodeId: 'nodeId' },
  tags: ['positive', 'notion'],
}

const notionPageProps: WebhookTestCase = {
  id: 'notion-page-props-001',
  provider: 'notion',
  triggerType: 'notion_trigger_page_properties_updated',
  description: 'Notion page properties updated → page properties updated trigger',
  endpoint: '/api/webhooks/notion',
  signatureScheme: 'notion',
  secretEnvVar: 'NOTION_WEBHOOK_SECRET',
  fixtureFile: 'notion/page-properties-updated.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 2, // page.property_values_updated matches both page_properties_updated AND database_item_updated
    triggerType: 'notion_trigger_page_properties_updated',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  endpointParams: { workflowId: 'workflowId', nodeId: 'nodeId' },
  tags: ['positive', 'notion'],
}

const notionComment: WebhookTestCase = {
  id: 'notion-comment-001',
  provider: 'notion',
  triggerType: 'notion_trigger_new_comment',
  description: 'Notion comment.created → new comment trigger',
  endpoint: '/api/webhooks/notion',
  signatureScheme: 'notion',
  secretEnvVar: 'NOTION_WEBHOOK_SECRET',
  fixtureFile: 'notion/comment-created.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'notion_trigger_new_comment',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  endpointParams: { workflowId: 'workflowId', nodeId: 'nodeId' },
  tags: ['positive', 'notion'],
}

const notionSchema: WebhookTestCase = {
  id: 'notion-schema-001',
  provider: 'notion',
  triggerType: 'notion_trigger_database_schema_updated',
  description: 'Notion database schema updated → database schema updated trigger',
  endpoint: '/api/webhooks/notion',
  signatureScheme: 'notion',
  secretEnvVar: 'NOTION_WEBHOOK_SECRET',
  fixtureFile: 'notion/database-schema-updated.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'notion_trigger_database_schema_updated',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  endpointParams: { workflowId: 'workflowId', nodeId: 'nodeId' },
  tags: ['positive', 'notion'],
}

// ---------------------------------------------------------------------------
// Additional positive-match test cases — Mailchimp
// ---------------------------------------------------------------------------

const mailchimpUnsubscribe: WebhookTestCase = {
  id: 'mailchimp-unsubscribe-001',
  provider: 'mailchimp',
  triggerType: 'mailchimp_trigger_unsubscribed',
  description: 'Mailchimp unsubscribe → unsubscribed trigger',
  endpoint: '/api/webhooks/mailchimp',
  signatureScheme: 'none',
  secretEnvVar: 'MAILCHIMP_WEBHOOK_SECRET',
  fixtureFile: 'mailchimp/unsubscribe.form',
  contentType: 'application/x-www-form-urlencoded',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'mailchimp_trigger_unsubscribed',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'mailchimp', 'form-encoded'],
}

const mailchimpProfileUpdated: WebhookTestCase = {
  id: 'mailchimp-profile-updated-001',
  provider: 'mailchimp',
  triggerType: 'mailchimp_trigger_subscriber_updated',
  description: 'Mailchimp profile update → subscriber updated trigger',
  endpoint: '/api/webhooks/mailchimp',
  signatureScheme: 'none',
  secretEnvVar: 'MAILCHIMP_WEBHOOK_SECRET',
  fixtureFile: 'mailchimp/profile-update.form',
  contentType: 'application/x-www-form-urlencoded',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'mailchimp_trigger_subscriber_updated',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'mailchimp', 'form-encoded'],
}

const mailchimpCampaign: WebhookTestCase = {
  id: 'mailchimp-campaign-001',
  provider: 'mailchimp',
  triggerType: 'mailchimp_trigger_new_campaign',
  description: 'Mailchimp campaign → new campaign trigger',
  endpoint: '/api/webhooks/mailchimp',
  signatureScheme: 'none',
  secretEnvVar: 'MAILCHIMP_WEBHOOK_SECRET',
  fixtureFile: 'mailchimp/campaign.form',
  contentType: 'application/x-www-form-urlencoded',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'mailchimp_trigger_new_campaign',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['positive', 'mailchimp', 'form-encoded'],
}

// ---------------------------------------------------------------------------
// No-match test cases (negative tests — receipt succeeds, no workflow matches)
// ---------------------------------------------------------------------------

const githubPushNoMatch: WebhookTestCase = {
  id: 'github-push-nomatch-001',
  provider: 'github',
  triggerType: 'github_trigger_new_commit',
  description: 'GitHub push event for unregistered repo → no match',
  endpoint: '/api/webhooks/github',
  signatureScheme: 'github',
  secretEnvVar: 'GITHUB_WEBHOOK_SECRET',
  fixtureFile: 'github/push-nomatch.json',
  extraHeaders: {
    'x-github-event': 'push',
    'x-github-delivery': 'test-delivery-nomatch-001',
  },
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 0,
  },
  expectedExecution: {
    shouldExecute: false,
  },
  tags: ['negative', 'no-match', 'github'],
}

const slackMessageNoMatch: WebhookTestCase = {
  id: 'slack-message-nomatch-001',
  provider: 'slack',
  triggerType: 'slack_trigger_message_deleted',
  description: 'Slack message_deleted event (ignored by normalizer) → no match',
  endpoint: '/api/webhooks/slack',
  signatureScheme: 'slack',
  secretEnvVar: 'SLACK_SIGNING_SECRET',
  fixtureFile: 'slack/message-deleted-nomatch.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 0,
  },
  expectedExecution: {
    shouldExecute: false,
  },
  tags: ['negative', 'no-match', 'slack'],
}

const shopifyOrderNoMatch: WebhookTestCase = {
  id: 'shopify-order-nomatch-001',
  provider: 'shopify',
  triggerType: 'shopify_trigger_unknown',
  description: 'Shopify unknown topic → no match',
  endpoint: '/api/webhooks/shopify',
  signatureScheme: 'shopify',
  secretEnvVar: 'SHOPIFY_CLIENT_SECRET',
  fixtureFile: 'shopify/customers-create-nomatch.json',
  extraHeaders: {
    'x-shopify-topic': 'refunds/create',
    'x-shopify-shop-domain': 'nonexistent-shop.myshopify.com',
    'x-shopify-api-version': '2024-01',
  },
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 0,
  },
  expectedExecution: {
    shouldExecute: false,
  },
  tags: ['negative', 'no-match', 'shopify'],
}

const mondayCreateItem: WebhookTestCase = {
  id: 'monday-create-item-001',
  provider: 'monday',
  triggerType: 'monday_trigger_new_item',
  description: 'Monday create_item → new item trigger',
  endpoint: '/api/webhooks/monday',
  signatureScheme: 'monday',
  secretEnvVar: 'MONDAY_SIGNING_SECRET',
  fixtureFile: 'monday/create-item.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'monday_trigger_new_item',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['smoke', 'positive', 'monday', 'custom-route'],
}

const hubspotContactCreated: WebhookTestCase = {
  id: 'hubspot-contact-created-001',
  provider: 'hubspot',
  triggerType: 'hubspot_trigger_contact_created',
  description: 'HubSpot contact.creation → contact created trigger',
  endpoint: '/api/webhooks/hubspot',
  signatureScheme: 'none',
  secretEnvVar: 'HUBSPOT_CLIENT_SECRET',
  fixtureFile: 'hubspot/contact-created.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'hubspot_trigger_contact_created',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['smoke', 'positive', 'hubspot', 'custom-route'],
}

const facebookPagePost: WebhookTestCase = {
  id: 'facebook-page-post-001',
  provider: 'facebook',
  triggerType: 'facebook_trigger_new_post',
  description: 'Facebook page feed post → new post trigger',
  endpoint: '/api/webhooks/facebook',
  signatureScheme: 'none',
  secretEnvVar: 'FACEBOOK_APP_SECRET',
  fixtureFile: 'facebook/page-post.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'facebook_trigger_new_post',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['smoke', 'positive', 'facebook', 'custom-route'],
}

// ---------------------------------------------------------------------------
// No-match test cases (negative tests — receipt succeeds, no workflow matches)
// ---------------------------------------------------------------------------

const discordMemberJoinNoMatch: WebhookTestCase = {
  id: 'discord-member-nomatch-001',
  provider: 'discord',
  triggerType: 'discord_trigger_member_join',
  description: 'Discord GUILD_MEMBER_ADD with no matching workflow → no match',
  endpoint: '/api/webhooks/discord',
  signatureScheme: 'none',
  secretEnvVar: 'DISCORD_BOT_TOKEN',
  fixtureFile: 'discord/member-join-nomatch.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 0,
  },
  expectedExecution: {
    shouldExecute: false,
  },
  tags: ['negative', 'no-match', 'discord', 'generic-pipeline'],
}

const trelloCommentNoMatch: WebhookTestCase = {
  id: 'trello-comment-nomatch-001',
  provider: 'trello',
  triggerType: 'trello_trigger_comment_added',
  description: 'Trello commentCard with no matching workflow → no match',
  endpoint: '/api/webhooks/trello',
  signatureScheme: 'none',
  secretEnvVar: 'TRELLO_WEBHOOK_SECRET',
  fixtureFile: 'trello/comment-nomatch.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 0,
  },
  expectedExecution: {
    shouldExecute: false,
  },
  tags: ['negative', 'no-match', 'trello', 'generic-pipeline'],
}

const mondayColumnChangeNoMatch: WebhookTestCase = {
  id: 'monday-column-nomatch-001',
  provider: 'monday',
  triggerType: 'monday_trigger_unknown',
  description: 'Monday unmapped event type → no match',
  endpoint: '/api/webhooks/monday',
  signatureScheme: 'monday',
  secretEnvVar: 'MONDAY_SIGNING_SECRET',
  fixtureFile: 'monday/delete-item-nomatch.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 0,
  },
  expectedExecution: {
    shouldExecute: false,
  },
  tags: ['negative', 'no-match', 'monday', 'custom-route'],
}

const hubspotDealCreatedNoMatch: WebhookTestCase = {
  id: 'hubspot-deal-nomatch-001',
  provider: 'hubspot',
  triggerType: 'hubspot_trigger_unknown',
  description: 'HubSpot unknown subscription type → no match',
  endpoint: '/api/webhooks/hubspot',
  signatureScheme: 'none',
  secretEnvVar: 'HUBSPOT_CLIENT_SECRET',
  fixtureFile: 'hubspot/line-item-nomatch.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 0,
  },
  expectedExecution: {
    shouldExecute: false,
  },
  tags: ['negative', 'no-match', 'hubspot', 'custom-route'],
}

const gumroadSale: WebhookTestCase = {
  id: 'gumroad-sale-001',
  provider: 'gumroad',
  triggerType: 'gumroad_trigger_new_sale',
  description: 'Gumroad sale ping → new sale trigger',
  endpoint: '/api/webhooks/gumroad',
  signatureScheme: 'none',
  secretEnvVar: 'GUMROAD_WEBHOOK_SECRET',
  fixtureFile: 'gumroad/sale.form',
  contentType: 'application/x-www-form-urlencoded',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'gumroad_trigger_new_sale',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['smoke', 'positive', 'gumroad', 'custom-route', 'form-encoded'],
}

const gmailNewEmail: WebhookTestCase = {
  id: 'gmail-new-email-001',
  provider: 'gmail',
  triggerType: 'gmail_trigger_new_email',
  description: 'Gmail Pub/Sub notification → new email trigger',
  endpoint: '/api/webhooks/gmail',
  signatureScheme: 'none',
  secretEnvVar: 'GMAIL_WEBHOOK_SECRET',
  fixtureFile: 'gmail/new-email.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'gmail_trigger_new_email',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['smoke', 'positive', 'gmail', 'custom-route'],
}

const gmailNewEmailNoMatch: WebhookTestCase = {
  id: 'gmail-email-nomatch-001',
  provider: 'gmail',
  triggerType: 'gmail_trigger_new_email',
  description: 'Gmail Pub/Sub notification with no matching workflow → no match',
  endpoint: '/api/webhooks/gmail',
  signatureScheme: 'none',
  secretEnvVar: 'GMAIL_WEBHOOK_SECRET',
  fixtureFile: 'gmail/new-email-nomatch.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 0,
  },
  expectedExecution: {
    shouldExecute: false,
  },
  tags: ['negative', 'no-match', 'gmail', 'custom-route'],
}

const googleDriveChange: WebhookTestCase = {
  id: 'google-drive-change-001',
  provider: 'google',
  triggerType: 'google_drive_trigger_file_created',
  description: 'Google Drive push notification → receipt verified, no live subscription',
  endpoint: '/api/webhooks/google',
  signatureScheme: 'none',
  secretEnvVar: 'GOOGLE_WEBHOOK_SECRET',
  fixtureFile: 'google/drive-change.json',
  extraHeaders: {
    'x-goog-channel-id': 'channel-test-001',
    'x-goog-resource-id': 'resource-test-001',
    'x-goog-resource-state': 'update',
    'x-goog-resource-uri': 'https://www.googleapis.com/drive/v3/changes',
    'x-goog-message-number': '1',
  },
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 0,
  },
  expectedExecution: {
    shouldExecute: false,
  },
  tags: ['smoke', 'positive', 'google', 'custom-route', 'receipt-only'],
}

const googleCalendarNoMatch: WebhookTestCase = {
  id: 'google-calendar-nomatch-001',
  provider: 'google',
  triggerType: 'google_calendar_trigger_event_created',
  description: 'Google Calendar push notification → receipt verified, no match',
  endpoint: '/api/webhooks/google',
  signatureScheme: 'none',
  secretEnvVar: 'GOOGLE_WEBHOOK_SECRET',
  fixtureFile: 'google/calendar-change-nomatch.json',
  extraHeaders: {
    'x-goog-channel-id': 'channel-nomatch-999',
    'x-goog-resource-id': 'resource-nomatch-999',
    'x-goog-resource-state': 'update',
    'x-goog-resource-uri': 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    'x-goog-message-number': '1',
  },
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 0,
  },
  expectedExecution: {
    shouldExecute: false,
  },
  tags: ['negative', 'no-match', 'google', 'custom-route', 'receipt-only'],
}

const teamsChannelMessage: WebhookTestCase = {
  id: 'teams-channel-message-001',
  provider: 'teams',
  triggerType: 'teams_trigger_new_message',
  description: 'Teams channel message → new message trigger',
  endpoint: '/api/webhooks/teams',
  signatureScheme: 'none',
  secretEnvVar: 'TEAMS_WEBHOOK_SECRET',
  fixtureFile: 'teams/channel-message.json',
  expectedHttpStatus: 202,
  expectedMatch: {
    count: 1,
    triggerType: 'teams_trigger_new_message',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['smoke', 'positive', 'teams', 'custom-route'],
}

const teamsChatNoMatch: WebhookTestCase = {
  id: 'teams-chat-nomatch-001',
  provider: 'teams',
  triggerType: 'teams_trigger_new_chat_message',
  description: 'Teams chat message with no matching subscription → no match',
  endpoint: '/api/webhooks/teams',
  signatureScheme: 'none',
  secretEnvVar: 'TEAMS_WEBHOOK_SECRET',
  fixtureFile: 'teams/chat-message-nomatch.json',
  expectedHttpStatus: 202,
  expectedMatch: {
    count: 0,
  },
  expectedExecution: {
    shouldExecute: false,
  },
  tags: ['negative', 'no-match', 'teams', 'custom-route'],
}

const mailchimpSubscribe: WebhookTestCase = {
  id: 'mailchimp-subscribe-001',
  provider: 'mailchimp',
  triggerType: 'mailchimp_trigger_new_subscriber',
  description: 'Mailchimp subscribe → new subscriber trigger',
  endpoint: '/api/webhooks/mailchimp',
  signatureScheme: 'none',
  secretEnvVar: 'MAILCHIMP_WEBHOOK_SECRET',
  fixtureFile: 'mailchimp/subscribe.form',
  contentType: 'application/x-www-form-urlencoded',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'mailchimp_trigger_new_subscriber',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  tags: ['smoke', 'positive', 'mailchimp', 'custom-route', 'form-encoded'],
}

const mailchimpCampaignNoMatch: WebhookTestCase = {
  id: 'mailchimp-campaign-nomatch-001',
  provider: 'mailchimp',
  triggerType: 'mailchimp_trigger_unknown',
  description: 'Mailchimp unknown event type → no match',
  endpoint: '/api/webhooks/mailchimp',
  signatureScheme: 'none',
  secretEnvVar: 'MAILCHIMP_WEBHOOK_SECRET',
  fixtureFile: 'mailchimp/cleaned-nomatch.form',
  contentType: 'application/x-www-form-urlencoded',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 0,
  },
  expectedExecution: {
    shouldExecute: false,
  },
  tags: ['negative', 'no-match', 'mailchimp', 'custom-route', 'form-encoded'],
}

const notionPageCreated: WebhookTestCase = {
  id: 'notion-page-created-001',
  provider: 'notion',
  triggerType: 'notion_trigger_database_item_created',
  description: 'Notion page.created → database item created trigger',
  endpoint: '/api/webhooks/notion',
  signatureScheme: 'notion',
  secretEnvVar: 'NOTION_WEBHOOK_SECRET',
  fixtureFile: 'notion/page-created.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'notion_trigger_database_item_created',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  endpointParams: { workflowId: 'workflowId', nodeId: 'nodeId' },
  tags: ['smoke', 'positive', 'notion', 'custom-route'],
}

const notionCommentNoMatch: WebhookTestCase = {
  id: 'notion-comment-nomatch-001',
  provider: 'notion',
  triggerType: 'notion_trigger_unknown',
  description: 'Notion unknown event type → no match',
  endpoint: '/api/webhooks/notion',
  signatureScheme: 'none',
  secretEnvVar: 'NOTION_WEBHOOK_SECRET',
  fixtureFile: 'notion/unknown-event-nomatch.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 0,
  },
  expectedExecution: {
    shouldExecute: false,
  },
  tags: ['negative', 'no-match', 'notion', 'custom-route'],
}

const stripePayment: WebhookTestCase = {
  id: 'stripe-payment-001',
  provider: 'stripe',
  triggerType: 'stripe_trigger_new_payment',
  description: 'Stripe payment_intent.succeeded → new payment trigger',
  endpoint: '/api/webhooks/stripe-integration',
  signatureScheme: 'stripe',
  secretEnvVar: 'STRIPE_WEBHOOK_SECRET',
  fixtureFile: 'stripe/payment-intent-succeeded.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 1,
    triggerType: 'stripe_trigger_new_payment',
  },
  expectedExecution: {
    shouldExecute: true,
    status: 'completed',
  },
  endpointParams: { workflowId: 'workflowId' },
  tags: ['smoke', 'positive', 'stripe', 'custom-route'],
}

const stripeCustomerNoMatch: WebhookTestCase = {
  id: 'stripe-customer-nomatch-001',
  provider: 'stripe',
  triggerType: 'stripe_trigger_customer_created',
  description: 'Stripe customer.created with no matching workflow → no match',
  endpoint: '/api/webhooks/stripe-integration',
  signatureScheme: 'stripe',
  secretEnvVar: 'STRIPE_WEBHOOK_SECRET',
  fixtureFile: 'stripe/customer-created-nomatch.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 0,
  },
  expectedExecution: {
    shouldExecute: false,
  },
  tags: ['negative', 'no-match', 'stripe', 'custom-route'],
}

const gumroadRefundNoMatch: WebhookTestCase = {
  id: 'gumroad-refund-nomatch-001',
  provider: 'gumroad',
  triggerType: 'gumroad_trigger_unknown',
  description: 'Gumroad unrecognized payload → no match',
  endpoint: '/api/webhooks/gumroad',
  signatureScheme: 'none',
  secretEnvVar: 'GUMROAD_WEBHOOK_SECRET',
  fixtureFile: 'gumroad/unknown-nomatch.form',
  contentType: 'application/x-www-form-urlencoded',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 0,
  },
  expectedExecution: {
    shouldExecute: false,
  },
  tags: ['negative', 'no-match', 'gumroad', 'custom-route', 'form-encoded'],
}

const facebookCommentNoMatch: WebhookTestCase = {
  id: 'facebook-comment-nomatch-001',
  provider: 'facebook',
  triggerType: 'facebook_trigger_unknown',
  description: 'Facebook non-page event → no match',
  endpoint: '/api/webhooks/facebook',
  signatureScheme: 'none',
  secretEnvVar: 'FACEBOOK_APP_SECRET',
  fixtureFile: 'facebook/user-event-nomatch.json',
  expectedHttpStatus: 200,
  expectedMatch: {
    count: 0,
  },
  expectedExecution: {
    shouldExecute: false,
  },
  tags: ['negative', 'no-match', 'facebook', 'custom-route'],
}

// ---------------------------------------------------------------------------
// Export all test cases
// ---------------------------------------------------------------------------

export const TEST_MATRIX: WebhookTestCase[] = [
  // Positive-match smoke tests
  githubPush,
  slackMessage,
  shopifyOrderCreate,
  discordMessage,
  trelloCardCreate,
  mondayCreateItem,
  hubspotContactCreated,
  facebookPagePost,
  gumroadSale,
  stripePayment,
  notionPageCreated,
  mailchimpSubscribe,
  teamsChannelMessage,
  gmailNewEmail,
  googleDriveChange,

  // Additional positive-match — Shopify
  shopifyPaidOrder,
  shopifyOrderFulfilled,
  shopifyOrderUpdated,
  shopifyAbandonedCart,
  shopifyNewCustomer,
  shopifyProductUpdated,
  shopifyInventoryLow,

  // Additional positive-match — Slack
  slackMessageIm,
  slackMessageMpim,
  slackReactionAdded,
  slackReactionRemoved,
  slackChannelCreated,
  slackMemberJoined,
  slackMemberLeft,
  slackFileShared,
  slackTeamJoin,

  // Additional positive-match — Discord
  discordMemberJoin,
  discordSlashCommand,

  // Additional positive-match — Trello
  trelloCardUpdated,
  trelloCardMoved,
  trelloCommentAdded,
  trelloCardArchived,
  trelloMemberChanged,

  // Additional positive-match — Monday
  mondayColumnChanged,
  mondayItemMoved,
  mondayNewSubitem,
  mondayNewUpdate,

  // Additional positive-match — HubSpot
  hubspotContactUpdated,
  hubspotContactDeleted,
  hubspotCompanyCreated,
  hubspotCompanyUpdated,
  hubspotCompanyDeleted,
  hubspotDealCreated,
  hubspotDealUpdated,
  hubspotDealDeleted,
  hubspotTicketCreated,
  hubspotTicketUpdated,
  hubspotTicketDeleted,
  hubspotNoteCreated,
  hubspotTaskCreated,
  hubspotCallCreated,
  hubspotMeetingCreated,
  hubspotFormSubmission,

  // Additional positive-match — Facebook
  facebookComment,

  // Additional positive-match — Gumroad
  gumroadRefund,
  gumroadDispute,
  gumroadDisputeWon,
  gumroadCancellation,
  gumroadSubUpdated,
  gumroadSubEnded,
  gumroadSubRestarted,

  // Additional positive-match — Stripe
  stripePaymentFailed,
  stripeChargeSucceeded,
  stripeChargeFailed,
  stripeRefundedCharge,
  stripeSubCreated,
  stripeSubUpdated,
  stripeSubDeleted,
  stripeInvoiceCreated,
  stripeInvoicePaid,
  stripeInvoiceFailed,
  stripeCustomerUpdated,
  stripeDispute,
  stripeCheckout,

  // Additional positive-match — Notion
  notionItemUpdated,
  notionPageContent,
  notionPageProps,
  notionComment,
  notionSchema,

  // Additional positive-match — Mailchimp
  mailchimpUnsubscribe,
  mailchimpProfileUpdated,
  mailchimpCampaign,

  // No-match tests
  githubPushNoMatch,
  slackMessageNoMatch,
  shopifyOrderNoMatch,
  discordMemberJoinNoMatch,
  trelloCommentNoMatch,
  mondayColumnChangeNoMatch,
  hubspotDealCreatedNoMatch,
  facebookCommentNoMatch,
  gumroadRefundNoMatch,
  stripeCustomerNoMatch,
  notionCommentNoMatch,
  mailchimpCampaignNoMatch,
  teamsChatNoMatch,
  gmailNewEmailNoMatch,
  googleCalendarNoMatch,
]

/**
 * Filter test cases by provider, tag, or both.
 */
export function filterTestCases(opts: {
  provider?: string
  tag?: string
}): WebhookTestCase[] {
  return TEST_MATRIX.filter((tc) => {
    if (opts.provider && tc.provider !== opts.provider) return false
    if (opts.tag && !tc.tags.includes(opts.tag)) return false
    return true
  })
}
