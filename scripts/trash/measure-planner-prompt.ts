/**
 * AI-27 audit helper — measures actual planner prompt sizes against the LIVE
 * catalog. One-off. Lives in scripts/trash per CLAUDE.md trash convention.
 *
 * Reports for each representative scenario:
 *   - char count of the system prompt
 *   - rough token estimate (chars / 3.7 — Anthropic English heuristic)
 *   - per-section breakdown (rules / catalog / connected / canvas / output)
 *
 * Scenarios:
 *   S0 — empty integrations, empty canvas (worst-case-baseline cost)
 *   S1 — Slack + Gmail connected, empty canvas
 *   S2 — Slack + Gmail connected, Manual Trigger → Slack on canvas (edit)
 *   S3 — Slack + Gmail + Stripe connected, populated canvas (3 nodes)
 *
 * Run: npx tsx scripts/trash/measure-planner-prompt.ts
 */

import { buildWorkflowPlanPrompt } from "@/services/ai/planner/buildWorkflowPlanPrompt";
import { getProviderCatalog } from "@/services/ai/tools/providerCatalog";
import type { WorkflowPlanPromptInput } from "@/services/ai/planner/types";
import type { ConnectedIntegrationView } from "@/services/ai/tools/integrations";

// Anthropic English heuristic — a token is ~3.7-4.2 chars on average.
const CHARS_PER_TOKEN = 3.7;
function estTokens(s: string): number {
  return Math.round(s.length / CHARS_PER_TOKEN);
}

function fmt(label: string, chars: number): string {
  return `${label.padEnd(36)} ${String(chars).padStart(7)} chars  ~${String(
    estTokens(`${"x".repeat(chars)}`),
  ).padStart(6)} tokens`;
}

function connected(provider: string, account: string, me?: string): ConnectedIntegrationView {
  return {
    provider,
    accountLabel: account,
    ...(me ? { currentUserId: me } : {}),
  } as ConnectedIntegrationView;
}

const cat = getProviderCatalog();
if (!cat.ok) {
  console.error("Catalog lookup failed:", cat);
  process.exit(1);
}
const catalog = cat.data;
const usable = catalog.providers.filter((p) => p.actions.length > 0 || p.triggers.length > 0);
const totalActions = usable.reduce((n, p) => n + p.actions.length, 0);
const totalTriggers = usable.reduce((n, p) => n + p.triggers.length, 0);
const totalConfigFields = usable.reduce(
  (n, p) =>
    n +
    p.actions.reduce((m, a) => m + a.configFields.length, 0) +
    p.triggers.reduce((m, t) => m + t.configFields.length, 0),
  0,
);
const totalOutputs = usable.reduce(
  (n, p) =>
    n +
    p.actions.reduce((m, a) => m + a.outputs.length, 0) +
    p.triggers.reduce((m, t) => m + t.outputs.length, 0),
  0,
);

console.log("=".repeat(72));
console.log("CATALOG INVENTORY");
console.log("=".repeat(72));
console.log(`Usable providers:        ${usable.length} / ${catalog.providers.length}`);
console.log(`Total actions:           ${totalActions}`);
console.log(`Total triggers:          ${totalTriggers}`);
console.log(`Total config fields:     ${totalConfigFields}`);
console.log(`Total output fields:     ${totalOutputs}`);
console.log();

// Per-provider breakdown
console.log("Per-provider action/trigger/config-field/output counts:");
const byProvider = [...usable]
  .map((p) => ({
    id: p.id,
    a: p.actions.length,
    t: p.triggers.length,
    cf:
      p.actions.reduce((m, a) => m + a.configFields.length, 0) +
      p.triggers.reduce((m, t) => m + t.configFields.length, 0),
    out:
      p.actions.reduce((m, a) => m + a.outputs.length, 0) +
      p.triggers.reduce((m, t) => m + t.outputs.length, 0),
  }))
  .sort((a, b) => b.cf + b.out - (a.cf + a.out));
for (const p of byProvider) {
  console.log(
    `  ${p.id.padEnd(28)} actions=${String(p.a).padStart(3)} triggers=${String(
      p.t,
    ).padStart(2)} configFields=${String(p.cf).padStart(3)} outputs=${String(p.out).padStart(3)}`,
  );
}
console.log();

// ─── Scenarios ─────────────────────────────────────────────────────────────
function build(
  label: string,
  userRequest: string,
  connectedIntegrations: ConnectedIntegrationView[],
  currentGraph?: WorkflowPlanPromptInput["currentGraph"],
): void {
  const input: WorkflowPlanPromptInput = {
    userRequest,
    catalog,
    connectedIntegrations,
    ...(currentGraph ? { currentGraph } : {}),
  };
  const messages = buildWorkflowPlanPrompt(input);
  const system = messages[0]!.content;
  const user = messages[1]!.content;
  const total = system.length + user.length;

  console.log("=".repeat(72));
  console.log(`SCENARIO: ${label}`);
  console.log("=".repeat(72));
  console.log(`User: "${user}"`);
  console.log();
  console.log(fmt("Total prompt:", total));
  console.log(fmt("  system message", system.length));
  console.log(fmt("  user message", user.length));
  console.log();

  // Per-section breakdown by splitting on the two-newline section separator.
  const sections = system.split("\n\n");
  const labels = [
    "preamble",
    "Rules (PLANNER_CONSTRAINTS)",
    "TEMPLATE_FUTURE_NOTE",
    "Catalog (providers/actions/triggers)",
    "Connected integrations",
    "Current canvas",
    // cost section may be absent — accept either order
  ];
  for (let i = 0; i < sections.length; i++) {
    const lbl = i < labels.length ? labels[i]! : `section ${i}`;
    const s = sections[i]!;
    console.log(fmt(`  [${i}] ${lbl}`, s.length));
  }
  console.log();
}

build("S0 — no integrations, empty canvas (cold start)", "Build a workflow", []);

build(
  "S1 — Slack+Gmail connected, empty canvas (typical first prompt)",
  "Send a Slack DM to me when I get a new Gmail email",
  [connected("slack", "Acme Workspace", "U01ABC23DEF"), connected("gmail", "me@acme.com")],
);

build(
  "S2 — Slack+Gmail connected, existing canvas (edit)",
  "Also post to #alerts after the DM",
  [connected("slack", "Acme Workspace", "U01ABC23DEF"), connected("gmail", "me@acme.com")],
  {
    nodes: [
      { id: "n1", kind: "trigger", provider: "gmail", type: "new_email" },
      { id: "n2", kind: "action", provider: "slack", type: "send_direct_message" },
    ],
    edges: [{ id: "e1", from: "n1", to: "n2" }],
  },
);

build(
  "S3 — Slack+Gmail+Stripe connected, populated canvas (3 nodes)",
  "Add a Discord post when a Stripe charge fails, and include the customer email from the event payload",
  [
    connected("slack", "Acme Workspace", "U01ABC23DEF"),
    connected("gmail", "me@acme.com"),
    connected("stripe", "Acme Inc."),
  ],
  {
    nodes: [
      { id: "n1", kind: "trigger", provider: "stripe", type: "event_received" },
      { id: "n2", kind: "action", provider: "slack", type: "send_channel_message" },
      { id: "n3", kind: "action", provider: "native", type: "if_then_condition" },
    ],
    edges: [
      { id: "e1", from: "n1", to: "n3" },
      { id: "e2", from: "n3", to: "n2" },
    ],
  },
);

// ─── Per-provider catalog cost ────────────────────────────────────────────
// What does ONE provider's catalog rendering cost (chars+tokens)? Useful
// for designing narrowing.
console.log("=".repeat(72));
console.log("PER-PROVIDER CATALOG-RENDER COST");
console.log("=".repeat(72));
const singleProviderCosts: { id: string; chars: number; tokens: number }[] = [];
for (const p of usable) {
  const single = buildWorkflowPlanPrompt({
    userRequest: "x",
    catalog: { providers: [p] },
    connectedIntegrations: [],
  });
  const sys = single[0]!.content;
  // Approximate the catalog section by diffing against a no-provider catalog.
  const baseline = buildWorkflowPlanPrompt({
    userRequest: "x",
    catalog: { providers: [] },
    connectedIntegrations: [],
  });
  const baselineSys = baseline[0]!.content;
  const catalogChars = sys.length - baselineSys.length;
  singleProviderCosts.push({ id: p.id, chars: catalogChars, tokens: estTokens(`${"x".repeat(catalogChars)}`) });
}
singleProviderCosts.sort((a, b) => b.chars - a.chars);
for (const c of singleProviderCosts) {
  console.log(`  ${c.id.padEnd(28)} ${String(c.chars).padStart(6)} chars  ~${String(c.tokens).padStart(5)} tokens`);
}
const totalProviderChars = singleProviderCosts.reduce((n, c) => n + c.chars, 0);
console.log(
  `  ${"TOTAL".padEnd(28)} ${String(totalProviderChars).padStart(6)} chars  ~${String(
    estTokens(`${"x".repeat(totalProviderChars)}`),
  ).padStart(5)} tokens`,
);
