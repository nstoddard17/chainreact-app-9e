/**
 * Webhook Trigger Filter Tests
 *
 * Tests the applyTriggerFilters() function which applies provider-specific
 * filtering logic to determine if a webhook event should trigger a workflow.
 *
 * Run: npx jest __tests__/webhooks/trigger-filters.test.ts --verbose
 */

import { makeTriggerNode, makeWebhookEvent } from './helpers'

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockSingle = jest.fn()
const mockEq = jest.fn().mockReturnThis()
const mockSelect = jest.fn(() => ({ eq: mockEq }))
const mockFrom = jest.fn(() => ({ select: mockSelect }))

jest.mock('@/utils/supabase/server', () => ({
  createSupabaseServiceClient: jest.fn().mockResolvedValue({
    from: (...args: any[]) => mockFrom(...args),
  }),
}))

jest.mock('@/lib/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}))

jest.mock('@/lib/webhooks/event-logger', () => ({
  logWebhookEvent: jest.fn(),
}))

jest.mock('@/lib/execution/advancedExecutionEngine', () => ({
  AdvancedExecutionEngine: jest.fn(),
}))

import { applyTriggerFilters } from '@/lib/webhooks/processor'

beforeEach(() => {
  jest.clearAllMocks()
  // Default: Supabase single() returns null (integration not found)
  mockEq.mockReturnThis()
  mockEq.mockImplementation(function(this: any) { return this })
  // Override the last .eq() in the chain to have a .single() method
  const chainEnd = {
    eq: jest.fn().mockReturnThis(),
    single: mockSingle,
  }
  // The query chain: from('integrations').select(...).eq('id',...).eq('provider','slack').single()
  mockFrom.mockImplementation(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: mockSingle,
        })),
      })),
    })),
  }))
  mockSingle.mockResolvedValue({ data: null, error: null })
})

// ─── Slack Workspace Filtering ──────────────────────────────────────────────

describe('Slack workspace filtering', () => {
  test('workspace matches: event team matches integration team_id -> passes', async () => {
    mockSingle.mockResolvedValue({
      data: { team_id: 'T123', metadata: null },
      error: null,
    })

    const node = makeTriggerNode('slack', 'slack_trigger_new_message', {
      workspace: 'integration-1',
    })
    const event = makeWebhookEvent({
      provider: 'slack',
      eventData: { team: 'T123' },
    })

    const result = await applyTriggerFilters(node, event)
    expect(result).toBe(true)
  })

  test('workspace mismatch: event team differs from integration team_id -> filtered out', async () => {
    mockSingle.mockResolvedValue({
      data: { team_id: 'T123', metadata: null },
      error: null,
    })

    const node = makeTriggerNode('slack', 'slack_trigger_new_message', {
      workspace: 'integration-1',
    })
    const event = makeWebhookEvent({
      provider: 'slack',
      eventData: { team: 'T999' },
    })

    const result = await applyTriggerFilters(node, event)
    expect(result).toBe(false)
  })

  test('no workspace config -> passes (no filtering)', async () => {
    const node = makeTriggerNode('slack', 'slack_trigger_new_message', {})
    const event = makeWebhookEvent({
      provider: 'slack',
      eventData: { team: 'T123' },
    })

    const result = await applyTriggerFilters(node, event)
    expect(result).toBe(true)
  })

  test('no event team_id -> passes', async () => {
    const node = makeTriggerNode('slack', 'slack_trigger_new_message', {
      workspace: 'integration-1',
    })
    const event = makeWebhookEvent({
      provider: 'slack',
      eventData: { text: 'hello' },
    })

    const result = await applyTriggerFilters(node, event)
    expect(result).toBe(true)
  })

  test('integration not found -> passes (graceful fallback)', async () => {
    mockSingle.mockResolvedValue({ data: null, error: null })

    const node = makeTriggerNode('slack', 'slack_trigger_new_message', {
      workspace: 'integration-1',
    })
    const event = makeWebhookEvent({
      provider: 'slack',
      eventData: { team: 'T123' },
    })

    const result = await applyTriggerFilters(node, event)
    expect(result).toBe(true)
  })

  test('team_id from metadata fallback', async () => {
    mockSingle.mockResolvedValue({
      data: { team_id: null, metadata: { team_id: 'T_META' } },
      error: null,
    })

    const node = makeTriggerNode('slack', 'slack_trigger_new_message', {
      workspace: 'integration-1',
    })
    const event = makeWebhookEvent({
      provider: 'slack',
      eventData: { team: 'T_META' },
    })

    const result = await applyTriggerFilters(node, event)
    expect(result).toBe(true)
  })
})

// ─── Gmail Filtering ────────────────────────────────────────────────────────

describe('Gmail filtering', () => {
  test('sender_filter match -> passes', async () => {
    const node = makeTriggerNode('gmail', 'gmail_trigger_new_email', {
      sender_filter: 'bob@',
    })
    const event = makeWebhookEvent({
      provider: 'gmail',
      eventData: { from: 'bob@example.com' },
    })

    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('sender_filter mismatch -> filtered out', async () => {
    const node = makeTriggerNode('gmail', 'gmail_trigger_new_email', {
      sender_filter: 'alice@',
    })
    const event = makeWebhookEvent({
      provider: 'gmail',
      eventData: { from: 'bob@example.com' },
    })

    expect(await applyTriggerFilters(node, event)).toBe(false)
  })

  test('subject_filter match (case insensitive) -> passes', async () => {
    const node = makeTriggerNode('gmail', 'gmail_trigger_new_email', {
      subject_filter: 'urgent',
    })
    const event = makeWebhookEvent({
      provider: 'gmail',
      eventData: { subject: 'URGENT: Please review' },
    })

    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('subject_filter mismatch -> filtered out', async () => {
    const node = makeTriggerNode('gmail', 'gmail_trigger_new_email', {
      subject_filter: 'invoice',
    })
    const event = makeWebhookEvent({
      provider: 'gmail',
      eventData: { subject: 'Hello world' },
    })

    expect(await applyTriggerFilters(node, event)).toBe(false)
  })

  test('has_attachments="true" with attachments -> passes', async () => {
    const node = makeTriggerNode('gmail', 'gmail_trigger_new_email', {
      has_attachments: 'true',
    })
    const event = makeWebhookEvent({
      provider: 'gmail',
      eventData: { attachments: [{ name: 'file.pdf' }] },
    })

    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('has_attachments="true" with empty attachments -> filtered out', async () => {
    const node = makeTriggerNode('gmail', 'gmail_trigger_new_email', {
      has_attachments: 'true',
    })
    const event = makeWebhookEvent({
      provider: 'gmail',
      eventData: { attachments: [] },
    })

    expect(await applyTriggerFilters(node, event)).toBe(false)
  })

  test('no filters configured -> passes', async () => {
    const node = makeTriggerNode('gmail', 'gmail_trigger_new_email', {})
    const event = makeWebhookEvent({
      provider: 'gmail',
      eventData: { from: 'anyone@example.com', subject: 'anything' },
    })

    expect(await applyTriggerFilters(node, event)).toBe(true)
  })
})

// ─── Discord Filtering ──────────────────────────────────────────────────────

describe('Discord filtering', () => {
  test('channel_filter match -> passes', async () => {
    const node = makeTriggerNode('discord', 'discord_trigger_new_message', {
      channel_filter: 'ch-123',
    })
    const event = makeWebhookEvent({
      provider: 'discord',
      eventData: { channel_id: 'ch-123' },
    })

    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('channel_filter mismatch -> filtered out', async () => {
    const node = makeTriggerNode('discord', 'discord_trigger_new_message', {
      channel_filter: 'ch-123',
    })
    const event = makeWebhookEvent({
      provider: 'discord',
      eventData: { channel_id: 'ch-999' },
    })

    expect(await applyTriggerFilters(node, event)).toBe(false)
  })

  test('user_filter match -> passes', async () => {
    const node = makeTriggerNode('discord', 'discord_trigger_new_message', {
      user_filter: 'user-1',
    })
    const event = makeWebhookEvent({
      provider: 'discord',
      eventData: { author: { id: 'user-1' } },
    })

    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('user_filter mismatch -> filtered out', async () => {
    const node = makeTriggerNode('discord', 'discord_trigger_new_message', {
      user_filter: 'user-1',
    })
    const event = makeWebhookEvent({
      provider: 'discord',
      eventData: { author: { id: 'user-2' } },
    })

    expect(await applyTriggerFilters(node, event)).toBe(false)
  })

  test('no filters configured -> passes', async () => {
    const node = makeTriggerNode('discord', 'discord_trigger_new_message', {})
    const event = makeWebhookEvent({
      provider: 'discord',
      eventData: { channel_id: 'any', author: { id: 'any' } },
    })

    expect(await applyTriggerFilters(node, event)).toBe(true)
  })
})

// ─── Trello Filtering ───────────────────────────────────────────────────────

describe('Trello filtering', () => {
  test('boardId match -> passes', async () => {
    const node = makeTriggerNode('trello', 'trello_trigger_new_card', {
      boardId: 'board-1',
    })
    const event = makeWebhookEvent({
      provider: 'trello',
      eventData: { boardId: 'board-1' },
    })

    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('boardId mismatch -> filtered out', async () => {
    const node = makeTriggerNode('trello', 'trello_trigger_new_card', {
      boardId: 'board-1',
    })
    const event = makeWebhookEvent({
      provider: 'trello',
      eventData: { boardId: 'board-999' },
    })

    expect(await applyTriggerFilters(node, event)).toBe(false)
  })

  test('board_id alternative field name', async () => {
    const node = makeTriggerNode('trello', 'trello_trigger_new_card', {
      board_id: 'board-1',
    })
    const event = makeWebhookEvent({
      provider: 'trello',
      eventData: { board_id: 'board-1' },
    })

    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('listId match via primary listId field -> passes', async () => {
    const node = makeTriggerNode('trello', 'trello_trigger_new_card', {
      listId: 'list-1',
    })
    const event = makeWebhookEvent({
      provider: 'trello',
      eventData: { listId: 'list-1' },
    })

    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('listId match via _listId fallback -> passes', async () => {
    const node = makeTriggerNode('trello', 'trello_trigger_new_card', {
      listId: 'list-1',
    })
    const event = makeWebhookEvent({
      provider: 'trello',
      eventData: { _listId: 'list-1' },
    })

    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('listId match via toListId -> passes', async () => {
    const node = makeTriggerNode('trello', 'trello_trigger_card_moved', {
      listId: 'list-dest',
    })
    const event = makeWebhookEvent({
      provider: 'trello',
      eventData: { toListId: 'list-dest' },
    })

    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('listId mismatch -> filtered out', async () => {
    const node = makeTriggerNode('trello', 'trello_trigger_new_card', {
      listId: 'list-1',
    })
    const event = makeWebhookEvent({
      provider: 'trello',
      eventData: { listId: 'list-999' },
    })

    expect(await applyTriggerFilters(node, event)).toBe(false)
  })

  test('listId filter with no list candidates in event -> passes', async () => {
    const node = makeTriggerNode('trello', 'trello_trigger_new_card', {
      listId: 'list-1',
    })
    const event = makeWebhookEvent({
      provider: 'trello',
      eventData: { cardId: 'card-1' },
    })

    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('watchedProperties: changed field in watched list -> passes', async () => {
    const node = makeTriggerNode('trello', 'trello_trigger_card_updated', {
      watchedProperties: ['name', 'desc'],
    })
    const event = makeWebhookEvent({
      provider: 'trello',
      eventData: { changedFields: ['name'] },
    })

    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('watchedProperties: changed field NOT in watched list -> filtered out', async () => {
    const node = makeTriggerNode('trello', 'trello_trigger_card_updated', {
      watchedProperties: ['name', 'desc'],
    })
    const event = makeWebhookEvent({
      provider: 'trello',
      eventData: { changedFields: ['pos'] },
    })

    expect(await applyTriggerFilters(node, event)).toBe(false)
  })

  test('watchedProperties: reads from _oldData keys when changedFields not present', async () => {
    const node = makeTriggerNode('trello', 'trello_trigger_card_updated', {
      watchedProperties: ['name', 'desc'],
    })
    const event = makeWebhookEvent({
      provider: 'trello',
      eventData: { _oldData: { desc: 'old description' } },
    })

    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('watchedProperties: empty changedFields -> passes', async () => {
    const node = makeTriggerNode('trello', 'trello_trigger_card_updated', {
      watchedProperties: ['name', 'desc'],
    })
    const event = makeWebhookEvent({
      provider: 'trello',
      eventData: {},
    })

    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('watchedLists: toListId in watchedLists -> passes', async () => {
    const node = makeTriggerNode('trello', 'trello_trigger_card_moved', {
      watchedLists: ['list-a', 'list-b'],
    })
    const event = makeWebhookEvent({
      provider: 'trello',
      eventData: { toListId: 'list-b' },
    })

    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('watchedLists: fromListId in watchedLists -> passes', async () => {
    const node = makeTriggerNode('trello', 'trello_trigger_card_moved', {
      watchedLists: ['list-a', 'list-b'],
    })
    const event = makeWebhookEvent({
      provider: 'trello',
      eventData: { fromListId: 'list-a' },
    })

    // Uses _listBeforeId path
    const event2 = makeWebhookEvent({
      provider: 'trello',
      eventData: { _listBeforeId: 'list-a' },
    })

    expect(await applyTriggerFilters(node, event)).toBe(true)
    expect(await applyTriggerFilters(node, event2)).toBe(true)
  })

  test('watchedLists: neither from/to in watchedLists -> filtered out', async () => {
    const node = makeTriggerNode('trello', 'trello_trigger_card_moved', {
      watchedLists: ['list-a', 'list-b'],
    })
    const event = makeWebhookEvent({
      provider: 'trello',
      eventData: { fromListId: 'list-c', toListId: 'list-d' },
    })

    expect(await applyTriggerFilters(node, event)).toBe(false)
  })

  test('watchedLists: no list IDs in event -> passes', async () => {
    const node = makeTriggerNode('trello', 'trello_trigger_card_moved', {
      watchedLists: ['list-a'],
    })
    const event = makeWebhookEvent({
      provider: 'trello',
      eventData: { cardId: 'card-1' },
    })

    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('cardId match -> passes', async () => {
    const node = makeTriggerNode('trello', 'trello_trigger_comment_added', {
      cardId: 'card-1',
    })
    const event = makeWebhookEvent({
      provider: 'trello',
      eventData: { cardId: 'card-1' },
    })

    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('cardId mismatch -> filtered out', async () => {
    const node = makeTriggerNode('trello', 'trello_trigger_comment_added', {
      cardId: 'card-1',
    })
    const event = makeWebhookEvent({
      provider: 'trello',
      eventData: { cardId: 'card-999' },
    })

    expect(await applyTriggerFilters(node, event)).toBe(false)
  })

  test('cardId with string/number coercion', async () => {
    const node = makeTriggerNode('trello', 'trello_trigger_comment_added', {
      cardId: '123',
    })
    const event = makeWebhookEvent({
      provider: 'trello',
      eventData: { cardId: 123 },
    })

    expect(await applyTriggerFilters(node, event)).toBe(true)
  })
})

// ─── Notion Filtering ───────────────────────────────────────────────────────

describe('Notion filtering', () => {
  test('dataSourceId match -> passes', async () => {
    const node = makeTriggerNode('notion', 'notion_trigger_database_item_created', {
      dataSourceId: 'ds-1',
    })
    const event = makeWebhookEvent({
      provider: 'notion',
      eventData: { data: { parent: { data_source_id: 'ds-1' } } },
    })

    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('dataSourceId mismatch -> filtered out', async () => {
    const node = makeTriggerNode('notion', 'notion_trigger_database_item_created', {
      dataSourceId: 'ds-1',
    })
    const event = makeWebhookEvent({
      provider: 'notion',
      eventData: { data: { parent: { data_source_id: 'ds-999' } } },
    })

    expect(await applyTriggerFilters(node, event)).toBe(false)
  })

  test('database (legacy) match via databaseId field -> passes', async () => {
    const node = makeTriggerNode('notion', 'notion_trigger_database_item_created', {
      database: 'db-1',
    })
    const event = makeWebhookEvent({
      provider: 'notion',
      eventData: { databaseId: 'db-1' },
    })

    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('database match via data.parent.id -> passes', async () => {
    const node = makeTriggerNode('notion', 'notion_trigger_database_item_created', {
      database: 'db-1',
    })
    const event = makeWebhookEvent({
      provider: 'notion',
      eventData: { data: { parent: { id: 'db-1' } } },
    })

    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('database match via entity.id -> passes', async () => {
    const node = makeTriggerNode('notion', 'notion_trigger_database_item_created', {
      database: 'db-1',
    })
    const event = makeWebhookEvent({
      provider: 'notion',
      eventData: { entity: { id: 'db-1' } },
    })

    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('database mismatch -> filtered out', async () => {
    const node = makeTriggerNode('notion', 'notion_trigger_database_item_created', {
      database: 'db-1',
    })
    const event = makeWebhookEvent({
      provider: 'notion',
      eventData: { databaseId: 'db-999' },
    })

    expect(await applyTriggerFilters(node, event)).toBe(false)
  })

  test('workspace match -> passes', async () => {
    const node = makeTriggerNode('notion', 'notion_trigger_database_item_created', {
      workspace: 'ws-1',
    })
    const event = makeWebhookEvent({
      provider: 'notion',
      eventData: { workspace_id: 'ws-1' },
    })

    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('workspace mismatch -> filtered out', async () => {
    const node = makeTriggerNode('notion', 'notion_trigger_database_item_created', {
      workspace: 'ws-1',
    })
    const event = makeWebhookEvent({
      provider: 'notion',
      eventData: { workspace_id: 'ws-999' },
    })

    expect(await applyTriggerFilters(node, event)).toBe(false)
  })

  test('no Notion filters configured -> passes', async () => {
    const node = makeTriggerNode('notion', 'notion_trigger_database_item_created', {})
    const event = makeWebhookEvent({
      provider: 'notion',
      eventData: { databaseId: 'db-1', workspace_id: 'ws-1' },
    })

    expect(await applyTriggerFilters(node, event)).toBe(true)
  })
})

// ─── Unknown Provider ───────────────────────────────────────────────────────

describe('Unknown provider filtering', () => {
  test('returns true (no provider-specific filters)', async () => {
    const node = makeTriggerNode('hubspot', 'hubspot_trigger_event', {
      someConfig: 'value',
    })
    const event = makeWebhookEvent({
      provider: 'hubspot',
      eventData: { anything: true },
    })

    expect(await applyTriggerFilters(node, event)).toBe(true)
  })
})
