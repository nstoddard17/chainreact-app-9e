/**
 * Discord Filter Tests (Updated Field Names)
 *
 * Tests the updated Discord trigger filters that use the correct
 * configSchema field names: channelId, guildId, authorFilter, contentFilter
 *
 * Run: npx jest __tests__/webhooks/discord-filters.test.ts --verbose
 */

import { makeTriggerNode, makeWebhookEvent } from './helpers'

// Mocks
jest.mock('@/utils/supabase/server', () => ({
  createSupabaseServiceClient: jest.fn().mockResolvedValue({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      })),
    })),
  }),
}))

jest.mock('@/lib/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

jest.mock('@/lib/webhooks/event-logger', () => ({ logWebhookEvent: jest.fn() }))
jest.mock('@/lib/execution/advancedExecutionEngine', () => ({ AdvancedExecutionEngine: jest.fn() }))

import { applyTriggerFilters } from '@/lib/webhooks/processor'

describe('Discord filters with correct field names', () => {
  test('channelId filter matches event channel_id', async () => {
    const node = makeTriggerNode('discord', 'discord_trigger_new_message', {
      channelId: 'ch-123',
    })
    const event = makeWebhookEvent({
      provider: 'discord',
      eventData: { channel_id: 'ch-123', content: 'hello' },
    })
    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('channelId filter rejects wrong channel', async () => {
    const node = makeTriggerNode('discord', 'discord_trigger_new_message', {
      channelId: 'ch-123',
    })
    const event = makeWebhookEvent({
      provider: 'discord',
      eventData: { channel_id: 'ch-999', content: 'hello' },
    })
    expect(await applyTriggerFilters(node, event)).toBe(false)
  })

  test('guildId filter matches event guild_id', async () => {
    const node = makeTriggerNode('discord', 'discord_trigger_new_message', {
      guildId: 'guild-1',
    })
    const event = makeWebhookEvent({
      provider: 'discord',
      eventData: { guild_id: 'guild-1', content: 'test' },
    })
    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('guildId filter rejects wrong guild', async () => {
    const node = makeTriggerNode('discord', 'discord_trigger_new_message', {
      guildId: 'guild-1',
    })
    const event = makeWebhookEvent({
      provider: 'discord',
      eventData: { guild_id: 'guild-999', content: 'test' },
    })
    expect(await applyTriggerFilters(node, event)).toBe(false)
  })

  test('authorFilter matches event author.id', async () => {
    const node = makeTriggerNode('discord', 'discord_trigger_new_message', {
      authorFilter: 'user-1',
    })
    const event = makeWebhookEvent({
      provider: 'discord',
      eventData: { author: { id: 'user-1' }, content: 'test' },
    })
    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('authorFilter rejects wrong author', async () => {
    const node = makeTriggerNode('discord', 'discord_trigger_new_message', {
      authorFilter: 'user-1',
    })
    const event = makeWebhookEvent({
      provider: 'discord',
      eventData: { author: { id: 'user-999' }, content: 'test' },
    })
    expect(await applyTriggerFilters(node, event)).toBe(false)
  })

  test('contentFilter matches keyword in content', async () => {
    const node = makeTriggerNode('discord', 'discord_trigger_new_message', {
      contentFilter: ['urgent', 'help'],
    })
    const event = makeWebhookEvent({
      provider: 'discord',
      eventData: { content: 'I need URGENT help please' },
    })
    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('contentFilter rejects when no keyword matches', async () => {
    const node = makeTriggerNode('discord', 'discord_trigger_new_message', {
      contentFilter: ['urgent', 'help'],
    })
    const event = makeWebhookEvent({
      provider: 'discord',
      eventData: { content: 'Just a normal message' },
    })
    expect(await applyTriggerFilters(node, event)).toBe(false)
  })

  test('contentFilter is case insensitive', async () => {
    const node = makeTriggerNode('discord', 'discord_trigger_new_message', {
      contentFilter: ['Bug'],
    })
    const event = makeWebhookEvent({
      provider: 'discord',
      eventData: { content: 'found a bug in production' },
    })
    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('combined filters: all must pass', async () => {
    const node = makeTriggerNode('discord', 'discord_trigger_new_message', {
      channelId: 'ch-1',
      guildId: 'guild-1',
      authorFilter: 'user-1',
      contentFilter: ['deploy'],
    })
    const event = makeWebhookEvent({
      provider: 'discord',
      eventData: {
        channel_id: 'ch-1',
        guild_id: 'guild-1',
        author: { id: 'user-1' },
        content: 'starting deploy now',
      },
    })
    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('combined filters: one mismatch fails all', async () => {
    const node = makeTriggerNode('discord', 'discord_trigger_new_message', {
      channelId: 'ch-1',
      guildId: 'guild-1',
      authorFilter: 'user-1',
    })
    const event = makeWebhookEvent({
      provider: 'discord',
      eventData: {
        channel_id: 'ch-1',
        guild_id: 'guild-WRONG',
        author: { id: 'user-1' },
        content: 'test',
      },
    })
    expect(await applyTriggerFilters(node, event)).toBe(false)
  })

  test('no filters configured passes everything', async () => {
    const node = makeTriggerNode('discord', 'discord_trigger_new_message', {})
    const event = makeWebhookEvent({
      provider: 'discord',
      eventData: { channel_id: 'any', guild_id: 'any', author: { id: 'any' }, content: 'anything' },
    })
    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('normalizedData field names also work (channelId instead of channel_id)', async () => {
    const node = makeTriggerNode('discord', 'discord_trigger_new_message', {
      channelId: 'ch-1',
    })
    const event = makeWebhookEvent({
      provider: 'discord',
      eventData: { channelId: 'ch-1', content: 'normalized format' },
    })
    expect(await applyTriggerFilters(node, event)).toBe(true)
  })

  test('authorId field also works for author filtering', async () => {
    const node = makeTriggerNode('discord', 'discord_trigger_new_message', {
      authorFilter: 'user-1',
    })
    const event = makeWebhookEvent({
      provider: 'discord',
      eventData: { authorId: 'user-1', content: 'test' },
    })
    expect(await applyTriggerFilters(node, event)).toBe(true)
  })
})
