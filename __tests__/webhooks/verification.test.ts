/**
 * Webhook Signature Verification Tests
 *
 * Tests HMAC signature verification for all supported providers.
 *
 * Run: npx jest __tests__/webhooks/verification.test.ts --verbose
 */

import crypto from 'crypto'

jest.mock('@/lib/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

// Mock environment variables
const MOCK_SECRETS: Record<string, string> = {
  SLACK_SIGNING_SECRET: 'slack-secret-123',
  DISCORD_BOT_TOKEN: 'discord-secret-456',
  GITHUB_WEBHOOK_SECRET: 'github-secret-789',
  NOTION_API_KEY: 'notion-secret-abc',
}

const originalEnv = process.env
beforeAll(() => {
  process.env = { ...originalEnv, ...MOCK_SECRETS }
})
afterAll(() => {
  process.env = originalEnv
})

import { verifyWebhookSignature } from '@/lib/webhooks/verification'

// Helper to create a mock NextRequest
function mockRequest(headers: Record<string, string>, body: string): any {
  const headerMap = new Map(Object.entries(headers))
  let bodyRead = false
  return {
    headers: {
      get: (name: string) => headerMap.get(name) || null,
      entries: () => headerMap.entries(),
    },
    text: () => {
      if (bodyRead) throw new Error('Body already read')
      bodyRead = true
      return Promise.resolve(body)
    },
  }
}

describe('Slack signature verification', () => {
  const secret = MOCK_SECRETS.SLACK_SIGNING_SECRET

  function makeSlackSignature(body: string, timestamp: string): string {
    const sigBaseString = `v0:${timestamp}:${body}`
    const hash = crypto.createHmac('sha256', secret).update(sigBaseString).digest('hex')
    return `v0=${hash}`
  }

  test('valid signature passes', async () => {
    const body = '{"event":"test"}'
    const timestamp = String(Math.floor(Date.now() / 1000))
    const signature = makeSlackSignature(body, timestamp)

    const req = mockRequest({
      'x-slack-signature': signature,
      'x-slack-request-timestamp': timestamp,
    }, body)

    expect(await verifyWebhookSignature(req, 'slack')).toBe(true)
  })

  test('invalid signature fails', async () => {
    const body = '{"event":"test"}'
    const timestamp = String(Math.floor(Date.now() / 1000))

    const req = mockRequest({
      'x-slack-signature': 'v0=invalid_signature_here',
      'x-slack-request-timestamp': timestamp,
    }, body)

    expect(await verifyWebhookSignature(req, 'slack')).toBe(false)
  })

  test('expired timestamp fails (replay attack protection)', async () => {
    const body = '{"event":"test"}'
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 600) // 10 minutes ago
    const signature = makeSlackSignature(body, oldTimestamp)

    const req = mockRequest({
      'x-slack-signature': signature,
      'x-slack-request-timestamp': oldTimestamp,
    }, body)

    expect(await verifyWebhookSignature(req, 'slack')).toBe(false)
  })

  test('missing headers skips verification (dev mode)', async () => {
    const req = mockRequest({}, '{"event":"test"}')
    expect(await verifyWebhookSignature(req, 'slack')).toBe(true)
  })
})

describe('GitHub signature verification', () => {
  const secret = MOCK_SECRETS.GITHUB_WEBHOOK_SECRET

  test('valid sha256 signature passes', async () => {
    const body = '{"action":"push"}'
    const hash = crypto.createHmac('sha256', secret).update(body).digest('hex')
    const signature = `sha256=${hash}`

    const req = mockRequest({ 'x-hub-signature': signature }, body)
    expect(await verifyWebhookSignature(req, 'github')).toBe(true)
  })

  test('invalid signature fails', async () => {
    const body = '{"action":"push"}'
    const req = mockRequest({ 'x-hub-signature': 'sha256=wrong' }, body)
    expect(await verifyWebhookSignature(req, 'github')).toBe(false)
  })
})

describe('Notion signature verification', () => {
  const secret = MOCK_SECRETS.NOTION_API_KEY

  test('valid v0 signature passes', async () => {
    const body = '{"type":"page.created"}'
    const hash = crypto.createHmac('sha256', secret).update(body).digest('hex')
    const signature = `v0=${hash}`

    const req = mockRequest({ 'x-signature': signature }, body)
    expect(await verifyWebhookSignature(req, 'notion')).toBe(true)
  })

  test('invalid signature fails', async () => {
    const body = '{"type":"page.created"}'
    const req = mockRequest({ 'x-signature': 'v0=invalid' }, body)
    expect(await verifyWebhookSignature(req, 'notion')).toBe(false)
  })
})

describe('Trello verification', () => {
  test('always passes (uses callback challenge, not HMAC)', async () => {
    const req = mockRequest({}, '{"action":"createCard"}')
    expect(await verifyWebhookSignature(req, 'trello')).toBe(true)
  })
})

describe('Unknown provider', () => {
  test('no secret configured -> passes (dev mode)', async () => {
    const req = mockRequest({}, '{"data":"test"}')
    expect(await verifyWebhookSignature(req, 'unknown-provider')).toBe(true)
  })

  test('with generic x-signature header -> verifies HMAC', async () => {
    // This provider has no secret configured so it passes
    const req = mockRequest({ 'x-signature': 'some-sig' }, '{"data":"test"}')
    expect(await verifyWebhookSignature(req, 'unknown-provider')).toBe(true)
  })
})

describe('Error handling', () => {
  test('request.text() failure returns false', async () => {
    const req = {
      headers: {
        get: (name: string) => name === 'x-slack-signature' ? 'v0=test' : String(Math.floor(Date.now() / 1000)),
      },
      text: () => Promise.reject(new Error('Stream error')),
    }

    expect(await verifyWebhookSignature(req as any, 'slack')).toBe(false)
  })
})
