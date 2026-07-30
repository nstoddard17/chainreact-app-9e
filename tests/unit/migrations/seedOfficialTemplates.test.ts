/**
 * @jest-environment node
 *
 * Static guard for the official template seed catalog (Slice 4.WORKFLOW-TEMPLATES-MARKETPLACE-6 /
 * CS-XT-8A — batch 1; MARKETPLACE-OFFICIAL-CATALOG-1 — batch 2; TEMPLATE-QUALITY-1 — batch 5 +
 * retirement of the ≤4-node batches 1–3). Reads EVERY official-seed SQL file (no DB) and proves:
 * each inserts OFFICIAL templates with the platform-owned invariants (source='official',
 * account_id NULL, visibility='public', safe 'ChainReact' attribution), is idempotent, leaks no
 * credential material, and every embedded definition is a VALID, credential-free workflow graph
 * using only real registered node types.
 *
 * Since TEMPLATE-QUALITY-1, seed configs may carry SAFE variable-only prewiring (verified
 * {{trigger.x}} / {{nodeId.x}} references + generic static labels) — the per-value safety rules,
 * the EFFECTIVE catalog (seeds minus retirements), and the ≥5-node floor are enforced by
 * tests/unit/migrations/officialTemplateCatalogIntegrity.test.ts; this file guards the seed
 * files themselves.
 *
 * Forward-compatible: it discovers `*_seed_official_templates*.sql` rather than hard-coding one
 * file, so future seed batches are validated automatically — and so this guard validates the
 * whole shipped catalog, not just the first batch.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { WorkflowDefinitionSchema } from "@/contracts/workflowDefinition";
import { TemplateDefinitionSchema } from "@/contracts/workflowTemplate";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const SEED_FILES = readdirSync(MIGRATIONS)
  .filter((f) => /_seed_official_templates.*\.sql$/.test(f))
  .sort();
// Comment-stripped SQL of every seed file, concatenated (so corpus-wide assertions span batches).
const code = SEED_FILES.map((f) =>
  readFileSync(join(MIGRATIONS, f), "utf8").replace(/--[^\n]*/g, ""),
).join("\n");

// Real registered (provider, type) pairs the official catalog is allowed to use. Each pair is
// ALSO validated against the LIVE discovery registry in
// tests/structure/official-template-node-registration.test.ts — this explicit allowlist is the
// belt-and-braces "which nodes do officials use" surface a reviewer scans in the PR diff.
const KNOWN_NODES = new Set([
  // triggers
  "gmail/new_email",
  "gmail/new_labeled_email",
  "gmail/new_attachment",
  "native/schedule.fired",
  "native/manual.run",
  "github/new_commit",
  "hubspot/webhook_received",
  "shopify/webhook_received",
  "stripe/event_received",
  "trello/new_card",
  "monday/new_item",
  "mailchimp/email_opened",
  "mailchimp/campaign_created",
  "facebook/new_comment",
  "google-docs/new_document",
  "google-drive/file_changed",
  "google-calendar/event_changed",
  "microsoft-onedrive/file_changed",
  "microsoft-teams/new_channel_message",
  "dropbox/new_file",
  "slack/channel_created",
  "slack/member_joined_channel",
  "slack/file_shared",
  // actions
  "slack/send_channel_message",
  "slack/send_direct_message",
  "gmail/create_draft",
  "gmail/send_email",
  "github/create_issue",
  "hubspot/create_contact",
  "hubspot/create_deal",
  "hubspot/create_task",
  "hubspot/get_contacts",
  "google-sheets/append_row",
  "mailchimp/add_subscriber",
  "mailchimp/add_tag",
  "facebook/create_post",
  "google-analytics/send_event",
  "microsoft-outlook/send_email",
  "microsoft-teams/send_channel_message",
  "trello/create_card",
  "discord/send_message",
  "google-docs/create_document",
  "google-docs/share_document",
  "google-drive/upload_file",
  "google-drive/move_file",
  "microsoft-onedrive/upload_file",
  "notion/create_page",
  "notion/create_database_entry",
  "shopify/add_order_note",
  // batch 3 additions
  "google-sheets/row_changed",
  "mailchimp/subscriber_added_to_segment",
  "airtable/record_changed",
  "monday/create_item",
  "airtable/create_record",
  "microsoft-outlook/create_draft_email",
  "google-analytics/run_report",
  // batch 4 additions (complex multi-step business processes)
  "mailchimp/link_clicked",
  "slack/reaction_added",
  "hubspot/add_contact_to_list",
  "hubspot/create_note",
  "hubspot/create_ticket",
  "hubspot/create_meeting",
  "slack/get_thread_messages",
  "monday/create_subitem",
  "gmail/create_draft_reply",
  "stripe/find_customer",
  "stripe/get_payments",
  "mailchimp/get_subscriber",
  "google-drive/get_file_metadata",
  "google-drive/create_folder",
  "google-calendar/create_event",
  // batch 5 additions (TEMPLATE-QUALITY-1 — business-process catalog)
  "typeform/new_response_in_form",
  "calendly/event_scheduled",
  "calendly/event_canceled",
  "quickbooks/invoice_created",
  "quickbooks/payment_received",
  "quickbooks/get_customer",
  "asana/create_task",
  "asana/create_subtask",
  "asana/task_completed",
  "native/if_then_condition",
  "hubspot/get_deals",
  // GOOGLE-REVIEW-TEMPLATE-1 / GOOGLE-REVIEW-CERTIFICATION-2 — the three Google OAuth reviewer
  // templates. Most nodes were already listed above (gmail/new_email, google-drive/upload_file,
  // google-sheets/append_row, google-calendar/create_event, gmail/send_email, gmail/create_draft_reply,
  // google-docs/create_document, google-docs/share_document, google-analytics/run_report,
  // native/manual.run); these are the additions that demonstrate the remaining Google scopes.
  "gmail/add_label",                              // gmail.modify
  "google-docs/update_document",                  // documents (write)
  "google-docs/get_document",                     // documents (read)
  "google-analytics/get_realtime_data",           // analytics.readonly
  "google-analytics/find_conversion",             // analytics.readonly
  "google-analytics/create_conversion_event",     // analytics.edit
]);

/**
 * Config values are TYPED to their meta field, not stringly-typed: `string-array` fields carry a
 * string[] (Sheets row `values`), `boolean` fields carry a boolean (the Gmail trigger's
 * `subjectExactMatch`). The safety substance — bounded length, no `@`, no token shapes — is
 * asserted on every STRING LEAF, whatever container it sits in. Anything else (a number, an
 * object, a nested array of objects) stays rejected.
 */
function assertSafeConfigValue(value: unknown): void {
  if (typeof value === "boolean") return;
  if (Array.isArray(value)) {
    for (const item of value) {
      expect(typeof item).toBe("string");
      assertSafeConfigValue(item);
    }
    return;
  }
  expect(typeof value).toBe("string");
  expect((value as string).length).toBeLessThanOrEqual(200);
  expect(value as string).not.toMatch(/@|xox[baprs]-|\bsk_[a-z0-9]{8,}|whsec_/i);
}

// Extract every '{...}'::jsonb definition literal across all seed files.
const definitions = [...code.matchAll(/'(\{.*?\})'::jsonb/g)].map((m) => JSON.parse(m[1]!));
// Extract every seeded template id (the fixed UUIDs) + name literal for uniqueness checks.
const ids = [...code.matchAll(/'(c0ffee00-[0-9a-f-]+)'/g)].map((m) => m[1]!);

describe("CS-XT-8A — official template seed (static guards)", () => {
  it("inserts into workflow_templates with ON CONFLICT idempotency", () => {
    // EVERY seed file inserts into the table and is idempotent (so a db:push replay is safe and
    // a later batch never modifies an earlier one).
    expect(SEED_FILES.length).toBeGreaterThanOrEqual(1);
    for (const f of SEED_FILES) {
      const fileSql = readFileSync(join(MIGRATIONS, f), "utf8").replace(/--[^\n]*/g, "");
      expect(fileSql).toMatch(/INSERT\s+INTO\s+public\.workflow_templates/i);
      expect(fileSql).toMatch(/ON\s+CONFLICT\s*\(\s*id\s*\)\s+DO\s+NOTHING/i);
    }
  });

  it("seeds the full official catalog (≥105 templates across all batches) with unique ids", () => {
    // 5 (batch 1) + 45 (batch 2) + 25 (batch 3) + 15 (batch 4) + 12 (batch 5) + 3 (the Google
    // OAuth reviewer templates). Batches 1–3 are RETIRED by 20260720000000
    // (≤4-node demos) but their applied seed files remain part of the corpus this static guard
    // validates; the effective catalog is asserted in officialTemplateCatalogIntegrity.test.ts.
    expect(definitions.length).toBeGreaterThanOrEqual(105);
    // every row is official / public with a safe attribution + no account/author id.
    const officials = code.match(/'official'/g) ?? [];
    expect(officials.length).toBe(definitions.length);
    expect((code.match(/'public'/g) ?? []).length).toBe(definitions.length);
    expect((code.match(/'ChainReact'/g) ?? []).length).toBe(definitions.length);
    // account_id + created_by_user_id are NULL for every row (platform-owned, no author).
    expect((code.match(/NULL,\s*NULL,/g) ?? []).length).toBeGreaterThanOrEqual(definitions.length);
    // one fixed id per inserted row, all unique (idempotent ON CONFLICT (id) relies on this).
    expect(ids.length).toBe(definitions.length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("leaks NO credential / secret / identity material", () => {
    expect(code).not.toMatch(/xox[baprs]-/i);
    expect(code).not.toMatch(/access_token|refresh_token|client_secret|api[_-]?key|bearer/i);
    // `\b` so a HubSpot field name like `hs_task_subject` (…sk_subject…) is not a false
    // positive; real Stripe secret keys are token-delimited (`"sk_live_…"`).
    expect(code).not.toMatch(/\bsk_[a-z0-9]{6,}|whsec_/i);
    // no email-shaped strings, no provider account labels.
    expect(code).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  });

  it("every definition is a VALID credential-free workflow graph (usable by /use)", () => {
    expect(definitions.length).toBeGreaterThan(0);
    for (const def of definitions) {
      // passes both the strict template schema AND the workflow schema (one trigger, valid edges).
      expect(() => TemplateDefinitionSchema.parse(def)).not.toThrow();
      expect(() => WorkflowDefinitionSchema.parse(def)).not.toThrow();
      // exactly one trigger; every config value is either empty or a SAFE prewired string
      // (variable reference / generic static label — no secrets, no resource-id, no email
      // literals; the full per-value policy is enforced in officialTemplateCatalogIntegrity).
      const triggers = def.nodes.filter((n: { kind: string }) => n.kind === "trigger");
      expect(triggers).toHaveLength(1);
      for (const node of def.nodes) {
        for (const value of Object.values(node.config as Record<string, unknown>)) {
          assertSafeConfigValue(value);
        }
        expect(KNOWN_NODES.has(`${node.provider}/${node.type}`)).toBe(true);
      }
    }
  });

  it("includes complex multi-step business processes (≥1 each of 5, 6, and 7+ node templates)", () => {
    const counts = definitions.map((d) => d.nodes.length);
    expect(counts.filter((n) => n === 5).length).toBeGreaterThanOrEqual(1);
    expect(counts.filter((n) => n === 6).length).toBeGreaterThanOrEqual(1);
    expect(counts.filter((n) => n >= 7).length).toBeGreaterThanOrEqual(1);
    // every multi-step template is still exactly one trigger + linear/connected actions.
    for (const def of definitions) {
      expect(def.nodes.filter((n: { kind: string }) => n.kind === "trigger")).toHaveLength(1);
    }
  });
});
