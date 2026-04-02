/**
 * Database Fixture Manager for Webhook Test Harness
 *
 * Creates temporary workflows + trigger_resources before tests,
 * then cleans them up after. All records are tagged with a unique
 * test run prefix so cleanup is reliable.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const TEST_PREFIX = 'webhook-harness-test'

export interface TestFixture {
  workflowId: string
  triggerResourceId: string
  nodeId: string
  userId: string
}

interface FixtureSpec {
  provider: string
  providerId: string
  triggerType: string
  /** Config fields for trigger_resources.config (e.g. repository, branch) */
  triggerConfig: Record<string, any>
  /** Optional metadata for trigger_resources.metadata (e.g. verificationToken) */
  metadata?: Record<string, any>
  /** Optional external_id for trigger_resources.external_id (e.g. subscriptionId) */
  externalId?: string
}

/**
 * All fixture specs needed for positive-match test cases.
 * These must match the golden payload data so the webhook processor
 * finds the trigger_resource when filtering.
 */
const FIXTURE_SPECS: Record<string, FixtureSpec> = {
  'github-push-001': {
    provider: 'github',
    providerId: 'github',
    triggerType: 'github_trigger_new_commit',
    triggerConfig: {
      repository: 'chainreactapp/test-repo',
      branch: 'main',
    },
  },
  'slack-message-001': {
    provider: 'slack',
    providerId: 'slack',
    triggerType: 'slack_trigger_new_message',
    triggerConfig: {
      teamId: 'T0001',
    },
  },
  'shopify-order-create-001': {
    provider: 'shopify',
    providerId: 'shopify',
    triggerType: 'shopify_trigger_new_order',
    triggerConfig: {},
  },
  'discord-message-001': {
    provider: 'discord',
    providerId: 'discord',
    triggerType: 'discord_trigger_new_message',
    triggerConfig: {
      guildId: 'guild-test-001',
      channelId: 'channel-test-001',
    },
  },
  'trello-card-create-001': {
    provider: 'trello',
    providerId: 'trello',
    triggerType: 'trello_trigger_new_card',
    triggerConfig: {
      boardId: 'board-test-001',
    },
  },
  'monday-create-item-001': {
    provider: 'monday',
    providerId: 'monday',
    triggerType: 'monday_trigger_new_item',
    triggerConfig: {},
  },
  'hubspot-contact-created-001': {
    provider: 'hubspot',
    providerId: 'hubspot',
    triggerType: 'hubspot_trigger_contact_created',
    triggerConfig: {},
  },
  'facebook-page-post-001': {
    provider: 'facebook',
    providerId: 'facebook',
    triggerType: 'facebook_trigger_new_post',
    triggerConfig: {},
  },
  'gumroad-sale-001': {
    provider: 'gumroad',
    providerId: 'gumroad',
    triggerType: 'gumroad_trigger_new_sale',
    triggerConfig: {},
  },
  'gmail-new-email-001': {
    provider: 'gmail',
    providerId: 'gmail',
    triggerType: 'gmail_trigger_new_email',
    triggerConfig: {
      resourceId: '12345',
    },
  },
  'teams-channel-message-001': {
    provider: 'teams',
    providerId: 'teams',
    triggerType: 'teams_trigger_new_message',
    triggerConfig: {},
    externalId: 'teams-sub-test-001',
  },
  'mailchimp-subscribe-001': {
    provider: 'mailchimp',
    providerId: 'mailchimp',
    triggerType: 'mailchimp_trigger_new_subscriber',
    triggerConfig: {},
  },
  'notion-page-created-001': {
    provider: 'notion',
    providerId: 'notion',
    triggerType: 'notion_trigger_database_item_created',
    triggerConfig: {},
    metadata: {
      webhookVerified: true,
    },
  },
  'stripe-payment-001': {
    provider: 'stripe',
    providerId: 'stripe',
    triggerType: 'stripe_trigger_new_payment',
    triggerConfig: {},
  },

  // --- Shopify additional triggers ---
  'shopify-paid-order-001': { provider: 'shopify', providerId: 'shopify', triggerType: 'shopify_trigger_new_paid_order', triggerConfig: {} },
  'shopify-order-fulfilled-001': { provider: 'shopify', providerId: 'shopify', triggerType: 'shopify_trigger_order_fulfilled', triggerConfig: {} },
  'shopify-order-updated-001': { provider: 'shopify', providerId: 'shopify', triggerType: 'shopify_trigger_order_updated', triggerConfig: {} },
  'shopify-abandoned-cart-001': { provider: 'shopify', providerId: 'shopify', triggerType: 'shopify_trigger_abandoned_cart', triggerConfig: {} },
  'shopify-new-customer-001': { provider: 'shopify', providerId: 'shopify', triggerType: 'shopify_trigger_new_customer', triggerConfig: {} },
  'shopify-product-updated-001': { provider: 'shopify', providerId: 'shopify', triggerType: 'shopify_trigger_product_updated', triggerConfig: {} },
  'shopify-inventory-low-001': { provider: 'shopify', providerId: 'shopify', triggerType: 'shopify_trigger_inventory_low', triggerConfig: {} },

  // --- Slack additional triggers ---
  'slack-message-im-001': { provider: 'slack', providerId: 'slack', triggerType: 'slack_trigger_message_im', triggerConfig: { teamId: 'T0001' } },
  'slack-message-mpim-001': { provider: 'slack', providerId: 'slack', triggerType: 'slack_trigger_message_mpim', triggerConfig: { teamId: 'T0001' } },
  'slack-reaction-added-001': { provider: 'slack', providerId: 'slack', triggerType: 'slack_trigger_reaction_added', triggerConfig: { teamId: 'T0001' } },
  'slack-reaction-removed-001': { provider: 'slack', providerId: 'slack', triggerType: 'slack_trigger_reaction_removed', triggerConfig: { teamId: 'T0001' } },
  'slack-channel-created-001': { provider: 'slack', providerId: 'slack', triggerType: 'slack_trigger_channel_created', triggerConfig: { teamId: 'T0001' } },
  'slack-member-joined-001': { provider: 'slack', providerId: 'slack', triggerType: 'slack_trigger_member_joined_channel', triggerConfig: { teamId: 'T0001' } },
  'slack-member-left-001': { provider: 'slack', providerId: 'slack', triggerType: 'slack_trigger_member_left_channel', triggerConfig: { teamId: 'T0001' } },
  'slack-file-shared-001': { provider: 'slack', providerId: 'slack', triggerType: 'slack_trigger_file_uploaded', triggerConfig: { teamId: 'T0001' } },
  'slack-team-join-001': { provider: 'slack', providerId: 'slack', triggerType: 'slack_trigger_user_joined_workspace', triggerConfig: { teamId: 'T0001' } },

  // --- Discord additional triggers ---
  'discord-member-join-001': { provider: 'discord', providerId: 'discord', triggerType: 'discord_trigger_member_join', triggerConfig: { guildId: 'guild-test-001' } },
  'discord-slash-command-001': { provider: 'discord', providerId: 'discord', triggerType: 'discord_trigger_slash_command', triggerConfig: { guildId: 'guild-test-001' } },

  // --- Trello additional triggers ---
  'trello-card-updated-001': { provider: 'trello', providerId: 'trello', triggerType: 'trello_trigger_card_updated', triggerConfig: { boardId: 'board-test-001' } },
  'trello-card-moved-001': { provider: 'trello', providerId: 'trello', triggerType: 'trello_trigger_card_moved', triggerConfig: { boardId: 'board-test-001' } },
  'trello-comment-added-001': { provider: 'trello', providerId: 'trello', triggerType: 'trello_trigger_comment_added', triggerConfig: { boardId: 'board-test-001' } },
  'trello-card-archived-001': { provider: 'trello', providerId: 'trello', triggerType: 'trello_trigger_card_archived', triggerConfig: { boardId: 'board-test-001' } },
  'trello-member-changed-001': { provider: 'trello', providerId: 'trello', triggerType: 'trello_trigger_member_changed', triggerConfig: { boardId: 'board-test-001' } },

  // --- Monday additional triggers ---
  'monday-column-changed-001': { provider: 'monday', providerId: 'monday', triggerType: 'monday_trigger_column_changed', triggerConfig: {} },
  'monday-item-moved-001': { provider: 'monday', providerId: 'monday', triggerType: 'monday_trigger_item_moved', triggerConfig: {} },
  'monday-new-subitem-001': { provider: 'monday', providerId: 'monday', triggerType: 'monday_trigger_new_subitem', triggerConfig: {} },
  'monday-new-update-001': { provider: 'monday', providerId: 'monday', triggerType: 'monday_trigger_new_update', triggerConfig: {} },

  // --- HubSpot additional triggers ---
  'hubspot-contact-updated-001': { provider: 'hubspot', providerId: 'hubspot', triggerType: 'hubspot_trigger_contact_updated', triggerConfig: {} },
  'hubspot-contact-deleted-001': { provider: 'hubspot', providerId: 'hubspot', triggerType: 'hubspot_trigger_contact_deleted', triggerConfig: {} },
  'hubspot-company-created-001': { provider: 'hubspot', providerId: 'hubspot', triggerType: 'hubspot_trigger_company_created', triggerConfig: {} },
  'hubspot-company-updated-001': { provider: 'hubspot', providerId: 'hubspot', triggerType: 'hubspot_trigger_company_updated', triggerConfig: {} },
  'hubspot-company-deleted-001': { provider: 'hubspot', providerId: 'hubspot', triggerType: 'hubspot_trigger_company_deleted', triggerConfig: {} },
  'hubspot-deal-created-001': { provider: 'hubspot', providerId: 'hubspot', triggerType: 'hubspot_trigger_deal_created', triggerConfig: {} },
  'hubspot-deal-updated-001': { provider: 'hubspot', providerId: 'hubspot', triggerType: 'hubspot_trigger_deal_updated', triggerConfig: {} },
  'hubspot-deal-deleted-001': { provider: 'hubspot', providerId: 'hubspot', triggerType: 'hubspot_trigger_deal_deleted', triggerConfig: {} },
  'hubspot-ticket-created-001': { provider: 'hubspot', providerId: 'hubspot', triggerType: 'hubspot_trigger_ticket_created', triggerConfig: {} },
  'hubspot-ticket-updated-001': { provider: 'hubspot', providerId: 'hubspot', triggerType: 'hubspot_trigger_ticket_updated', triggerConfig: {} },
  'hubspot-ticket-deleted-001': { provider: 'hubspot', providerId: 'hubspot', triggerType: 'hubspot_trigger_ticket_deleted', triggerConfig: {} },
  'hubspot-note-created-001': { provider: 'hubspot', providerId: 'hubspot', triggerType: 'hubspot_trigger_note_created', triggerConfig: {} },
  'hubspot-task-created-001': { provider: 'hubspot', providerId: 'hubspot', triggerType: 'hubspot_trigger_task_created', triggerConfig: {} },
  'hubspot-call-created-001': { provider: 'hubspot', providerId: 'hubspot', triggerType: 'hubspot_trigger_call_created', triggerConfig: {} },
  'hubspot-meeting-created-001': { provider: 'hubspot', providerId: 'hubspot', triggerType: 'hubspot_trigger_meeting_created', triggerConfig: {} },
  'hubspot-form-submission-001': { provider: 'hubspot', providerId: 'hubspot', triggerType: 'hubspot_trigger_form_submission', triggerConfig: {} },

  // --- Facebook additional triggers ---
  'facebook-comment-001': { provider: 'facebook', providerId: 'facebook', triggerType: 'facebook_trigger_new_comment', triggerConfig: {} },

  // --- Gumroad additional triggers ---
  'gumroad-refund-001': { provider: 'gumroad', providerId: 'gumroad', triggerType: 'gumroad_trigger_sale_refunded', triggerConfig: {} },
  'gumroad-dispute-001': { provider: 'gumroad', providerId: 'gumroad', triggerType: 'gumroad_trigger_dispute', triggerConfig: {} },
  'gumroad-dispute-won-001': { provider: 'gumroad', providerId: 'gumroad', triggerType: 'gumroad_trigger_dispute_won', triggerConfig: {} },
  'gumroad-cancellation-001': { provider: 'gumroad', providerId: 'gumroad', triggerType: 'gumroad_trigger_subscription_cancelled', triggerConfig: {} },
  'gumroad-sub-updated-001': { provider: 'gumroad', providerId: 'gumroad', triggerType: 'gumroad_trigger_subscription_updated', triggerConfig: {} },
  'gumroad-sub-ended-001': { provider: 'gumroad', providerId: 'gumroad', triggerType: 'gumroad_trigger_subscription_ended', triggerConfig: {} },
  'gumroad-sub-restarted-001': { provider: 'gumroad', providerId: 'gumroad', triggerType: 'gumroad_trigger_subscription_restarted', triggerConfig: {} },

  // --- Stripe additional triggers ---
  'stripe-payment-failed-001': { provider: 'stripe', providerId: 'stripe', triggerType: 'stripe_trigger_payment_failed', triggerConfig: {} },
  'stripe-charge-succeeded-001': { provider: 'stripe', providerId: 'stripe', triggerType: 'stripe_trigger_charge_succeeded', triggerConfig: {} },
  'stripe-charge-failed-001': { provider: 'stripe', providerId: 'stripe', triggerType: 'stripe_trigger_charge_failed', triggerConfig: {} },
  'stripe-refunded-charge-001': { provider: 'stripe', providerId: 'stripe', triggerType: 'stripe_trigger_refunded_charge', triggerConfig: {} },
  'stripe-sub-created-001': { provider: 'stripe', providerId: 'stripe', triggerType: 'stripe_trigger_subscription_created', triggerConfig: {} },
  'stripe-sub-updated-001': { provider: 'stripe', providerId: 'stripe', triggerType: 'stripe_trigger_subscription_updated', triggerConfig: {} },
  'stripe-sub-deleted-001': { provider: 'stripe', providerId: 'stripe', triggerType: 'stripe_trigger_subscription_deleted', triggerConfig: {} },
  'stripe-invoice-created-001': { provider: 'stripe', providerId: 'stripe', triggerType: 'stripe_trigger_invoice_created', triggerConfig: {} },
  'stripe-invoice-paid-001': { provider: 'stripe', providerId: 'stripe', triggerType: 'stripe_trigger_invoice_paid', triggerConfig: {} },
  'stripe-invoice-failed-001': { provider: 'stripe', providerId: 'stripe', triggerType: 'stripe_trigger_invoice_payment_failed', triggerConfig: {} },
  'stripe-customer-updated-001': { provider: 'stripe', providerId: 'stripe', triggerType: 'stripe_trigger_customer_updated', triggerConfig: {} },
  'stripe-dispute-001': { provider: 'stripe', providerId: 'stripe', triggerType: 'stripe_trigger_new_dispute', triggerConfig: {} },
  'stripe-checkout-001': { provider: 'stripe', providerId: 'stripe', triggerType: 'stripe_trigger_checkout_session_completed', triggerConfig: {} },

  // --- Notion additional triggers ---
  'notion-item-updated-001': { provider: 'notion', providerId: 'notion', triggerType: 'notion_trigger_database_item_updated', triggerConfig: {}, metadata: { webhookVerified: true } },
  'notion-page-content-001': { provider: 'notion', providerId: 'notion', triggerType: 'notion_trigger_page_content_updated', triggerConfig: {}, metadata: { webhookVerified: true } },
  'notion-page-props-001': { provider: 'notion', providerId: 'notion', triggerType: 'notion_trigger_page_properties_updated', triggerConfig: {}, metadata: { webhookVerified: true } },
  'notion-comment-001': { provider: 'notion', providerId: 'notion', triggerType: 'notion_trigger_new_comment', triggerConfig: {}, metadata: { webhookVerified: true } },
  'notion-schema-001': { provider: 'notion', providerId: 'notion', triggerType: 'notion_trigger_database_schema_updated', triggerConfig: {}, metadata: { webhookVerified: true } },

  // --- Mailchimp additional triggers ---
  'mailchimp-unsubscribe-001': { provider: 'mailchimp', providerId: 'mailchimp', triggerType: 'mailchimp_trigger_unsubscribed', triggerConfig: {} },
  'mailchimp-profile-updated-001': { provider: 'mailchimp', providerId: 'mailchimp', triggerType: 'mailchimp_trigger_subscriber_updated', triggerConfig: {} },
  'mailchimp-campaign-001': { provider: 'mailchimp', providerId: 'mailchimp', triggerType: 'mailchimp_trigger_new_campaign', triggerConfig: {} },
}

let supabase: SupabaseClient

function getSupabase(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    )
  }
  return supabase
}

interface TestOwner {
  userId: string
  workspaceId: string
  workspaceType: string
  billingType: string
  billingId: string
}

/**
 * Get real user/workspace context from an existing workflow
 * so test fixtures pass all NOT NULL constraints.
 */
async function getTestOwner(): Promise<TestOwner> {
  const db = getSupabase()
  const { data, error } = await db
    .from('workflows')
    .select('user_id, workspace_id, workspace_type, billing_scope_type, billing_scope_id')
    .not('user_id', 'is', null)
    .limit(1)

  if (error || !data?.length) {
    throw new Error('Cannot find a workflow to derive test owner from. Is the database populated?')
  }
  return {
    userId: data[0].user_id,
    workspaceId: data[0].workspace_id,
    workspaceType: data[0].workspace_type,
    billingType: data[0].billing_scope_type,
    billingId: data[0].billing_scope_id,
  }
}

/**
 * Create all test fixtures needed for positive-match test cases.
 * Returns a map of testCaseId → fixture details.
 */
export async function setupTestFixtures(): Promise<Map<string, TestFixture>> {
  const db = getSupabase()
  const owner = await getTestOwner()
  const fixtures = new Map<string, TestFixture>()

  for (const [testCaseId, spec] of Object.entries(FIXTURE_SPECS)) {
    const workflowId = crypto.randomUUID()
    const triggerResourceId = crypto.randomUUID()
    const nodeId = crypto.randomUUID()

    // Create a minimal test workflow with all required fields
    const { error: wfError } = await db.from('workflows').insert({
      id: workflowId,
      name: `${TEST_PREFIX}-${testCaseId}`,
      description: `Temporary test workflow for webhook harness (${testCaseId})`,
      user_id: owner.userId,
      status: 'active',
      workspace_id: owner.workspaceId,
      workspace_type: owner.workspaceType,
      billing_scope_type: owner.billingType,
      billing_scope_id: owner.billingId,
    })

    if (wfError) {
      console.error(`Failed to create test workflow for ${testCaseId}:`, wfError.message)
      continue
    }

    // Resolve env-dependent config at setup time (not module load time)
    const resolvedConfig = { ...spec.triggerConfig }
    if (spec.provider === 'stripe' && !resolvedConfig.webhookSecret) {
      resolvedConfig.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ''
    }
    const resolvedMetadata = { ...(spec.metadata || {}) }
    if (spec.provider === 'notion' && !resolvedMetadata.verificationToken) {
      resolvedMetadata.verificationToken = process.env.NOTION_WEBHOOK_SECRET || ''
    }

    // Create matching trigger_resource
    const { error: trError } = await db.from('trigger_resources').insert({
      id: triggerResourceId,
      workflow_id: workflowId,
      user_id: owner.userId,
      node_id: nodeId,
      provider: spec.provider,
      provider_id: spec.providerId,
      trigger_type: spec.triggerType,
      resource_type: 'webhook',
      resource_id: `${TEST_PREFIX}-${testCaseId}`,
      status: 'active',
      config: resolvedConfig,
      metadata: resolvedMetadata,
      ...(spec.externalId ? { external_id: spec.externalId } : {}),
      is_test: false, // Must be false so webhook processor finds it
    })

    if (trError) {
      console.error(`Failed to create trigger_resource for ${testCaseId}:`, trError.message)
      // Clean up the workflow we just created
      await db.from('workflows').delete().eq('id', workflowId)
      continue
    }

    // Create matching workflow_node (trigger node)
    // The generic pipeline (Slack, Discord, etc.) matches via workflow_nodes, not trigger_resources.
    // The execution engine also requires a trigger node to exist.
    const { error: nodeError } = await db.from('workflow_nodes').insert({
      id: nodeId,
      workflow_id: workflowId,
      user_id: owner.userId,
      node_type: spec.triggerType,
      label: `${spec.provider} trigger`,
      is_trigger: true,
      provider_id: spec.providerId,
      config: {
        triggerConfig: {
          eventType: spec.triggerType,
          ...spec.triggerConfig,
        },
      },
      position_x: 400,
      position_y: 100,
      display_order: 0,
    })

    if (nodeError) {
      console.error(`Failed to create workflow_node for ${testCaseId}:`, nodeError.message)
      // Clean up — workflow_nodes cascades from workflow, but trigger_resource doesn't
      await db.from('trigger_resources').delete().eq('id', triggerResourceId)
      await db.from('workflows').delete().eq('id', workflowId)
      continue
    }

    fixtures.set(testCaseId, {
      workflowId,
      triggerResourceId,
      nodeId,
      userId: owner.userId,
    })

    console.log(`  [setup] Created fixture for ${testCaseId}: workflow=${workflowId.substring(0, 8)}...`)
  }

  return fixtures
}

/**
 * Remove all test fixtures and any execution data they produced.
 */
export async function teardownTestFixtures(fixtures: Map<string, TestFixture>): Promise<void> {
  const db = getSupabase()

  for (const [testCaseId, fixture] of fixtures) {
    // Delete execution sessions created by this workflow
    await db
      .from('workflow_execution_sessions')
      .delete()
      .eq('workflow_id', fixture.workflowId)

    // Delete trigger resource
    await db
      .from('trigger_resources')
      .delete()
      .eq('id', fixture.triggerResourceId)

    // Delete workflow
    await db
      .from('workflows')
      .delete()
      .eq('id', fixture.workflowId)

    console.log(`  [teardown] Cleaned up fixture for ${testCaseId}`)
  }
}

/**
 * Safety net: clean up any orphaned test fixtures from previous runs
 * that weren't properly torn down.
 */
export async function cleanupOrphans(): Promise<number> {
  const db = getSupabase()

  // Clean up webhook_events from previous test runs.
  // New code stores request_id = testRunId (starts with 'test_').
  // Old code stored request_id = dedupeKey but _meta.originalRequestId = testRunId.
  // Clean up both patterns to prevent dedup false positives across runs.
  await db
    .from('webhook_events')
    .delete()
    .like('request_id', 'test_%')

  // Also clean up events stored by old code where request_id was the dedupeKey
  // but event_data contains test metadata
  try {
    await db
      .from('webhook_events')
      .delete()
      .like('event_data->_meta->>originalRequestId' as any, 'test_%')
  } catch {
    // Ignore if JSONB query fails — not critical
  }

  // Find workflows created by the harness
  const { data: orphans } = await db
    .from('workflows')
    .select('id')
    .like('name', `${TEST_PREFIX}%`)

  if (!orphans?.length) return 0

  const orphanIds = orphans.map((w) => w.id)

  // Delete associated execution sessions
  await db
    .from('workflow_execution_sessions')
    .delete()
    .in('workflow_id', orphanIds)

  // Delete associated trigger resources
  await db
    .from('trigger_resources')
    .delete()
    .in('workflow_id', orphanIds)

  // Delete orphaned workflows
  await db
    .from('workflows')
    .delete()
    .in('id', orphanIds)

  return orphans.length
}
