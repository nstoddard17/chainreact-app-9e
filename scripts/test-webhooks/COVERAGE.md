# Webhook Test Coverage Inventory

## Coverage Table

| Provider | Route Type | Signature | Triggers | Positive | No-Match | Receipt Ready | Status |
|----------|-----------|-----------|----------|----------|----------|---------------|--------|
| **GitHub** | Custom | HMAC-SHA256 | 1 | 1 | 1 | Yes | Covered |
| **Slack** | Generic | HMAC-SHA256 | 11 | 1 | 1 | Yes | Partial (1/11 triggers) |
| **Shopify** | Custom | HMAC-SHA256 | 8 | 1 | 1 | Yes | Partial (1/8 triggers) |
| **Discord** | Generic | None* | 3 | 1 | 1 | Yes (generic pipeline) | Partial (1/3 triggers) |
| **Trello** | Generic | None | 6 | 1 | 1 | Yes (generic pipeline) | Partial (1/6 triggers) |
| **Monday** | Custom | HMAC-SHA256 | 5 | 1 | 1 | Yes | Partial (1/5 triggers) |
| **HubSpot** | Custom | None | 17 | 1 | 1 | Yes | Partial (1/17 triggers) |
| **Facebook** | Custom | Challenge | 2 | 1 | 1 | Yes | Covered |
| **Gumroad** | Custom | None | 8 | 1 | 1 | Yes | Partial (1/8 triggers) |
| **Mailchimp** | Custom | None | 4 | 1 | 1 | Yes | Partial (1/4 triggers) |
| **Stripe** | Custom | Stripe SDK | 15 | 1 | 1 | Yes | Partial (1/15 triggers) |
| **Notion** | Custom | HMAC-SHA256 | 6 | 1 | 1 | Yes | Partial (1/6 triggers) |
| **Teams** | Custom | Encrypted* | 6 | 1 | 1 | Yes | Partial (1/6, test-mode bypass) |
| **Gmail** | Custom | Pub/Sub* | 4 | 1 | 1 | Yes | Partial (1/4, test-mode bypass) |
| **Google** | Custom | Push notif | Multi | 1 | 1 | Yes | Receipt-only (no live API) |

## Minimum Coverage Rule

Every webhook trigger should have at least:
- 1 positive-match test (receipt + match + execution)
- 1 no-match test (receipt + no match + no execution)

Higher-risk providers should also have:
- Invalid signature test (401 response)
- Duplicate delivery / dedup test
- Malformed payload test

## Expansion Batches

### Batch 1: Generic Pipeline (zero route changes needed)
- **Discord**: 3 triggers via normalizer, no signature, JSON
- **Trello**: 6 triggers via normalizer, no signature, JSON
- These go through `[provider]/route.ts` which already has testRunId + webhook_events

### Batch 2: Custom Signed Routes (need canonical receipt contract)
- **Monday**: HMAC-SHA256, JSON, already stores webhook_events
- **Notion**: HMAC-SHA256, JSON, custom route
- **Facebook**: Challenge-based, JSON

### Batch 3: Custom Unsigned Routes (need receipt + testRunId)
- **HubSpot**: No signature, JSON, many triggers
- **Gumroad**: No signature, form-encoded (needs runner changes)
- **Mailchimp**: No signature, form-encoded (needs runner changes)

### Batch 4: Complex Routes (SDK-level verification)
- **Stripe**: Per-resource secrets, Stripe SDK verification
- **Teams**: Encrypted payloads, Microsoft Graph subscriptions
- **Gmail/Google**: Pub/Sub push notifications

## What "Receipt Ready" Means

A provider is "receipt ready" when:
1. Its route stores a `webhook_events` row with `request_id = requestId`
2. The `requestId` is the `x-test-run-id` header when `WEBHOOK_TEST_MODE=true`
3. The verification endpoint can find the event by `testRunId`

Providers using the generic `[provider]/route.ts` pipeline get this for free.
Custom routes need it added explicitly (same pattern as GitHub/Shopify).

## Current Score

- **Covered**: 15 providers (all webhook-capable providers)
- **Tests**: 30 (15 positive, 15 negative)
- **All passing**: 30/30

## Notes

- **Teams** and **Gmail** use test-mode bypasses (`WEBHOOK_TEST_MODE=true`). These test the processing pipeline but NOT real encrypted/Pub/Sub delivery.
- **Mailchimp** was refactored to add `trigger_resources` matching as the primary path, with legacy `workflows.contains` as fallback.
- **Stripe** stores `STRIPE_WEBHOOK_SECRET` from env into the fixture's `trigger_resources.config.webhookSecret` at setup time.
- **Notion** stores `NOTION_WEBHOOK_SECRET` from env into `trigger_resources.metadata.verificationToken`.
- **Google** (Drive, Calendar, Sheets, Docs) remains uncovered — uses a different push notification model.

## Coverage Levels

| Level | Providers | What it tests |
|-------|-----------|---------------|
| **Full pipeline** | GitHub, Slack, Shopify, Discord, Trello, Monday, HubSpot, Facebook, Gumroad, Notion, Stripe, Mailchimp | Receipt → match → execution → completed |
| **Test-mode bypass** | Teams, Gmail | Receipt → match → execution (skips encrypted/API fetch) |
| **Receipt-only** | Google (Drive/Calendar/Sheets/Docs) | Receipt → service routing (no live API for matching/execution) |
