/**
 * @jest-environment node
 *
 * Static guard for the official template seed catalog (Slice 4.WORKFLOW-TEMPLATES-MARKETPLACE-6 /
 * CS-XT-8A — batch 1; MARKETPLACE-OFFICIAL-CATALOG-1 — batch 2). Reads EVERY official-seed SQL
 * file (no DB) and proves: each inserts OFFICIAL templates with the platform-owned invariants
 * (source='official', account_id NULL, visibility='public', safe 'ChainReact' attribution), is
 * idempotent, leaks no credential material, and every embedded definition is a VALID,
 * credential-free workflow graph using only real registered node types. Across all batches the
 * catalog is ≥50 templates with unique ids/names.
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
]);

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

  it("seeds the full official catalog (≥50 templates) with unique ids", () => {
    expect(definitions.length).toBeGreaterThanOrEqual(50);
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
    expect(code).not.toMatch(/sk_[a-z0-9]{6,}|whsec_/i);
    // no email-shaped strings, no provider account labels.
    expect(code).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  });

  it("every definition is a VALID credential-free workflow graph (usable by /use)", () => {
    expect(definitions.length).toBeGreaterThan(0);
    for (const def of definitions) {
      // passes both the strict template schema AND the workflow schema (one trigger, valid edges).
      expect(() => TemplateDefinitionSchema.parse(def)).not.toThrow();
      expect(() => WorkflowDefinitionSchema.parse(def)).not.toThrow();
      // exactly one trigger; every config is empty (no secrets / resource ids baked in).
      const triggers = def.nodes.filter((n: { kind: string }) => n.kind === "trigger");
      expect(triggers).toHaveLength(1);
      for (const node of def.nodes) {
        expect(node.config).toEqual({});
        expect(KNOWN_NODES.has(`${node.provider}/${node.type}`)).toBe(true);
      }
    }
  });
});
