/**
 * Tests for core/errors/humanizeActionError.
 *
 * Pure function. Covers every engine code, the Slack-specific extractors,
 * and the generic fallback shape so the run-history UI never displays a
 * raw "Slack chat.postMessage failed: x" string.
 */
import { humanizeActionError } from "@/core/errors/humanizeActionError";

describe("humanizeActionError — engine codes", () => {
  it("MISSING_VARIABLE includes the failed path + reason hint + open_node action", () => {
    const result = humanizeActionError({
      code: "MISSING_VARIABLE",
      message: "Missing variable: trigger.unknown (missing_field)",
      details: { path: "trigger.unknown", reason: "missing_field" },
    });
    expect(result.title).toMatch(/variable/i);
    expect(result.description).toContain("trigger.unknown");
    expect(result.hint).toMatch(/upstream data/i);
    expect(result.action).toBe("open_node");
    expect(result.severity).toBe("error");
  });

  it("MISSING_VARIABLE missing_node hint differs from missing_field hint", () => {
    const node = humanizeActionError({
      code: "MISSING_VARIABLE",
      message: "x",
      details: { path: "step1.x", reason: "missing_node" },
    });
    const field = humanizeActionError({
      code: "MISSING_VARIABLE",
      message: "x",
      details: { path: "step1.x", reason: "missing_field" },
    });
    expect(node.hint).not.toBe(field.hint);
  });

  it("MISSING_VARIABLE array_out_of_bounds has its own hint", () => {
    const result = humanizeActionError({
      code: "MISSING_VARIABLE",
      message: "x",
      details: { path: "items[5]", reason: "array_out_of_bounds" },
    });
    expect(result.hint).toMatch(/array/i);
  });

  it("MISSING_HANDLER suggests picking a supported action type", () => {
    const result = humanizeActionError({
      code: "MISSING_HANDLER",
      message: "No handler registered for slack:unknown_thing.",
    });
    expect(result.action).toBe("open_node");
    expect(result.severity).toBe("error");
  });

  it("WORKFLOW_NOT_FOUND is a warning (not an error) — race between event arrival and workflow deletion", () => {
    const result = humanizeActionError({
      code: "WORKFLOW_NOT_FOUND",
      message: "Workflow X not found.",
    });
    expect(result.severity).toBe("warning");
  });

  it("TRIGGER_NODE_NOT_FOUND suggests resaving the workflow", () => {
    const result = humanizeActionError({
      code: "TRIGGER_NODE_NOT_FOUND",
      message: "Trigger node n1 not present.",
    });
    expect(result.action).toBe("open_node");
    expect(result.hint).toMatch(/re-?save/i);
  });

  it("BILLING_EXHAUSTED routes to upgrade_plan with a warning severity (not error)", () => {
    const result = humanizeActionError({
      code: "BILLING_EXHAUSTED",
      message: "Task quota exhausted: 100/100 tasks used this period.",
    });
    expect(result.title).toMatch(/quota/i);
    expect(result.description).toMatch(/100\/100/);
    expect(result.hint).toMatch(/upgrade/i);
    expect(result.action).toBe("upgrade_plan");
    expect(result.severity).toBe("warning");
  });

  it("BILLING_EXHAUSTED falls back to a generic description when message is empty", () => {
    const result = humanizeActionError({ code: "BILLING_EXHAUSTED", message: "" });
    expect(result.description).toMatch(/task quota|billing period/i);
    expect(result.action).toBe("upgrade_plan");
  });

  // Engine-branching Commit 1 — INVALID_BRANCH humanizer row added (the
  // engine itself starts emitting this code in Commit 2). See
  // docs/slices/parity/engine-branching-plan.md §3.3 + §6.1.

  it("INVALID_BRANCH includes the failed branch label and routes to open_node", () => {
    const result = humanizeActionError({
      code: "INVALID_BRANCH",
      message:
        "Handler returned branchTaken='maybe' but no outgoing edge has that label.",
    });
    expect(result.title).toMatch(/branch label/i);
    expect(result.description).toContain("maybe");
    expect(result.hint).toMatch(/outgoing edge|branch decision/i);
    expect(result.action).toBe("open_node");
    expect(result.severity).toBe("error");
  });

  it("INVALID_BRANCH falls back to a generic description when message is empty", () => {
    const result = humanizeActionError({ code: "INVALID_BRANCH", message: "" });
    expect(result.title).toMatch(/branch label/i);
    expect(result.description).toMatch(/branch|outgoing edge/i);
    expect(result.action).toBe("open_node");
    expect(result.severity).toBe("error");
  });

  it("EXECUTION_INTERRUPTED (COST-15F stale-run sweep) → 'Run interrupted', error, retry_later (CR-FAILREASON-1)", () => {
    const result = humanizeActionError({
      code: "EXECUTION_INTERRUPTED",
      message: "Run interrupted: still 'running' 60+ minutes after start.",
    });
    expect(result.title).toBe("Run interrupted");
    expect(result.description).toContain("interrupted");
    expect(result.hint).toMatch(/re-run|engine|deploy/i);
    expect(result.severity).toBe("error");
    expect(result.action).toBe("retry_later");
  });

  it("EXECUTION_INTERRUPTED falls back to a generic description when message is empty", () => {
    const result = humanizeActionError({ code: "EXECUTION_INTERRUPTED", message: "" });
    expect(result.title).toBe("Run interrupted");
    expect(result.description).toMatch(/interrupted|restarted/i);
    expect(result.severity).toBe("error");
  });
});

describe("humanizeActionError — Slack handler errors (HANDLER_FAILED routing)", () => {
  function slack(code: string) {
    return humanizeActionError({
      code: "HANDLER_FAILED",
      message: `Slack chat.postMessage failed: ${code}`,
    });
  }

  it("invalid_auth → reconnect action", () => {
    const r = slack("invalid_auth");
    expect(r.action).toBe("reconnect");
    expect(r.title).toMatch(/reconnected/i);
  });

  it.each(["token_revoked", "token_expired", "account_inactive", "not_authed"])(
    "%s → reconnect action",
    (code) => {
      expect(slack(code).action).toBe("reconnect");
    },
  );

  it("channel_not_found → open_node, hints to check the channel id", () => {
    const r = slack("channel_not_found");
    expect(r.action).toBe("open_node");
    expect(r.hint).toMatch(/channel id|member/i);
  });

  it("not_in_channel → re-invite hint, open_node", () => {
    const r = slack("not_in_channel");
    expect(r.action).toBe("open_node");
    expect(r.hint).toMatch(/re-?invite/i);
  });

  it("is_archived → archived-channel description distinct from not_in_channel", () => {
    const archived = slack("is_archived");
    const notIn = slack("not_in_channel");
    expect(archived.description).not.toBe(notIn.description);
  });

  it("rate_limited and http_429 are warnings (engine retries via the queue, future)", () => {
    expect(slack("rate_limited").severity).toBe("warning");
    expect(slack("http_429").severity).toBe("warning");
  });

  it("http_500 is a warning with a 'Slack status page' hint", () => {
    const r = slack("http_500");
    expect(r.severity).toBe("warning");
    expect(r.hint).toMatch(/status page/i);
  });

  it("unknown Slack code falls back to a generic 'Slack reported: <code>' description + contact_support", () => {
    const r = slack("some_new_code");
    expect(r.description).toMatch(/some_new_code/);
    expect(r.action).toBe("contact_support");
  });

  it("rate_limited / http_429 / http_500 route to retry_later (CR-FAILREASON-1)", () => {
    expect(slack("rate_limited").action).toBe("retry_later");
    expect(slack("http_429").action).toBe("retry_later");
    expect(slack("http_500").action).toBe("retry_later");
  });
});

describe("humanizeActionError — fallback (CR-FAILREASON-1: safe + contact_support)", () => {
  it("unknown code → contact_support, error, and does NOT echo the raw message", () => {
    const r = humanizeActionError({ code: "MYSTERY", message: "boom" });
    expect(r.title).toBe("Workflow step failed");
    expect(r.action).toBe("contact_support");
    expect(r.severity).toBe("error");
    // The raw thrown message must not leak into the user-facing description.
    expect(r.description).not.toContain("boom");
    expect(r.description).toMatch(/unexpected/i);
  });

  it("uses a safe fixed description when message is empty", () => {
    const r = humanizeActionError({ code: "MYSTERY", message: "" });
    expect(r.description).toMatch(/unexpected/i);
    expect(r.action).toBe("contact_support");
  });

  it("HANDLER_FAILED with a non-Slack message → contact_support, raw message NOT echoed", () => {
    const r = humanizeActionError({
      code: "HANDLER_FAILED",
      message: "Some other handler exploded.",
    });
    expect(r.title).toBe("Workflow step failed");
    expect(r.action).toBe("contact_support");
    expect(r.description).not.toContain("exploded");
  });
});

describe("humanizeActionError — CR-FAILREASON-1 provider-agnostic codes", () => {
  it("WORKFLOW_NOT_READY → open_node (fix setup), error", () => {
    const r = humanizeActionError({
      code: "WORKFLOW_NOT_READY",
      message: "Workflow not ready: step 'send' is missing required config.",
    });
    expect(r.action).toBe("open_node");
    expect(r.severity).toBe("error");
    expect(r.title).toMatch(/setup/i);
    // Code-derived copy — does not echo the raw readiness message.
    expect(r.description).not.toContain("send");
  });

  it("INTEGRATION_REAUTH_REQUIRED → reconnect, error, code-derived copy", () => {
    const r = humanizeActionError({
      code: "INTEGRATION_REAUTH_REQUIRED",
      message:
        "Integration action required: refresh_failed (account=acc_123, provider=gmail, provider-account=mailbox_999).",
    });
    expect(r.action).toBe("reconnect");
    expect(r.severity).toBe("error");
    // No account / provider-account ids from the underlying message.
    expect(r.description).not.toContain("acc_123");
    expect(r.description).not.toContain("mailbox_999");
    expect(r.hint).toMatch(/reconnect/i);
  });

  it("INTEGRATION_SCOPE_REQUIRED → reconnect, error", () => {
    const r = humanizeActionError({
      code: "INTEGRATION_SCOPE_REQUIRED",
      message: "Provider returned HTTP 403 (insufficient scope).",
    });
    expect(r.action).toBe("reconnect");
    expect(r.severity).toBe("error");
    expect(r.title).toMatch(/permission/i);
  });

  it("TRANSIENT_PROVIDER_ERROR → retry_later, warning", () => {
    const r = humanizeActionError({
      code: "TRANSIENT_PROVIDER_ERROR",
      message: "The operation was aborted due to timeout.",
    });
    expect(r.action).toBe("retry_later");
    expect(r.severity).toBe("warning");
  });

  // AI-PROVIDER-6 (CS-6) — the AI-credit meter is its own story: the plan
  // includes AI, the balance ran out. Distinct from BILLING_EXHAUSTED (task
  // quota) and PLAN_FEATURE_REQUIRED (feature not in the plan).
  it("AI_CREDITS_EXHAUSTED → upgrade_plan, warning, points at credits not config", () => {
    const r = humanizeActionError({
      code: "AI_CREDITS_EXHAUSTED",
      message: "Not enough AI credits for this step.",
    });
    expect(r.action).toBe("upgrade_plan");
    expect(r.severity).toBe("warning");
    expect(r.title.toLowerCase()).toMatch(/ai credits/);
    expect(r.hint?.toLowerCase()).toMatch(/upgrade|reset/);
    // Never blames the step's setup — the config is fine, the balance isn't.
    expect(`${r.title} ${r.description} ${r.hint}`.toLowerCase()).not.toMatch(
      /reconnect|fix (the )?(field|step|config)/,
    );
  });

  it("INTEGRATION_CHANGED → review_pending, warning, reassuring plain-language copy", () => {
    const r = humanizeActionError({
      code: "INTEGRATION_CHANGED",
      message: 'MCP tool "save_issue" on Linear changed shape (a field was removed or newly required) — refusing to call an uncertified schema.',
    });
    expect(r.action).toBe("review_pending");
    expect(r.severity).toBe("warning"); // a protection, not a hard error
    // Reassurance: workflow is safe, ChainReact is handling it, no user action.
    expect(r.description.toLowerCase()).toMatch(/safe/);
    expect(r.hint?.toLowerCase()).toMatch(/don'?t need to do anything|reviewing/);
    // No protocol jargon and NO raw drift text leaked from the message.
    expect(`${r.title} ${r.description} ${r.hint}`.toLowerCase()).not.toMatch(/mcp|schema|tools\/list|uncertified/);
    expect(r.description).not.toContain("save_issue");
  });
});

describe("humanizeActionError — no-leak (generic branch never echoes raw text)", () => {
  it.each([
    ["fake token", "Bearer sk-live-AbCd1234SECRETtoken"],
    ["fake email", "failed for user jane.doe@example.com"],
    ["fake provider account id", "team_T0ABCDEF99 rejected the call"],
    [
      "fake webhook/provider JSON body",
      '{"ok":false,"error":"invalid_payload","access_token":"xoxb-99-SECRET"}',
    ],
  ])("HANDLER_FAILED carrying a %s → safe generic description", (_label, raw) => {
    const r = humanizeActionError({ code: "HANDLER_FAILED", message: raw });
    expect(r.action).toBe("contact_support");
    expect(r.description).not.toContain(raw);
    expect(r.description).not.toMatch(/sk-live|xoxb|jane\.doe@example\.com|T0ABCDEF99/);
  });
});

/**
 * EXCEL-UPDATE-ROW-CONCURRENCY-4 — the document was in use.
 *
 * This copy has one job the neighbouring codes don't: it has to say that
 * NOTHING was written. A user whose spreadsheet step failed needs to know
 * whether their sheet was half-changed, and for this failure the answer is a
 * clean "no".
 */
describe("humanizeActionError — PROVIDER_CONFLICT", () => {
  const result = () =>
    humanizeActionError({
      code: "PROVIDER_CONFLICT",
      message:
        "Microsoft Graph workbook/.../range PATCH refused: the workbook is in use by another client (HTTP 409, accessConflict).",
    });

  it("states plainly that nothing was changed", () => {
    expect(result().description.toLowerCase()).toContain("nothing was changed");
  });

  it("names a fix the user can actually carry out", () => {
    expect(result().hint?.toLowerCase()).toMatch(/close the file|wait a moment/);
  });

  it("does not promise an automatic retry", () => {
    // Microsoft documents that a client must NOT resend until the conflict
    // clears, and ChainReact does not. Saying otherwise would be a lie the
    // user would then wait on.
    const r = result();
    const all = `${r.title} ${r.description} ${r.hint}`.toLowerCase();
    expect(all).not.toMatch(/we'?ll (try|retry)|automatically|will retry|retrying/);
  });

  it("uses no protocol vocabulary", () => {
    const r = result();
    const all = `${r.title} ${r.description} ${r.hint}`.toLowerCase();
    for (const jargon of [
      "etag",
      "409",
      "innererror",
      "accessconflict",
      "conflict",
      "http",
      "graph",
      "concurrency",
      "optimistic",
    ]) {
      expect(all).not.toContain(jargon);
    }
  });

  it("routes to the try-again-later guidance, not to reconnect or support", () => {
    // The connection is fine and the configuration is fine; the only useful
    // next step is to run it again once the file is free.
    expect(result().action).toBe("retry_later");
    expect(result().severity).toBe("error");
  });

  it("never echoes the raw thrown message", () => {
    const r = result();
    expect(r.description).not.toContain("accessConflict");
    expect(r.description).not.toContain("range PATCH");
  });
});
