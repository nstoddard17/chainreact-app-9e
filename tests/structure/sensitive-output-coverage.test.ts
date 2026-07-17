/**
 * Slice 3.POSTSEC-2 — structural sensitive-output coverage test.
 *
 * Scans every registered `ActionMeta.outputs[]` + `TriggerMeta.payloadShape[]`
 * across the discovery registry, and FAILS the build when an output name
 * matches a suspicious pattern (likely PII / secrets / message bodies /
 * access-bearing URLs / customer-payment objects) but does NOT carry
 * `sensitive: true`, unless the (key, output-name) pair is explicitly
 * allowlisted with a documented reason.
 *
 * Purpose: protect the POSTSEC-1 cleanup from drift. New providers can
 * declare new outputs freely; the structural test will fail if any new
 * `body` / `messages` / `customerEmail` / etc. lands unmarked.
 *
 * Catches:
 *   - A new gmail-style action that returns `messages` unmarked.
 *   - A new outlook trigger payload that adds `to`/`cc` recipient arrays.
 *   - A future stripe handler whose output regresses on
 *     `customer`/`paymentIntent`/`subscription` projections.
 *
 * Does NOT catch:
 *   - Fields named differently from the suspicious set (e.g. `recipients`
 *     instead of `to`). Naming conventions matter — `name: "recipients"`
 *     would bypass; either follow the convention or add to the suspicious
 *     set.
 *   - Nested fields without the `name` key on a parent that itself has
 *     `fields[]` (recursion handled).
 *
 * Companion to:
 *   - `tests/unit/contracts/actionMeta.test.ts` — schema-level invariants.
 *   - `tests/unit/services/discovery/_registry.test.ts` — per-action
 *     surface-anchored tests (these are exhaustive; this structural test
 *     catches future drift on patterns).
 */
import type { ActionMeta, OutputMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import {
  listAllActionMetas,
  listAllTriggerMetas,
} from "@/services/discovery/_registry";

// ─── Suspicious name patterns ───────────────────────────────────────────────
//
// Any output whose `name` (case-sensitive exact match) is in this set MUST
// carry `sensitive: true` OR appear in `ALLOWLIST` with a documented
// reason.
//
// Grouped by concern. Names are checked at every depth: top-level outputs
// AND nested `fields[]` are scanned.
const SUSPICIOUS_NAMES: ReadonlySet<string> = new Set([
  // Email content / body previews.
  "body",
  "htmlBody",
  "textBody",
  "snippet",
  "bodyPreview",
  // Recipient / sender addresses + raw emails.
  "to",
  "cc",
  "bcc",
  "from",
  "email",
  "personEmail",
  "customerEmail",
  "receiptEmail",
  // Provider secrets (must NEVER appear unredacted on workflow outputs).
  "clientSecret",
  "client_secret",
  "secret",
  "token",
  "apiKey",
  "accessToken",
  "refreshToken",
  "webhookSecret",
  // Access-bearing URLs (signed / customer-facing / file-download).
  "downloadUrl",
  "signedUrl",
  "providerUrl",
  "hostedInvoiceUrl",
  "invoicePdf",
  "receiptUrl",
  // Bulk content collections on read paths.
  "messages",
  "comments",
  "users",
  "payments",
  // Domain projections with PII fields (Stripe).
  "customer",
  "paymentIntent",
  "subscription",
  // Git artifacts that carry committer / author emails.
  "head_commit",
  "commits",
  "pusher",
  // Notion bulk results (database query + search hits) — per-row PII columns.
  "results",
  // Notion block / comment user-typed bodies.
  "plainText",
  "content",
  // Slack message bodies / payloads.
  "text",
  "message",
]);

// ─── Allowlist ──────────────────────────────────────────────────────────────
//
// `${actionOrTriggerKey}::${outputName}` → human reason.
//
// Add an entry here when (and ONLY when) the suspicious-name match is a
// false positive — typically an echo of caller-supplied input data the
// workflow author already knows, OR an intentionally-public URL.
//
// Every entry MUST have a reason. Reviewers reading the diff need to see
// WHY the suspicious-name guard was waived.
const ALLOWLIST: ReadonlyMap<string, string> = new Map([
  // ─── Gmail / Outlook email-send echoes ─────────────────────────────────
  // Send-shape actions echo the recipients the workflow author supplied
  // as input. The workflow already has these values; surfacing them again
  // in the run-detail API doesn't expose anything the workflow author
  // didn't already provide. Read-path equivalents (`fetch_emails.messages`,
  // `search_emails.messages`, trigger payloads) carry fresh provider-side
  // data and ARE marked sensitive.
  ["gmail:send_email::to", "Echo of caller-supplied recipients."],
  ["gmail:create_draft::to", "Echo of caller-supplied recipients."],
  [
    "microsoft-outlook:send_email::to",
    "Echo of caller-supplied recipients.",
  ],
  [
    "microsoft-outlook:send_email::cc",
    "Echo of caller-supplied recipients.",
  ],
  [
    "microsoft-outlook:send_email::bcc",
    "Echo of caller-supplied recipients.",
  ],
  [
    "microsoft-outlook:forward_email::to",
    "Echo of caller-supplied recipients.",
  ],
  [
    "microsoft-outlook:forward_email::cc",
    "Echo of caller-supplied recipients.",
  ],
  [
    "microsoft-outlook:create_draft_email::to",
    "Echo of caller-supplied recipients.",
  ],
  [
    "microsoft-outlook:create_draft_email::cc",
    "Echo of caller-supplied recipients.",
  ],
  [
    "microsoft-outlook:create_draft_email::bcc",
    "Echo of caller-supplied recipients.",
  ],

  // ─── GitHub: issue/PR/comment bodies are public on the surface they ──
  // post to (GitHub.com issue/PR comment threads). They're the workflow
  // author's intentional content; not PII-bearing in the same way email
  // bodies are. The echoed body in the run-detail surface mirrors what
  // GitHub itself renders publicly.
  [
    "github:create_issue::body",
    "Issue body — public on GitHub.com once posted; echoed from caller-supplied input.",
  ],
  [
    "github:create_pull_request::body",
    "PR body — public on GitHub.com once posted; echoed from caller-supplied input.",
  ],
  [
    "github:add_comment::body",
    "Comment body — public on GitHub.com once posted; echoed from caller-supplied input.",
  ],

  // ─── Stripe ────────────────────────────────────────────────────────────
  // `create_refund.paymentIntent` is the STRING payment-intent id echo
  // (not the object projection). Opaque Stripe ids are not PII on their
  // own. `find_payment_intent.paymentIntent` IS the projection object
  // and IS marked sensitive.
  [
    "stripe:create_refund::paymentIntent",
    "String id echo of caller-supplied input (not the object projection).",
  ],

  // ─── Slack channel-management echoes ──────────────────────────────────
  // `invite_users_to_channel.users` is the comma-separated CSV of caller-
  // supplied user ids that were submitted to Slack — a pure input echo.
  // User ids on their own are opaque Slack handles, not PII.
  [
    "slack:invite_users_to_channel::users",
    "CSV echo of caller-supplied user ids submitted to Slack.",
  ],

  // ─── Microsoft Teams ───────────────────────────────────────────────────
  // `list_channel_messages.messages` is deliberately HEADER-ONLY per the meta:
  // `{ id, createdDateTime, lastModifiedDateTime, importance, messageType,
  // fromUserId, webUrl }` — NO body, subject, attachments, or sender name. The
  // ids are opaque Graph ids and webUrl is an auth-gated Teams deep link, not
  // content/PII. The "messages" name trips the suspicious-name guard only.
  [
    "microsoft-teams:list_channel_messages::messages",
    "Header-only message metadata (opaque ids + timestamps + webUrl); no body/subject/sender-name/PII.",
  ],
  // MOTIVE-1 — the bulk-import result `message` is a sanitized provider STATUS
  // string (surfaceMotiveError / status), never user content or PII. The
  // "message" name trips the suspicious-name guard only.
  [
    "motive:import_fuel_purchases_csv::message",
    "Sanitized import status string; no user content or PII.",
  ],
]);

// ─── Walker ─────────────────────────────────────────────────────────────────
//
// Recursively scans an OutputMeta tree. Returns the list of violations:
// `${key}::${dottedPath}` for each suspicious-named, non-sensitive,
// non-allowlisted output (including nested fields).
function findViolations(
  key: string,
  outputs: readonly OutputMeta[] | undefined,
  pathPrefix: string,
): string[] {
  if (!outputs || outputs.length === 0) return [];
  const violations: string[] = [];
  for (const output of outputs) {
    const fullPath = pathPrefix ? `${pathPrefix}.${output.name}` : output.name;
    if (SUSPICIOUS_NAMES.has(output.name) && output.sensitive !== true) {
      const allowlistKey = `${key}::${fullPath}`;
      if (!ALLOWLIST.has(allowlistKey)) {
        violations.push(allowlistKey);
      }
    }
    if (output.fields && output.fields.length > 0) {
      violations.push(...findViolations(key, output.fields, fullPath));
    }
  }
  return violations;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("sensitive-output coverage (Slice 3.POSTSEC-2)", () => {
  it("every action meta output with a suspicious name is sensitive OR allowlisted", () => {
    const violations: string[] = [];
    for (const meta of listAllActionMetas() as ReadonlyArray<ActionMeta>) {
      violations.push(...findViolations(meta.key, meta.outputs, ""));
    }
    // Failure message lists every offender so a reviewer can see exactly
    // which (action, output) pair needs `sensitive: true` or an allowlist
    // entry.
    expect(violations).toEqual([]);
  });

  it("every trigger meta payload field with a suspicious name is sensitive OR allowlisted", () => {
    const violations: string[] = [];
    for (const meta of listAllTriggerMetas() as ReadonlyArray<TriggerMeta>) {
      violations.push(
        ...findViolations(
          meta.key,
          meta.payloadShape as readonly OutputMeta[],
          "",
        ),
      );
    }
    expect(violations).toEqual([]);
  });

  it("no `clientSecret` / `client_secret` / `secret` / `token` output exists on ANY meta (defense in depth — these names MUST never appear, sensitive or not)", () => {
    // Stripe's SEC-8 removed `clientSecret` from PaymentIntent outputs.
    // This is the cross-provider regression guard — no provider may
    // reintroduce a secret-named output, even if marked sensitive.
    const SECRET_NAMES = new Set([
      "clientSecret",
      "client_secret",
      "secret",
      "token",
      "apiKey",
      "accessToken",
      "refreshToken",
      "webhookSecret",
    ]);
    const offenders: string[] = [];
    function walk(
      key: string,
      outputs: readonly OutputMeta[] | undefined,
      prefix: string,
    ): void {
      if (!outputs) return;
      for (const o of outputs) {
        const path = prefix ? `${prefix}.${o.name}` : o.name;
        if (SECRET_NAMES.has(o.name)) {
          offenders.push(`${key}::${path}`);
        }
        if (o.fields) walk(key, o.fields, path);
      }
    }
    for (const meta of listAllActionMetas()) {
      walk(meta.key, meta.outputs, "");
    }
    for (const meta of listAllTriggerMetas()) {
      walk(meta.key, meta.payloadShape as readonly OutputMeta[], "");
    }
    expect(offenders).toEqual([]);
  });

  it("allowlist has no orphan entries (every allowlist key maps to an existing meta + output that still matches a suspicious name)", () => {
    // Catches drift in the OPPOSITE direction: an output was renamed or
    // removed, but the allowlist still excuses it. Forces allowlist
    // maintenance whenever the underlying meta changes.
    const allMetaKeys = new Set<string>();
    function collect(key: string, outputs: readonly OutputMeta[] | undefined, prefix: string): void {
      if (!outputs) return;
      for (const o of outputs) {
        const path = prefix ? `${prefix}.${o.name}` : o.name;
        if (SUSPICIOUS_NAMES.has(o.name)) {
          allMetaKeys.add(`${key}::${path}`);
        }
        if (o.fields) collect(key, o.fields, path);
      }
    }
    for (const meta of listAllActionMetas()) {
      collect(meta.key, meta.outputs, "");
    }
    for (const meta of listAllTriggerMetas()) {
      collect(meta.key, meta.payloadShape as readonly OutputMeta[], "");
    }
    const orphans: string[] = [];
    for (const allowed of ALLOWLIST.keys()) {
      if (!allMetaKeys.has(allowed)) orphans.push(allowed);
    }
    expect(orphans).toEqual([]);
  });
});
