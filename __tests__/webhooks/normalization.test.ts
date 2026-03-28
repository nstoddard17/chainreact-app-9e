/**
 * Webhook Event Normalization Tests
 *
 * Tests the normalizeWebhookEvent() function which converts raw webhook payloads
 * from different providers into a standardized format for the processor.
 *
 * Run: npx jest __tests__/webhooks/normalization.test.ts --verbose
 */

// Mock logger before import
jest.mock('@/lib/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}))

import { normalizeWebhookEvent } from '@/lib/webhooks/normalizer'

const REQ_ID = 'test-req-001'

// ─── Slack Normalization ─────────────────────────────────────────────────────

describe('Slack normalization', () => {
  test('message in public channel via channelType="channel"', () => {
    const raw = {
      event: {
        type: 'message',
        text: 'Hello world',
        user: 'U123',
        channel: 'C456',
        channel_type: 'channel',
        ts: '1234567890.123456',
      },
      team_id: 'T789',
    }

    const result = normalizeWebhookEvent('slack', raw, REQ_ID)
    expect(result.eventType).toBe('slack_trigger_message_channels')
    expect(result.normalizedData.message.text).toBe('Hello world')
    expect(result.normalizedData.message.user).toBe('U123')
    expect(result.normalizedData.message.channel).toBe('C456')
    expect(result.normalizedData.message.channelType).toBe('channel')
    expect(result.normalizedData.message.team).toBe('T789')
  })

  test('message in DM via channelType="im"', () => {
    const raw = {
      event: {
        type: 'message',
        text: 'Private msg',
        user: 'U123',
        channel: 'D456',
        channel_type: 'im',
        ts: '1234567890.123456',
      },
    }

    const result = normalizeWebhookEvent('slack', raw, REQ_ID)
    expect(result.eventType).toBe('slack_trigger_message_im')
  })

  test('message in group DM via channelType="mpim"', () => {
    const raw = {
      event: {
        type: 'message',
        text: 'Group msg',
        user: 'U123',
        channel: 'G456',
        channel_type: 'mpim',
        ts: '1234567890.123456',
      },
    }

    const result = normalizeWebhookEvent('slack', raw, REQ_ID)
    expect(result.eventType).toBe('slack_trigger_message_mpim')
  })

  test('channel ID prefix fallback: C-prefix -> channels', () => {
    const raw = {
      event: {
        type: 'message',
        text: 'Test',
        channel: 'C123456',
        ts: '1234567890.123456',
        // No channel_type field
      },
    }

    const result = normalizeWebhookEvent('slack', raw, REQ_ID)
    expect(result.eventType).toBe('slack_trigger_message_channels')
  })

  test('channel ID prefix fallback: D-prefix -> im', () => {
    const raw = {
      event: {
        type: 'message',
        text: 'Test',
        channel: 'D123456',
        ts: '1234567890.123456',
      },
    }

    const result = normalizeWebhookEvent('slack', raw, REQ_ID)
    expect(result.eventType).toBe('slack_trigger_message_im')
  })

  test('channel ID prefix fallback: G-prefix -> mpim', () => {
    const raw = {
      event: {
        type: 'message',
        text: 'Test',
        channel: 'G123456',
        ts: '1234567890.123456',
      },
    }

    const result = normalizeWebhookEvent('slack', raw, REQ_ID)
    expect(result.eventType).toBe('slack_trigger_message_mpim')
  })

  test('reaction_added event', () => {
    const raw = {
      event: {
        type: 'reaction_added',
        reaction: 'thumbsup',
        user: 'U123',
        item: { type: 'message', channel: 'C456', ts: '111.222' },
        event_ts: '333.444',
      },
      team_id: 'T789',
    }

    const result = normalizeWebhookEvent('slack', raw, REQ_ID)
    expect(result.eventType).toBe('slack_trigger_reaction_added')
    expect(result.normalizedData.reaction).toBe('thumbsup')
    expect(result.normalizedData.user).toBe('U123')
    expect(result.normalizedData.team).toBe('T789')
  })

  test('reaction_removed event', () => {
    const raw = {
      event: {
        type: 'reaction_removed',
        reaction: 'thumbsup',
        user: 'U123',
        item: { type: 'message', channel: 'C456', ts: '111.222' },
        event_ts: '333.444',
      },
    }

    const result = normalizeWebhookEvent('slack', raw, REQ_ID)
    expect(result.eventType).toBe('slack_trigger_reaction_removed')
    expect(result.normalizedData.reaction).toBe('thumbsup')
  })

  test('channel_created event', () => {
    const raw = {
      event: {
        type: 'channel_created',
        channel: { id: 'C999', name: 'new-channel' },
        event_ts: '555.666',
      },
      team_id: 'T789',
    }

    const result = normalizeWebhookEvent('slack', raw, REQ_ID)
    expect(result.eventType).toBe('slack_trigger_channel_created')
    expect(result.normalizedData.channel).toEqual({ id: 'C999', name: 'new-channel' })
  })

  test('member_joined_channel event', () => {
    const raw = {
      event: {
        type: 'member_joined_channel',
        user: 'U123',
        channel: 'C456',
        event_ts: '777.888',
      },
      team_id: 'T789',
    }

    const result = normalizeWebhookEvent('slack', raw, REQ_ID)
    expect(result.eventType).toBe('slack_trigger_member_joined_channel')
    expect(result.normalizedData.user).toBe('U123')
    expect(result.normalizedData.channel).toBe('C456')
  })

  test('member_left_channel event', () => {
    const raw = {
      event: {
        type: 'member_left_channel',
        user: 'U123',
        channel: 'C456',
        event_ts: '999.000',
      },
    }

    const result = normalizeWebhookEvent('slack', raw, REQ_ID)
    expect(result.eventType).toBe('slack_trigger_member_left_channel')
  })

  test('file_shared event maps to file_uploaded', () => {
    const raw = {
      event: {
        type: 'file_shared',
        file_id: 'F123',
        user_id: 'U456',
        channel_id: 'C789',
        event_ts: '111.222',
      },
    }

    const result = normalizeWebhookEvent('slack', raw, REQ_ID)
    expect(result.eventType).toBe('slack_trigger_file_uploaded')
    expect(result.normalizedData.file).toBe('F123')
    expect(result.normalizedData.user).toBe('U456')
  })

  test('team_join event maps to user_joined_workspace', () => {
    const raw = {
      event: {
        type: 'team_join',
        user: { id: 'U123', name: 'newuser' },
        event_ts: '333.444',
      },
      team_id: 'T789',
    }

    const result = normalizeWebhookEvent('slack', raw, REQ_ID)
    expect(result.eventType).toBe('slack_trigger_user_joined_workspace')
    expect(result.normalizedData.user).toEqual({ id: 'U123', name: 'newuser' })
  })

  test('message_deleted subtype sets ignore=true', () => {
    const raw = {
      event: {
        type: 'message',
        subtype: 'message_deleted',
        deleted_ts: '111.222',
        event_ts: '333.444',
      },
    }

    const result = normalizeWebhookEvent('slack', raw, REQ_ID)
    expect(result.eventType).toBe('slack_trigger_message_deleted')
    expect(result.ignore).toBe(true)
  })

  test('team_id extraction priority: event.team > envelope.team_id > event.team_id', () => {
    // Priority 1: slackEvent.team
    const raw1 = {
      event: { type: 'message', text: 'a', channel: 'C1', ts: '1.1', team: 'T_EVENT' },
      team_id: 'T_ENVELOPE',
    }
    const r1 = normalizeWebhookEvent('slack', raw1, REQ_ID)
    expect(r1.normalizedData.message.team).toBe('T_EVENT')

    // Priority 2: envelope.team_id (when event.team missing)
    const raw2 = {
      event: { type: 'message', text: 'a', channel: 'C1', ts: '1.1' },
      team_id: 'T_ENVELOPE',
    }
    const r2 = normalizeWebhookEvent('slack', raw2, REQ_ID)
    expect(r2.normalizedData.message.team).toBe('T_ENVELOPE')

    // Priority 3: slackEvent.team_id
    const raw3 = {
      event: { type: 'message', text: 'a', channel: 'C1', ts: '1.1', team_id: 'T_NESTED' },
    }
    const r3 = normalizeWebhookEvent('slack', raw3, REQ_ID)
    expect(r3.normalizedData.message.team).toBe('T_NESTED')
  })

  test('envelope unwrapping: event nested under rawEvent.event', () => {
    const raw = {
      event: {
        type: 'message',
        text: 'nested event',
        channel: 'C100',
        channel_type: 'channel',
        user: 'U100',
        ts: '999.111',
      },
      event_id: 'Ev123',
      team_id: 'T100',
    }

    const result = normalizeWebhookEvent('slack', raw, REQ_ID)
    expect(result.normalizedData.message.text).toBe('nested event')
    expect(result.normalizedData.message.user).toBe('U100')
  })
})

// ─── Trello Normalization ────────────────────────────────────────────────────

describe('Trello normalization', () => {
  test('createCard -> trello_trigger_new_card', () => {
    const raw = {
      action: {
        type: 'createCard',
        date: '2026-01-01T00:00:00Z',
        data: {
          board: { id: 'board-1' },
          list: { id: 'list-1' },
          card: { id: 'card-1', name: 'New Card', shortLink: 'abc123' },
        },
      },
    }

    const result = normalizeWebhookEvent('trello', raw, REQ_ID)
    expect(result.eventType).toBe('trello_trigger_new_card')
    expect(result.normalizedData.boardId).toBe('board-1')
    expect(result.normalizedData.listId).toBe('list-1')
    expect(result.normalizedData.cardId).toBe('card-1')
    expect(result.normalizedData.name).toBe('New Card')
    expect(result.normalizedData.url).toBe('https://trello.com/c/abc123')
  })

  test('copyCard -> trello_trigger_new_card', () => {
    const raw = {
      action: {
        type: 'copyCard',
        data: {
          board: { id: 'board-1' },
          list: { id: 'list-1' },
          card: { id: 'card-2', name: 'Copied Card' },
        },
      },
    }

    const result = normalizeWebhookEvent('trello', raw, REQ_ID)
    expect(result.eventType).toBe('trello_trigger_new_card')
  })

  test('updateCard without list change -> trello_trigger_card_updated', () => {
    const raw = {
      action: {
        type: 'updateCard',
        data: {
          board: { id: 'board-1' },
          card: { id: 'card-1', name: 'Updated' },
          old: { name: 'Original' },
        },
      },
    }

    const result = normalizeWebhookEvent('trello', raw, REQ_ID)
    expect(result.eventType).toBe('trello_trigger_card_updated')
    expect(result.normalizedData.changedFields).toEqual(['name'])
    expect(result.normalizedData.oldValues).toEqual({ name: 'Original' })
  })

  test('updateCard with list change -> trello_trigger_card_moved', () => {
    const raw = {
      action: {
        type: 'updateCard',
        data: {
          board: { id: 'board-1' },
          card: { id: 'card-1', name: 'Moved Card' },
          listBefore: { id: 'list-a', name: 'To Do' },
          listAfter: { id: 'list-b', name: 'Done' },
        },
      },
    }

    const result = normalizeWebhookEvent('trello', raw, REQ_ID)
    expect(result.eventType).toBe('trello_trigger_card_moved')
    expect(result.normalizedData.fromListId).toBe('list-a')
    expect(result.normalizedData.toListId).toBe('list-b')
    expect(result.normalizedData.fromListName).toBe('To Do')
    expect(result.normalizedData.toListName).toBe('Done')
  })

  test('updateCard with closed in data.old -> trello_trigger_card_archived (priority)', () => {
    const raw = {
      action: {
        type: 'updateCard',
        data: {
          board: { id: 'board-1' },
          card: { id: 'card-1', name: 'Archived', closed: true },
          old: { closed: false },
        },
      },
    }

    const result = normalizeWebhookEvent('trello', raw, REQ_ID)
    expect(result.eventType).toBe('trello_trigger_card_archived')
    expect(result.normalizedData.closed).toBe(true)
  })

  test('moveCardToBoard -> trello_trigger_card_moved', () => {
    const raw = {
      action: {
        type: 'moveCardToBoard',
        data: {
          board: { id: 'board-2' },
          card: { id: 'card-1' },
        },
      },
    }

    const result = normalizeWebhookEvent('trello', raw, REQ_ID)
    expect(result.eventType).toBe('trello_trigger_card_moved')
  })

  test('commentCard -> trello_trigger_comment_added', () => {
    const raw = {
      action: {
        id: 'action-1',
        type: 'commentCard',
        date: '2026-01-01T00:00:00Z',
        memberCreator: { id: 'member-1', fullName: 'John Doe' },
        data: {
          board: { id: 'board-1' },
          card: { id: 'card-1' },
          text: 'Great work!',
        },
      },
    }

    const result = normalizeWebhookEvent('trello', raw, REQ_ID)
    expect(result.eventType).toBe('trello_trigger_comment_added')
    expect(result.normalizedData.commentText).toBe('Great work!')
    expect(result.normalizedData.authorId).toBe('member-1')
    expect(result.normalizedData.authorName).toBe('John Doe')
  })

  test('addMemberToCard -> trello_trigger_member_changed with action="added"', () => {
    const raw = {
      action: {
        type: 'addMemberToCard',
        data: {
          board: { id: 'board-1' },
          card: { id: 'card-1' },
          idMember: 'member-2',
        },
        member: { fullName: 'Jane Smith' },
      },
    }

    const result = normalizeWebhookEvent('trello', raw, REQ_ID)
    expect(result.eventType).toBe('trello_trigger_member_changed')
    expect(result.normalizedData.action).toBe('added')
    expect(result.normalizedData.memberId).toBe('member-2')
  })

  test('removeMemberFromCard -> trello_trigger_member_changed with action="removed"', () => {
    const raw = {
      action: {
        type: 'removeMemberFromCard',
        data: {
          board: { id: 'board-1' },
          card: { id: 'card-1' },
          idMember: 'member-2',
        },
      },
    }

    const result = normalizeWebhookEvent('trello', raw, REQ_ID)
    expect(result.eventType).toBe('trello_trigger_member_changed')
    expect(result.normalizedData.action).toBe('removed')
  })

  test('filter metadata (_oldData, _listId, etc.) present on all normalized events', () => {
    const raw = {
      action: {
        type: 'createCard',
        data: {
          board: { id: 'board-1' },
          list: { id: 'list-1' },
          card: { id: 'card-1', name: 'Test' },
        },
      },
    }

    const result = normalizeWebhookEvent('trello', raw, REQ_ID)
    expect(result.normalizedData).toHaveProperty('_raw')
    expect(result.normalizedData).toHaveProperty('_actionType', 'createCard')
    expect(result.normalizedData).toHaveProperty('_listId', 'list-1')
    expect(result.normalizedData).toHaveProperty('_listBeforeId', null)
    expect(result.normalizedData).toHaveProperty('_listAfterId', null)
    expect(result.normalizedData).toHaveProperty('_oldData', null)
  })

  test('card URL uses shortLink when url not provided', () => {
    const raw = {
      action: {
        type: 'createCard',
        data: {
          card: { id: 'card-1', shortLink: 'xyz789' },
        },
      },
    }

    const result = normalizeWebhookEvent('trello', raw, REQ_ID)
    expect(result.normalizedData.url).toBe('https://trello.com/c/xyz789')
  })

  test('card URL uses provided url over shortLink', () => {
    const raw = {
      action: {
        type: 'createCard',
        data: {
          card: {
            id: 'card-1',
            url: 'https://trello.com/c/custom-url',
            shortLink: 'xyz789',
          },
        },
      },
    }

    const result = normalizeWebhookEvent('trello', raw, REQ_ID)
    expect(result.normalizedData.url).toBe('https://trello.com/c/custom-url')
  })

  test('unknown action with card data -> trello_trigger_card_updated', () => {
    const raw = {
      action: {
        type: 'someUnknownAction',
        data: {
          card: { id: 'card-1' },
          board: { id: 'board-1' },
        },
      },
    }

    const result = normalizeWebhookEvent('trello', raw, REQ_ID)
    expect(result.eventType).toBe('trello_trigger_card_updated')
  })

  test('unknown action without card -> trello_trigger_event', () => {
    const raw = {
      action: {
        type: 'someUnknownAction',
        data: {
          board: { id: 'board-1' },
        },
      },
    }

    const result = normalizeWebhookEvent('trello', raw, REQ_ID)
    expect(result.eventType).toBe('trello_trigger_event')
  })
})

// ─── Default Normalization ───────────────────────────────────────────────────

describe('Default normalization', () => {
  test('unknown provider returns passthrough with provider_trigger_event type', () => {
    const raw = { id: 'evt-1', someField: 'value' }

    const result = normalizeWebhookEvent('hubspot', raw, REQ_ID)
    expect(result.eventType).toBe('hubspot_trigger_event')
    expect(result.normalizedData).toEqual(raw)
    expect(result.eventId).toBe('evt-1')
  })

  test('event ID extraction: tries id, then event_id, then requestId', () => {
    // Uses id first
    const r1 = normalizeWebhookEvent('github', { id: 'ID1', event_id: 'ID2' }, REQ_ID)
    expect(r1.eventId).toBe('ID1')

    // Falls back to event_id
    const r2 = normalizeWebhookEvent('github', { event_id: 'ID2' }, REQ_ID)
    expect(r2.eventId).toBe('ID2')

    // Falls back to requestId
    const r3 = normalizeWebhookEvent('github', { someOtherField: true }, REQ_ID)
    expect(r3.eventId).toBe(REQ_ID)
  })
})
