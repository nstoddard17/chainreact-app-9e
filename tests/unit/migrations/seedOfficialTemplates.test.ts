/**
 * @jest-environment node
 *
 * Static guard for the official template seed (Slice 4.WORKFLOW-TEMPLATES-MARKETPLACE-6 /
 * CS-XT-8A). Reads the seed SQL (no DB) and proves: it inserts ≥3 OFFICIAL templates with the
 * platform-owned invariants (source='official', account_id NULL, visibility='public', safe
 * 'ChainReact' attribution), is idempotent, leaks no credential material, and every embedded
 * definition is a VALID, credential-free workflow graph using only real registered node types.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { WorkflowDefinitionSchema } from "@/contracts/workflowDefinition";
import { TemplateDefinitionSchema } from "@/contracts/workflowTemplate";

const FILE = "20260618000000_seed_official_templates.sql";
const sql = readFileSync(join(resolve(process.cwd(), "supabase/migrations"), FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, "");

// Real registered (provider, type) pairs this seed is allowed to use (verified against the
// discovery/handler metadata this session).
const KNOWN_NODES = new Set([
  "gmail/new_email",
  "native/schedule.fired",
  "github/new_commit",
  "native/manual.run",
  "slack/send_channel_message",
  "gmail/create_draft",
  "github/create_issue",
]);

// Extract every '{...}'::jsonb definition literal.
const definitions = [...code.matchAll(/'(\{.*?\})'::jsonb/g)].map((m) => JSON.parse(m[1]!));

describe("CS-XT-8A — official template seed (static guards)", () => {
  it("inserts into workflow_templates with ON CONFLICT idempotency", () => {
    expect(code).toMatch(/INSERT\s+INTO\s+public\.workflow_templates/i);
    expect(code).toMatch(/ON\s+CONFLICT\s*\(\s*id\s*\)\s+DO\s+NOTHING/i);
  });

  it("seeds at least 3 official templates", () => {
    expect(definitions.length).toBeGreaterThanOrEqual(3);
    // every row is official / public with a safe attribution + no account/author id.
    const officials = code.match(/'official'/g) ?? [];
    expect(officials.length).toBe(definitions.length);
    expect((code.match(/'public'/g) ?? []).length).toBe(definitions.length);
    expect((code.match(/'ChainReact'/g) ?? []).length).toBe(definitions.length);
    // account_id + created_by_user_id are NULL for every row (platform-owned, no author).
    expect((code.match(/NULL,\s*NULL,/g) ?? []).length).toBeGreaterThanOrEqual(definitions.length);
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
