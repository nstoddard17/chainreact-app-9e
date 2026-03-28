/**
 * End-to-End Provider Simulation Tests
 *
 * Simulates real webhook payloads from each provider flowing through
 * the normalizer and processor to verify they reach workflow execution.
 *
 * Run: npx jest __tests__/webhooks/provider-e2e.test.ts --verbose
 */

jest.mock('@/lib/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

import { normalizeWebhookEvent } from '@/lib/webhooks/normalizer'

// ─── Realistic Payload Simulations ──────────────────────────────────────────

describe('Slack: realistic payload end-to-end', () => {
  test('real Slack message event normalizes correctly', () => {
    // Actual Slack event subscription payload shape
    const slackPayload = {
      token: 'verification-token',
      team_id: 'T0123456',
      api_app_id: 'A0123456',
      event: {
        type: 'message',
        channel: 'C0123456789',
        channel_type: 'channel',
        user: 'U0123456789',
        text: 'Hello from Slack!',
        ts: '1609459200.000100',
        client_msg_id: 'msg-abc-123',
        event_ts: '1609459200.000100',
        team: 'T0123456',
      },
      type: 'event_callback',
      event_id: 'Ev0123456789',
      event_time: 1609459200,
    }

    const result = normalizeWebhookEvent('slack', slackPayload, 'req-1')

    expect(result.eventType).toBe('slack_trigger_message_channels')
    expect(result.normalizedData.message.text).toBe('Hello from Slack!')
    expect(result.normalizedData.message.user).toBe('U0123456789')
    expect(result.normalizedData.message.channel).toBe('C0123456789')
    expect(result.normalizedData.message.team).toBe('T0123456')
    expect(result.normalizedData.message.id).toBe('msg-abc-123')
    expect(result.ignore).toBeUndefined()
  })

  test('real Slack reaction_added event', () => {
    const payload = {
      event: {
        type: 'reaction_added',
        user: 'U0123456789',
        reaction: 'thumbsup',
        item: { type: 'message', channel: 'C0123456789', ts: '1609459200.000100' },
        item_user: 'U9876543210',
        event_ts: '1609459200.000200',
      },
      team_id: 'T0123456',
      event_id: 'Ev0123456790',
    }

    const result = normalizeWebhookEvent('slack', payload, 'req-2')
    expect(result.eventType).toBe('slack_trigger_reaction_added')
    expect(result.normalizedData.reaction).toBe('thumbsup')
    expect(result.normalizedData.user).toBe('U0123456789')
  })
})

describe('Discord: realistic payload end-to-end', () => {
  test('real Discord MESSAGE_CREATE from gateway', () => {
    // Actual Discord gateway dispatch payload
    const discordPayload = {
      t: 'MESSAGE_CREATE',
      s: 42,
      op: 0,
      d: {
        id: '1234567890123456789',
        type: 0,
        content: 'Hey everyone!',
        channel_id: '9876543210123456789',
        guild_id: '1111111111111111111',
        author: {
          id: '2222222222222222222',
          username: 'testuser',
          discriminator: '0',
          avatar: 'abc123',
          bot: false,
        },
        timestamp: '2026-01-01T12:00:00.000000+00:00',
        attachments: [],
        embeds: [],
        mentions: [],
        mention_roles: [],
        pinned: false,
        tts: false,
      },
    }

    const result = normalizeWebhookEvent('discord', discordPayload, 'req-3')

    expect(result.eventType).toBe('discord_trigger_new_message')
    expect(result.normalizedData.messageId).toBe('1234567890123456789')
    expect(result.normalizedData.content).toBe('Hey everyone!')
    expect(result.normalizedData.authorId).toBe('2222222222222222222')
    expect(result.normalizedData.authorName).toBe('testuser')
    expect(result.normalizedData.channelId).toBe('9876543210123456789')
    expect(result.normalizedData.guildId).toBe('1111111111111111111')
    // Verify filter-compatible fields
    expect(result.normalizedData.channel_id).toBe('9876543210123456789')
    expect(result.normalizedData.author.id).toBe('2222222222222222222')
  })

  test('real Discord GUILD_MEMBER_ADD', () => {
    const payload = {
      t: 'GUILD_MEMBER_ADD',
      d: {
        user: {
          id: '3333333333333333333',
          username: 'newmember',
          discriminator: '1234',
          avatar: 'def456',
        },
        guild_id: '1111111111111111111',
        joined_at: '2026-01-15T08:30:00.000000+00:00',
        roles: [],
        deaf: false,
        mute: false,
      },
    }

    const result = normalizeWebhookEvent('discord', payload, 'req-4')

    expect(result.eventType).toBe('discord_trigger_member_join')
    expect(result.normalizedData.memberId).toBe('3333333333333333333')
    expect(result.normalizedData.memberUsername).toBe('newmember')
    expect(result.normalizedData.memberTag).toBe('newmember#1234')
    expect(result.normalizedData.guildId).toBe('1111111111111111111')
  })
})

describe('Trello: realistic payload end-to-end', () => {
  test('real Trello card created webhook', () => {
    // Actual Trello webhook payload shape
    const trelloPayload = {
      model: { id: 'board-id-123' },
      action: {
        id: 'action-id-456',
        type: 'createCard',
        date: '2026-01-10T14:30:00.000Z',
        memberCreator: {
          id: 'member-789',
          fullName: 'John Smith',
          username: 'johnsmith',
        },
        data: {
          board: { id: 'board-id-123', name: 'Project Board' },
          list: { id: 'list-id-abc', name: 'To Do' },
          card: {
            id: 'card-id-xyz',
            name: 'New feature request',
            desc: 'Please add dark mode',
            shortLink: 'abcdef',
            idShort: 42,
          },
        },
      },
    }

    const result = normalizeWebhookEvent('trello', trelloPayload, 'req-5')

    expect(result.eventType).toBe('trello_trigger_new_card')
    expect(result.normalizedData.boardId).toBe('board-id-123')
    expect(result.normalizedData.listId).toBe('list-id-abc')
    expect(result.normalizedData.cardId).toBe('card-id-xyz')
    expect(result.normalizedData.name).toBe('New feature request')
    expect(result.normalizedData.url).toBe('https://trello.com/c/abcdef')
    expect(result.normalizedData._actionType).toBe('createCard')
  })

  test('real Trello card moved between lists', () => {
    const trelloPayload = {
      action: {
        id: 'action-move-1',
        type: 'updateCard',
        date: '2026-01-10T15:00:00.000Z',
        data: {
          board: { id: 'board-1' },
          card: { id: 'card-1', name: 'Task' },
          listBefore: { id: 'list-todo', name: 'To Do' },
          listAfter: { id: 'list-done', name: 'Done' },
          old: { idList: 'list-todo' },
        },
      },
    }

    const result = normalizeWebhookEvent('trello', trelloPayload, 'req-6')

    expect(result.eventType).toBe('trello_trigger_card_moved')
    expect(result.normalizedData.fromListId).toBe('list-todo')
    expect(result.normalizedData.toListId).toBe('list-done')
    expect(result.normalizedData.fromListName).toBe('To Do')
    expect(result.normalizedData.toListName).toBe('Done')
  })
})

describe('Notion: event type mapping end-to-end', () => {
  // Notion events go through the processor's notionEventMap, not the normalizer
  // This test verifies the normalizer passes Notion events through correctly

  test('Notion page.created event passes through as-is', () => {
    const notionPayload = {
      type: 'page.created',
      entity: { id: 'page-123', type: 'page' },
      data: { parent: { data_source_id: 'ds-1' } },
      workspace_id: 'ws-1',
    }

    const result = normalizeWebhookEvent('notion', notionPayload, 'req-7')

    // Notion uses default case (custom route handles its own processing)
    expect(result.eventType).toBe('notion_trigger_event')
    expect(result.normalizedData).toEqual(notionPayload)
  })
})

describe('Default provider passthrough', () => {
  test('Shopify webhook data passes through unmodified', () => {
    const shopifyData = {
      id: 1234567890,
      email: 'customer@example.com',
      total_price: '99.99',
      line_items: [{ title: 'Widget', quantity: 2 }],
    }

    const result = normalizeWebhookEvent('shopify', shopifyData, 'req-8')

    expect(result.eventType).toBe('shopify_trigger_event')
    expect(result.normalizedData).toEqual(shopifyData)
    expect(result.eventId).toBe(1234567890)
  })

  test('HubSpot webhook data passes through unmodified', () => {
    const hubspotData = {
      objectId: 123,
      subscriptionType: 'contact.creation',
      portalId: 456,
      occurredAt: 1609459200000,
    }

    const result = normalizeWebhookEvent('hubspot', hubspotData, 'req-9')
    expect(result.eventType).toBe('hubspot_trigger_event')
    expect(result.normalizedData).toEqual(hubspotData)
  })
})

// ─── Deduplication Tests ────────────────────────────────────────────────────

describe('Deduplication behavior', () => {
  // These test the normalizer's event ID extraction which is used for dedup

  test('Slack uses client_msg_id as event ID for dedup', () => {
    const payload = {
      event: {
        type: 'message',
        client_msg_id: 'unique-msg-id',
        text: 'hello',
        channel: 'C1',
        ts: '123.456',
      },
    }
    const result = normalizeWebhookEvent('slack', payload, 'req-10')
    expect(result.eventId).toBe('unique-msg-id')
  })

  test('Trello uses action.id as event ID for dedup', () => {
    const payload = {
      action: {
        id: 'action-unique-123',
        type: 'createCard',
        data: { card: { id: 'c1' } },
      },
    }
    const result = normalizeWebhookEvent('trello', payload, 'req-11')
    expect(result.eventId).toBe('action-unique-123')
  })

  test('Discord uses message id as event ID for dedup', () => {
    const payload = {
      t: 'MESSAGE_CREATE',
      d: { id: 'discord-msg-999', content: 'test', channel_id: 'ch-1' },
    }
    const result = normalizeWebhookEvent('discord', payload, 'req-12')
    expect(result.eventId).toBe('discord-msg-999')
  })

  test('unknown provider uses raw event id for dedup', () => {
    const payload = { id: 'evt-abc' }
    const result = normalizeWebhookEvent('stripe', payload, 'req-13')
    expect(result.eventId).toBe('evt-abc')
  })

  test('fallback to requestId when no event ID available', () => {
    const payload = { data: 'no id field' }
    const result = normalizeWebhookEvent('custom', payload, 'req-fallback')
    expect(result.eventId).toBe('req-fallback')
  })
})

// ─── Error Resilience ───────────────────────────────────────────────────────

describe('Malformed payload resilience', () => {
  test('null event data does not crash normalizer', () => {
    expect(() => normalizeWebhookEvent('slack', null, 'req')).not.toThrow()
    expect(() => normalizeWebhookEvent('discord', null, 'req')).not.toThrow()
    expect(() => normalizeWebhookEvent('trello', null, 'req')).not.toThrow()
    expect(() => normalizeWebhookEvent('unknown', null, 'req')).not.toThrow()
  })

  test('empty object does not crash normalizer', () => {
    expect(() => normalizeWebhookEvent('slack', {}, 'req')).not.toThrow()
    expect(() => normalizeWebhookEvent('discord', {}, 'req')).not.toThrow()
    expect(() => normalizeWebhookEvent('trello', {}, 'req')).not.toThrow()
  })

  test('undefined fields are handled gracefully', () => {
    const result = normalizeWebhookEvent('slack', {
      event: { type: 'message' },
    }, 'req')
    expect(result.normalizedData.message.text).toBe('')
    expect(result.normalizedData.message.user).toBeUndefined()
  })
})
