/** @jest-environment node */
/**
 * STRUCTURE-TEST-CONSOLIDATION-1 — registry-backed structural contracts in
 * ONE suite process, so the discovery/handlers/manifest registries are
 * imported and Zod-validated once instead of nine times (~2.5s of module
 * graph per process). Every describe below is a formerly standalone suite
 * preserved verbatim. The externally name-pinned registry suites stay
 * standalone: discovery-meta-coverage + api-route-authorization (MCP
 * tooling), option-source-reference-integrity (provider skill),
 * official-template-node-registration (migrations + skill).
 */
import { ActionMeta, FieldMeta, FieldSensitivity, OutputMeta } from "@/contracts/actionMeta";
import { ProviderManifestSchema, type ProviderManifest } from "@/contracts/integration";
import { TriggerMeta } from "@/contracts/triggerMeta";
import { WorkflowDefinition } from "@/contracts/workflowDefinition";
import { isRecipientOrDestinationKey } from "@/core/security/recipientKeys";
import { isSecretLikeKey } from "@/core/security/secretKeys";
import { PROVIDERS, getProvider, listProviders, providerSupports } from "@/integrations/_registry";
import { googleCalendarManifest } from "@/integrations/google-calendar/manifest";
import { buildEditableWorkflowGraph } from "@/services/ai-guidance/editableGraph/buildEditableWorkflowGraph";
import { sanitizeConfigAgainstFields } from "@/services/ai-guidance/planConfig/sanitizeProposedConfig";
import { MAX_FIELD_SCHEMA_NODES, buildFieldSchemaLines, renderFieldSchemaFragment } from "@/services/ai-guidance/promptFieldSchemas";
import { getNodeSchema, getProviderCatalog } from "@/services/ai/tools/providerCatalog";
import { getActionMeta, getTriggerMeta, listActionMetasForProvider, listAllActionMetas, listAllTriggerMetas, listProvidersWithMetadata, listTriggerMetasForProvider } from "@/services/discovery/_registry";
import { getActionHandler, listRegisteredHandlers } from "@/services/execution/handlers/_registry";
import { listOptionsResolvers } from "@/services/options/_registry";
import { findActivation } from "@/services/triggers/activationRegistry";
import { isConnectionIdentityKey } from "@/services/workflows/patch/applySafety";

describe("ai-catalog-consistency", () => {
  const result = getProviderCatalog();
  if (!result.ok) {
    throw new Error("getProviderCatalog() failed to build — catalog is unusable.");
  }
  const catalog = result.data;

  /** A well-formed `provider:type` key has exactly one colon, prefixed by the provider id. */
  function expectWellFormedKey(key: string, providerId: string): void {
    expect((key.match(/:/g) ?? []).length).toBe(1); // never `provider:provider:type`
    expect(key.startsWith(`${providerId}:`)).toBe(true);
    expect(key.slice(providerId.length + 1).length).toBeGreaterThan(0);
  }

  describe("AI planner catalog consistency", () => {
    it("builds successfully and is non-empty", () => {
      expect(catalog.providers.length).toBeGreaterThan(0);
    });

    it("every catalog ACTION key resolves in the validated registry and is well-formed", () => {
      for (const p of catalog.providers) {
        for (const a of p.actions) {
          expectWellFormedKey(a.key, p.id);
          // The SAME lookup checks.ts uses — proves catalog ⊆ validated registry.
          expect(getActionMeta(a.key)).toBeTruthy();
        }
      }
    });

    it("every catalog TRIGGER key resolves in the validated registry and is well-formed", () => {
      for (const p of catalog.providers) {
        for (const t of p.triggers) {
          expectWellFormedKey(t.key, p.id);
          expect(getTriggerMeta(t.key)).toBeTruthy();
        }
      }
    });

    it("no catalog key is double-qualified (e.g. gmail:gmail:new_email)", () => {
      const keys = catalog.providers.flatMap((p) => [
        ...p.actions.map((a) => a.key),
        ...p.triggers.map((t) => t.key),
      ]);
      for (const key of keys) {
        const provider = key.split(":")[0]!;
        expect(key.startsWith(`${provider}:${provider}:`)).toBe(false);
      }
    });

    it("exposes the supported Gmail new-email trigger (the live-failure node is in the catalog)", () => {
      const gmail = catalog.providers.find((p) => p.id === "gmail");
      expect(gmail).toBeDefined();
      expect(gmail!.triggers.some((t) => t.key === "gmail:new_email")).toBe(true);
      expect(getTriggerMeta("gmail:new_email")).toBeTruthy();
    });
  });
});

describe("config-copy-guard", () => {
  /**
   * CONFIG-UX-AUDIT-1 — builder config copy guard.
   *
   * Product rule: workflow authors configure steps VISUALLY. The app may
   * serialize config to JSON internally, but a normal user must never be
   * asked to hand-author JSON, and internal implementation language must
   * never leak into the setup panel.
   *
   * This guard scans EVERY builder-visible action + trigger field
   * (discovery registry = exactly what the builder renders) and enforces:
   *
   *   1. Field LABELS never contain "JSON" (any casing) — labels are pure
   *      product language, no exceptions.
   *   2. Field descriptions/placeholders of NORMAL (non-advanced) fields
   *      never contain JSON-authoring phrases ("paste JSON", "raw JSON",
   *      "JSON array", "JSON object", "JSON-encoded", "as JSON", …).
   *      Fields marked `advanced: true` render inside the collapsed
   *      Advanced disclosure and MAY mention JSON — they are the explicit
   *      developer escape hatch.
   *   3. `multiple: true` appears only on select/combobox (contract-
   *      enforced) AND those fields have options or an optionsSource, so
   *      the multi-select renderer never hits its drift fallback.
   *   4. select/combobox fields always declare options XOR optionsSource
   *      (renderer never shows the "choices aren't available" fallback for
   *      a well-formed meta).
   *
   * Allowlist: `native:http_request` is a developer-facing action by
   * design (raw HTTP body/headers); its field copy may reference JSON
   * without the advanced flag.
   */

  /** Actions whose ENTIRE audience is developers; JSON copy allowed. */
  const DEVELOPER_ACTION_ALLOWLIST = new Set(["native:http_request"]);

  const BANNED_NORMAL_COPY = [
    /paste\s+(a\s+)?json/i,
    /raw\s+json/i,
    /json\s+array/i,
    /json\s+object/i,
    /json[- ]encoded/i,
    /as\s+json/i,
    /json\s+literal/i,
  ];

  interface FieldRef {
    metaKey: string;
    field: FieldMeta;
  }

  function collectAllFields(): FieldRef[] {
    const out: FieldRef[] = [];
    for (const meta of listAllActionMetas()) {
      for (const field of meta.fields) out.push({ metaKey: meta.key, field });
    }
    for (const meta of listAllTriggerMetas()) {
      for (const field of meta.fields) out.push({ metaKey: meta.key, field });
    }
    return out;
  }

  describe("builder config copy guard (CONFIG-UX-AUDIT-1)", () => {
    const all = collectAllFields();

    it("sanity: the registry exposes a non-trivial field surface", () => {
      expect(all.length).toBeGreaterThan(300);
    });

    it("no field LABEL contains 'JSON' — labels are product language, no exceptions", () => {
      const offenders = all
        .filter(({ field }) => /json/i.test(field.label))
        .map(({ metaKey, field }) => `${metaKey}.${field.name}: "${field.label}"`);
      expect(offenders).toEqual([]);
    });

    it("NORMAL (non-advanced) field descriptions/placeholders never ask the user for JSON", () => {
      const offenders: string[] = [];
      for (const { metaKey, field } of all) {
        if (field.advanced === true) continue;
        if (DEVELOPER_ACTION_ALLOWLIST.has(metaKey)) continue;
        const surfaces = [field.description ?? "", field.placeholder ?? ""];
        for (const text of surfaces) {
          for (const banned of BANNED_NORMAL_COPY) {
            if (banned.test(text)) {
              offenders.push(
                `${metaKey}.${field.name} matches ${String(banned)}: "${text.slice(0, 120)}"`,
              );
            }
          }
        }
      }
      expect(offenders).toEqual([]);
    });

    it("advanced JSON escape hatches declare an explicit shape (CONFIG-UX-AUDIT-2 → CONFIG-UX-SETUP-ADVANCED-1)", () => {
      // CONFIG-UX-SETUP-ADVANCED-1 deliberately widened `advanced: true`
      // from "JSON escape hatch only" to "any power-user control that
      // belongs in the Advanced tab" (pagination cursors, tuning knobs,
      // developer toggles). The invariant that REMAINS: every `json`-typed
      // field must declare an explicit array/object shape so the renderer +
      // Save gate validate against the real runtime contract ("any" is a
      // documented escape valve with no consumer — not allowed in metas).
      const jsonFields = all.filter(({ field }) => field.type === "json");
      expect(jsonFields.length).toBeGreaterThan(0);
      for (const { field } of jsonFields) {
        expect(["array", "object"]).toContain(field.jsonShape);
      }
    });

    it("`json` fields never exist OUTSIDE the advanced disclosure (raw JSON is escape-hatch-only)", () => {
      // Contract superRefine enforces this at meta load; pinned here too
      // so the product rule reads in one place with the copy rules.
      const offenders = all
        .filter(({ field }) => field.type === "json" && field.advanced !== true)
        .map(({ metaKey, field }) => `${metaKey}.${field.name}`);
      expect(offenders).toEqual([]);
    });

    it("multiple: true fields always carry options or an optionsSource (multi-select never hits the drift fallback)", () => {
      const offenders = all
        .filter(({ field }) => field.multiple === true)
        .filter(
          ({ field }) =>
            !(field.options && field.options.length > 0) && !field.optionsSource,
        )
        .map(({ metaKey, field }) => `${metaKey}.${field.name}`);
      expect(offenders).toEqual([]);
    });

    it("select/combobox fields declare options XOR optionsSource (single-select never renders the 'choices unavailable' fallback)", () => {
      const offenders: string[] = [];
      for (const { metaKey, field } of all) {
        if (field.type !== "select" && field.type !== "combobox") continue;
        const hasStatic = Boolean(field.options && field.options.length > 0);
        const hasSource = Boolean(field.optionsSource);
        if (hasStatic === hasSource) {
          offenders.push(
            `${metaKey}.${field.name} (options: ${hasStatic}, optionsSource: ${hasSource})`,
          );
        }
      }
      expect(offenders).toEqual([]);
    });

    it("internal renderer-mismatch strings never appear in any builder-visible copy", () => {
      const INTERNAL_STRINGS = [
        /not supported by this renderer/i,
        /not yet implemented/i,
        /field-renderer registry/i,
      ];
      const offenders: string[] = [];
      for (const { metaKey, field } of all) {
        const surfaces = [field.label, field.description ?? "", field.placeholder ?? ""];
        for (const text of surfaces) {
          for (const banned of INTERNAL_STRINGS) {
            if (banned.test(text)) {
              offenders.push(`${metaKey}.${field.name}: "${text.slice(0, 80)}"`);
            }
          }
        }
      }
      expect(offenders).toEqual([]);
    });
  });
});

describe("field-sensitivity-coverage", () => {
  /**
   * Heuristic false positives — fields whose KEY NAME a heuristic flags but which are
   * genuinely NOT sensitive. Keyed by `provider:type` → field names. Each is still
   * heuristic-blocked at the apply gate (exemption is guard-only); we just don't assert a
   * metadata category for it (mislabeling would be inventing metadata).
   */
  const HEURISTIC_FALSE_POSITIVES: Record<string, readonly string[]> = {
    // AI-PROVIDER-6 — `destination*` on `ai:transform_data` matches the
    // recipient/destination heuristic on the word "destination", but nothing is
    // SENT anywhere: this action returns transformed data into the workflow, and
    // these three fields choose the SHAPE of that data (which step's fields to
    // match, or the author's own field list). Labeling them `recipient` would
    // claim a delivery target that does not exist. Still heuristic-blocked at the
    // apply gate, which is the behavior we want — an AI repair should not silently
    // re-point a transform at a different destination.
    "ai:transform_data": ["destinationMode", "destinationAction", "destinationSchema"],
    // `emailId` — the RECORD ID of the email being acted on (not a recipient; the "email"
    // token is incidental). These actions target an existing message; they don't send.
    "microsoft-outlook:add_categories": ["emailId"],
    "microsoft-outlook:delete_email": ["emailId"],
    "microsoft-outlook:forward_email": ["emailId"],
    "microsoft-outlook:get_attachment": ["emailId"],
    "microsoft-outlook:move_email": ["emailId"],
    "microsoft-outlook:reply_to_email": ["emailId"],
    // `pageToken` — a pagination cursor; matches the `token` secret substring but holds no
    // credential material.
    "gmail:search_emails": ["pageToken"],
    "google-calendar:list_events": ["pageToken"],
    "google-drive:list_files": ["pageToken"],
    "google-drive:search_files": ["pageToken"],
    // `responseToken` — Typeform's RESPONSE ID (the trigger's dedup token, mapped from
    // `{{trigger.responseToken}}`); matches the `token` secret substring but holds no
    // credential material (TYPEFORM-2).
    "typeform:get_response": ["responseToken"],
    // `address` — an Excel A1 cell range ("A1:C10"), not an email/destination address. The
    // "address" token incidentally matches the recipient heuristic.
    "microsoft-excel:read_range": ["address"],
    // `channelId` on a READ — which Teams channel to READ messages from (a resolver-backed
    // selector / read filter, like `mailchimp:link_clicked.url`), not a send destination.
    // Still heuristic-blocked at the apply gate.
    "microsoft-teams:list_channel_messages": ["channelId"],
    // Enum / boolean / number whose name incidentally contains a recipient token — not a
    // destination. (Field type confirms: select / boolean / number.)
    "microsoft-outlook-calendar:add_attendees": ["attendeeType"], // select: required/optional attendee
    "native:format_transformer": ["targetFormat"], // select: output format
    "shopify:create_customer": ["send_welcome_email"], // boolean toggle
    "mailchimp:create_audience": ["email_type_option"], // boolean toggle
    "stripe:capture_payment_intent": ["amount_to_capture"], // number (the "to" token matches)
    // URL that is CONTENT / DATA, not a send destination.
    "facebook:comment_on_post": ["attachmentUrl"], // media to attach
    "shopify:create_fulfillment": ["tracking_url"], // shipment tracking link (data, not a destination)
    "mailchimp:link_clicked": ["url"], // trigger filter: which clicked link to match
    "eden:read_content": ["url"], // the public post URL to READ (fetch source), not a send destination
    "microsoft-onenote:update_page": ["target"], // CSS selector / data-id (insert target in HTML), not a destination
    // QUICKBOOKS-1 — stored contact/billing details on the customer RECORD, not send
    // destinations: V2 never sends anything to the phone or postal address (the only
    // outward-facing QuickBooks surface is send_invoice, which emails BillEmail — and
    // THAT field, plus create_customer.email / create_invoice.customerEmail /
    // send_invoice.sendTo, IS annotated `recipient`). Mislabeling stored record data
    // as a destination would be inventing metadata.
    "quickbooks:create_customer": ["phone", "addressLine1", "addressLine2"],
    // MOTIVE-1 — `phone` is stored contact data on the driver RECORD, not a send
    // destination: V2 never messages the phone (the only outward Motive surface is
    // send_message, which targets a driverId, not a phone). Mislabeling stored
    // record data as a destination would be inventing metadata. Still
    // heuristic-blocked at the apply gate.
    "motive:update_driver": ["phone"],
    // `dateTo` — an invoice-date range bound; the "to" token matches incidentally.
    "quickbooks:list_invoices": ["dateTo"],
    // TEST-SUITE-GREEN-1 — Linear ISSUE RELATIONS. `relatedTo` / `removeRelatedTo`
    // list the issues to link to (or unlink from) the issue being saved; the
    // tokenizer splits them to `related`/`remove`+`related` + "to", and "to" is a
    // recipient word, so the match is purely incidental (same shape as
    // `quickbooks:list_invoices.dateTo`). Nothing is SENT to these values — they
    // are issue references stored on a record inside the user's own workspace, so
    // annotating them `recipient` would claim a delivery target that does not
    // exist. Still heuristic-blocked at the apply gate, which is the behavior we
    // want: an AI repair should not silently re-point issue relations.
    "linear:create_issue": ["relatedTo"],
    "linear:update_issue": ["relatedTo", "removeRelatedTo"],
    // POWER BI — resolver-backed resource selectors whose `target` token matches the
    // recipient heuristic. Both name WHICH Power BI resource the clone is created in /
    // bound to (a workspace container and a semantic model), not a party a message is
    // sent to — the same shape as `microsoft-onenote:update_page.target`. Still
    // heuristic-blocked at the apply gate.
    "microsoft-powerbi:clone_report": ["targetWorkspaceId", "targetSemanticModelId"],
    // `url` — the CONNECTION DETAIL of the data source the on-premises gateway itself
    // connects to (OData/SharePoint/Web/File path), not a destination V2 sends anything
    // to; mirrors `mailchimp:link_clicked.url`. `credentialType` — a select enum naming
    // the auth METHOD (Basic/Windows/Key); it matches the `credential` secret substring
    // but holds no credential material (the actual material lives in the `username` /
    // `password` fields, which ARE annotated `secret`).
    "microsoft-powerbi:create_gateway_datasource": ["url", "credentialType"],
    "microsoft-powerbi:update_gateway_datasource_credentials": ["credentialType"],
  };

  /** Every sensitivity category the apply-safety heuristics would assign to this key. */
  function heuristicCategories(key: string): ReadonlySet<FieldSensitivity> {
    const out = new Set<FieldSensitivity>();
    if (isSecretLikeKey(key)) out.add("secret");
    if (isConnectionIdentityKey(key)) out.add("connection");
    if (isRecipientOrDestinationKey(key)) out.add("recipient");
    return out;
  }

  function isExempt(metaKey: string, field: string): boolean {
    return HEURISTIC_FALSE_POSITIVES[metaKey]?.includes(field) ?? false;
  }

  interface Offender {
    readonly metaKey: string;
    readonly field: string;
    readonly reason: string;
  }

  function collectOffenders(): Offender[] {
    const offenders: Offender[] = [];
    for (const meta of [...listAllActionMetas(), ...listAllTriggerMetas()]) {
      for (const field of meta.fields) {
        const matched = heuristicCategories(field.name);
        if (matched.size === 0) continue;
        const declared = field.sensitivity;
        if (isExempt(meta.key, field.name)) {
          // An exempted field must NOT also be annotated — if it is, the exemption is
          // redundant and should be removed (keeps the list honest).
          if (declared !== undefined) {
            offenders.push({
              metaKey: meta.key,
              field: field.name,
              reason: `exempted as a false positive but also declares sensitivity "${declared}" — remove the exemption`,
            });
          }
          continue;
        }
        if (declared === undefined) {
          offenders.push({
            metaKey: meta.key,
            field: field.name,
            reason: `missing \`sensitivity\` (key matches: ${[...matched].join(", ")}) — annotate it, or add a documented exemption`,
          });
        } else if (!matched.has(declared)) {
          offenders.push({
            metaKey: meta.key,
            field: field.name,
            reason: `declares "${declared}" but key matches: ${[...matched].join(", ")}`,
          });
        }
      }
    }
    return offenders;
  }

  describe("guardrail — every heuristic-sensitive config field is annotated or exempted (CS-3 full sweep)", () => {
    it("the full registry has no unannotated, unexempted heuristic-sensitive field", () => {
      const offenders = collectOffenders();
      if (offenders.length > 0) {
        const lines = offenders.map((o) => `  • ${o.metaKey} field "${o.field}" — ${o.reason}`).join("\n");
        throw new Error(
          `${offenders.length} heuristic-sensitive config field(s) need attention:\n` +
            lines +
            "\n\nApply-safety is SCHEMA-DRIVEN. Either declare the field's `sensitivity`\n" +
            "('secret' | 'connection' | 'recipient'), or — if the key-name match is a false\n" +
            "positive — add it to HEURISTIC_FALSE_POSITIVES with a reason. Do NOT mislabel a\n" +
            "non-sensitive field. See docs/slices/phase-4/ai/ai-repair-safety-hardening-plan.md.",
        );
      }
      expect(offenders).toEqual([]);
    });

    it("every HEURISTIC_FALSE_POSITIVES entry is live (real field + still heuristic-matched)", () => {
      const byKey = new Map(
        [...listAllActionMetas(), ...listAllTriggerMetas()].map((m) => [m.key, m]),
      );
      const stale: string[] = [];
      for (const [metaKey, fields] of Object.entries(HEURISTIC_FALSE_POSITIVES)) {
        const meta = byKey.get(metaKey);
        for (const field of fields) {
          const f = meta?.fields.find((x) => x.name === field);
          if (!f) {
            stale.push(`${metaKey} "${field}" — no such config field (renamed/removed)`);
          } else if (heuristicCategories(f.name).size === 0) {
            stale.push(`${metaKey} "${field}" — no longer heuristic-matched (exemption obsolete)`);
          }
        }
      }
      expect(stale).toEqual([]);
    });

    it("the registry contains heuristic-sensitive fields (guard is non-vacuous)", () => {
      const total = [...listAllActionMetas(), ...listAllTriggerMetas()]
        .flatMap((m) => m.fields)
        .filter((f) => heuristicCategories(f.name).size > 0).length;
      expect(total).toBeGreaterThan(100);
    });
  });
});

describe("sensitive-output-coverage", () => {
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

    // ─── Linear ────────────────────────────────────────────────────────────
    // TEST-SUITE-GREEN-1. `add_comment` is a WRITE path: its `body` output is the
    // Markdown the workflow author supplied as the node's own `body` input,
    // echoed back by save_comment. The workflow already holds that string, so
    // surfacing it in run detail exposes nothing new — the same input-echo
    // rationale as the Gmail/Outlook send echoes above. Deliberately NOT claiming
    // GitHub's "public once posted" reason: a Linear comment lives in a private
    // workspace. Linear has no READ comment action; if one is ever added, its
    // `body` carries fresh provider-side content and MUST be marked sensitive
    // rather than added here.
    [
      "linear:add_comment::body",
      "Echo of the caller-supplied comment body on a write path (not fresh provider-side content).",
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
    it("the scan is non-trivial: the registry serves a real catalog with real outputs", () => {
      // Non-vacuity floor (STRUCTURE-TEST-CONSOLIDATION-1): every rule below
      // iterates the registry and passes trivially over an empty/partial load.
      // Siblings pin similar floors (config-copy-guard >300 fields); without
      // one here, a registry that failed to materialize metas would green the
      // entire no-leak surface.
      const actions = listAllActionMetas();
      const triggers = listAllTriggerMetas();
      expect(actions.length).toBeGreaterThan(300);
      expect(triggers.length).toBeGreaterThan(50);
      const outputsSeen = actions.filter((m) => (m.outputs?.length ?? 0) > 0).length;
      expect(outputsSeen).toBeGreaterThan(200);
    });

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
});

describe("react-agent-field-coverage", () => {
  /**
   * REACT-CONFIG-COVERAGE-1 — measurable parity between builder-configurable persisted fields and
   * React/Hermes-discoverable, patch-settable fields.
   *
   * The canonical source is the discovery registry (`ActionMeta` / `TriggerMeta` — the SAME metadata
   * that drives the builder config panel, readiness, and patch validation). This suite fails when any
   * AI-path surface diverges from it:
   *
   *   1. `getNodeSchema` (AI drill-down) must expose every declared field with identical
   *      name/type/required, plus every optionsSource dependency.
   *   2. `getProviderCatalog` (compact catalog) must list every field with matching type/required.
   *   3. The prompt field-schema renderer must render every declared field of every node it covers
   *      (no per-provider node-count overflow past the bound — no silent truncation).
   *   4. The editable-graph builder (edit path) must surface exactly the declared fields minus
   *      `secret`/`connection` sensitivity.
   *   5. The proposed-config sanitizer must accept OR defer (targeted input) a representative value
   *      for every declared non-secret field — never silently drop a declared field.
   *
   * It also prints the field-coverage inventory counts (total / required / optional / resolver-backed
   * / advanced) used in the slice doc.
   */

  interface NodeMeta {
    readonly key: string;
    readonly kind: "trigger" | "action";
    readonly provider: string;
    readonly type: string;
    readonly fields: readonly FieldMeta[];
  }

  const ALL_NODES: NodeMeta[] = [
    ...listAllTriggerMetas().map((m) => ({
      key: m.key,
      kind: "trigger" as const,
      provider: m.provider,
      type: m.type,
      fields: m.fields,
    })),
    ...listAllActionMetas().map((m) => ({
      key: m.key,
      kind: "action" as const,
      provider: m.provider,
      type: m.type,
      fields: m.fields,
    })),
  ];

  /** A representative value for a field, by declared type. Deferred-by-design types get a string. */
  function representativeValue(f: FieldMeta): unknown {
    const itemValue = (sub: { name: string; type: string; options?: readonly { value: string }[] }): unknown =>
      sub.type === "number" ? 7 : sub.type === "boolean" ? false : sub.options?.[0]?.value ?? "sample";
    switch (f.type) {
      case "number":
        return 7;
      case "boolean":
        return false;
      case "string-array":
        return ["sample"];
      case "select":
      case "combobox": {
        const v = f.options?.[0]?.value ?? "sample";
        return f.multiple === true ? [v] : v;
      }
      case "keyvalue":
        return { k: "v" };
      case "object": {
        const out: Record<string, unknown> = {};
        for (const sub of f.itemFields ?? []) out[sub.name] = itemValue(sub);
        return out;
      }
      case "object-list": {
        const out: Record<string, unknown> = {};
        for (const sub of f.itemFields ?? []) out[sub.name] = itemValue(sub);
        return [out];
      }
      case "keyvalue-list":
        return [{ key: "k", value: "v" }];
      case "json":
        return {};
      default:
        return "sample";
    }
  }

  describe("React agent field coverage — canonical metadata parity", () => {
    it("has a non-trivial registry to audit", () => {
      expect(ALL_NODES.length).toBeGreaterThan(300);
    });

    it("getNodeSchema exposes every declared field with identical name/type/required + optionsSource deps", () => {
      for (const node of ALL_NODES) {
        const schema = getNodeSchema(node.key);
        expect(schema.ok).toBe(true);
        if (!schema.ok) continue;
        const byName = new Map(schema.data.fields.map((f) => [f.name, f]));
        for (const field of node.fields) {
          const exposed = byName.get(field.name);
          expect(exposed).toBeDefined();
          expect(exposed!.type).toBe(field.type);
          expect(exposed!.required).toBe(field.required);
          if (field.optionsSource) {
            const dep = schema.data.optionsSourceDeps.find((d) => d.field === field.name);
            expect(dep?.optionsSource).toBe(field.optionsSource);
          }
        }
        const required = node.fields.filter((f) => f.required).map((f) => f.name);
        expect([...schema.data.requiredFieldNames].sort()).toEqual(required.sort());
      }
    });

    it("getProviderCatalog lists every declared field with matching type/required/multiple", () => {
      const catalog = getProviderCatalog();
      expect(catalog.ok).toBe(true);
      if (!catalog.ok) return;
      const entryByKey = new Map<string, { name: string; type: string; required: boolean; multiple?: boolean }[]>();
      for (const provider of catalog.data.providers) {
        for (const a of provider.actions) entryByKey.set(a.key, [...a.configFields]);
        for (const t of provider.triggers) entryByKey.set(t.key, [...t.configFields]);
      }
      for (const node of ALL_NODES) {
        const configFields = entryByKey.get(node.key);
        expect(configFields).toBeDefined();
        const byName = new Map(configFields!.map((f) => [f.name, f]));
        for (const field of node.fields) {
          const cf = byName.get(field.name);
          expect(cf).toBeDefined();
          expect(cf!.type).toBe(field.type);
          expect(cf!.required).toBe(field.required);
          expect(cf!.multiple === true).toBe(field.multiple === true);
        }
      }
    });

    it("the prompt field-schema renderer covers every declared field, with no per-provider truncation", () => {
      for (const providerId of listProvidersWithMetadata()) {
        const nodeCount =
          listTriggerMetasForProvider(providerId).length + listActionMetasForProvider(providerId).length;
        // No silent caps: a single provider must fit the bound, or this fails loudly.
        expect(nodeCount).toBeLessThanOrEqual(MAX_FIELD_SCHEMA_NODES);
        const lines = buildFieldSchemaLines([providerId]);
        expect(lines).toHaveLength(nodeCount);
        const joined = lines.join("\n");
        for (const meta of [...listTriggerMetasForProvider(providerId), ...listActionMetasForProvider(providerId)]) {
          expect(joined).toContain(meta.key);
          for (const field of meta.fields) {
            const fragment = renderFieldSchemaFragment(field);
            expect(fragment).toContain(field.name);
            expect(fragment).toContain(field.required ? "required" : "optional");
            if (field.advanced === true) expect(fragment).toContain("advanced");
            if (field.optionsSource) expect(fragment).toContain("dynamic options");
            expect(joined).toContain(fragment);
          }
        }
      }
    });

    it("the editable graph (edit path) surfaces exactly the declared fields minus secret/connection", () => {
      for (const node of ALL_NODES) {
        const def: WorkflowDefinition = {
          nodes: [
            {
              id: "n-1",
              kind: node.kind,
              provider: node.provider,
              type: node.type,
              config: {},
              position: { x: 0, y: 0 },
            },
          ],
          edges: [],
        };
        const { graph } = buildEditableWorkflowGraph(def);
        const exposed = new Set(graph.nodes[0]!.config.map((f) => f.key));
        for (const field of node.fields) {
          const shouldExpose = field.sensitivity !== "secret" && field.sensitivity !== "connection";
          expect(exposed.has(field.name)).toBe(shouldExpose);
        }
      }
    });

    it("every declared non-secret field is patch-settable: a representative value is kept or deferred, never silently dropped", () => {
      for (const node of ALL_NODES) {
        for (const field of node.fields) {
          const result = sanitizeConfigAgainstFields({ [field.name]: representativeValue(field) }, node.fields);
          if (field.sensitivity === "secret" || field.sensitivity === "connection") {
            expect(result.droppedFields).toEqual([field.name]);
            continue;
          }
          const kept = field.name in result.config;
          const deferred = result.deferredFields.includes(field.name);
          if (!kept && !deferred) {
            throw new Error(`Field '${node.key}.${field.name}' (${field.type}) was silently dropped`);
          }
          expect(result.droppedFields).toHaveLength(0);
        }
      }
    });

    it("prints the field-coverage inventory", () => {
      let total = 0;
      let required = 0;
      let optional = 0;
      let resolverBacked = 0;
      let advanced = 0;
      let secretOrConnection = 0;
      for (const node of ALL_NODES) {
        for (const f of node.fields) {
          total += 1;
          if (f.required) required += 1;
          else optional += 1;
          if (f.optionsSource) resolverBacked += 1;
          if (f.advanced === true) advanced += 1;
          if (f.sensitivity === "secret" || f.sensitivity === "connection") secretOrConnection += 1;
        }
      }
      console.log(
        `[react-agent-field-coverage] nodes=${ALL_NODES.length} fields=${total} required=${required} optional=${optional} resolverBacked=${resolverBacked} advanced=${advanced} secretOrConnection=${secretOrConnection}`,
      );
      expect(total).toBeGreaterThan(0);
    });
  });
});

describe("trigger-meta-activation-invariant", () => {
  /**
   * Structure test: every TriggerMeta registered in the discovery
   * registry that needs server-side activation work has matching support
   * in the activation registry — Slice 3.10.
   *
   * Why this guard exists:
   *   - Phase 3 ships provider-trigger config wrappers (this slice).
   *   - Per-provider meta slices (3.11+) register `<trigger>.meta.ts`
   *     files one at a time. At the moment a meta is registered, the
   *     UI immediately becomes able to add + configure that trigger on
   *     the canvas.
   *   - If the meta lands BEFORE its activation-time backend work
   *     (snapshot init for polling; webhook subscription create for
   *     webhook providers that need per-workflow subscriptions), the
   *     user gets a configurable trigger that silently misbehaves at
   *     workflow Activate time. This test prevents that drift.
   *
   * Invariant (strict):
   *   For every `TriggerMeta` with
   *     activation ∈ {"webhook", "polling"} AND requiresIntegration === true
   *   there must be a registered activation function in the activation
   *   registry at the `(provider, eventType)` key.
   *
   * Polling rationale: V2 inherits V1's "first-poll-miss" rule
   * (CLAUDE.md "Polling Trigger Snapshot Initialization"). Without an
   * activation hook seeding the snapshot, the first poll establishes a
   * baseline and silently drops events that arrived between activation
   * and the first poll. This is a real correctness bug class.
   *
   * Webhook rationale: providers that need per-workflow subscriptions
   * (Stripe, GitHub, Airtable, Microsoft Graph, Google Drive, HubSpot,
   * Shopify, Trello) create the subscription resource in activate(). Without
   * it the receive route's strict-direct-lookup misses inbound payloads.
   *
   * Slack-shaped exemption (no per-workflow subscription; one global webhook
   * URL handles every workspace) is supported via `SHARED_INFRA_EXEMPT_KEYS`
   * below. The lifecycle service falls through cleanly when no activation is
   * registered (lifecycle.ts line 68 — just upserts the trigger_resources
   * row), so a meta can opt into this pattern by being added to the
   * exemption set with a documented justification.
   *
   * **Today's coverage:** GitHub `new_commit` is the only registered
   * trigger meta requiring a provider activation. Future meta slices
   * either (a) ship their activation registration in the same PR or
   * (b) add their key to `SHARED_INFRA_EXEMPT_KEYS` with the reason.
   */

  // Force-load all provider modules so activations register at module init.

  /**
   * Triggers that intentionally do NOT register an activation hook because
   * their provider uses shared infrastructure (one global webhook URL,
   * routed via filterRegistry rather than per-workflow subscription).
   *
   * Add an entry here only when the provider truly has no per-workflow
   * activation work to do. The string is the `${provider}:${type}` key.
   * The accompanying comment must explain *why*.
   */
  const SHARED_INFRA_EXEMPT_KEYS: ReadonlySet<string> = new Set<string>([
    // Slack (Slice 3.11). Slack's Events API uses one global webhook URL
    // per app installation, routed at receive time via the per-(provider,
    // eventType) filter registry in `core/triggers/filterRegistry.ts`.
    // There is no per-workflow subscription to create at activate time —
    // `services/triggers/lifecycle.ts` writes a `trigger_resources` row
    // and the dispatcher looks the row up by (provider, event_type) and
    // gates it through the registered filter. The runtime filter for each
    // key lives at `integrations/slack/triggers/<event>/filter.ts`.
    "slack:message.channel",
    "slack:message.im",
    "slack:message.group",
    "slack:message.mpim",
    "slack:reaction_added",
    "slack:reaction_removed",
    "slack:channel_created",
    "slack:member_joined_channel",
    "slack:member_left_channel",
    "slack:file_shared",
  ]);

  describe("trigger-meta ↔ activation-registry invariant", () => {
    it("every registered TriggerMeta that requires activation has a registered activation function", () => {
      const missingActivations: string[] = [];

      for (const meta of listAllTriggerMetas()) {
        if (!meta.requiresIntegration) continue;
        if (meta.activation !== "webhook" && meta.activation !== "polling") continue;
        if (SHARED_INFRA_EXEMPT_KEYS.has(meta.key)) continue;

        const activation = findActivation(meta.provider, meta.type);
        if (!activation) {
          missingActivations.push(meta.key);
        }
      }

      if (missingActivations.length > 0) {
        throw new Error(
          [
            "The following registered TriggerMeta entries declare activation = " +
              '"webhook" or "polling" with requiresIntegration: true, but no ' +
              "activation function is registered for (provider, eventType):",
            ...missingActivations.map((k) => `  - ${k}`),
            "",
            "Either:",
            "  1. Register an activation function in the provider's " +
              "triggers/<event>/index.ts via registerActivation(...) — see " +
              "integrations/github/triggers/newCommit/index.ts for the template; OR",
            "  2. If the provider uses shared infrastructure (Slack-style " +
              "single global webhook URL routed via filterRegistry), add the " +
              "key to SHARED_INFRA_EXEMPT_KEYS in this test file with a " +
              "documented reason; OR",
            "  3. If the meta isn't ready to ship, remove it from " +
              "services/discovery/_registry.ts.",
          ].join("\n"),
        );
      }
    });

    it("SHARED_INFRA_EXEMPT_KEYS only references currently-registered meta keys (no orphans)", () => {
      const registeredKeys = new Set(listAllTriggerMetas().map((m) => m.key));
      const orphans: string[] = [];
      for (const exempt of SHARED_INFRA_EXEMPT_KEYS) {
        if (!registeredKeys.has(exempt)) orphans.push(exempt);
      }
      expect(orphans).toEqual([]);
    });
  });
});

describe("resource-field-discovery-coverage", () => {
  /**
   * Field-name shapes that denote a provider resource reference. Deliberately
   * NAME-BASED as a net: it is a *guard*, not the classifier — a real
   * classification lives in the per-field decision (picker or documented
   * exemption). False positives are cheap to exempt; false negatives are the
   * thing we can't afford.
   */
  const RESOURCE_NAME_RE = /(^|[a-z_])(id|ids)$/i;

  /** Fields whose Setup path is intentionally not a picker. Each needs a class + reason. */
  interface Exemption {
    readonly reason: string;
    readonly klass: "UPSTREAM" | "NO-LISTING" | "SCOPE" | "CONTRACT";
  }

  const EXEMPT: Readonly<Record<string, Exemption>> = {
    // ── UPSTREAM: produced by an earlier step / trigger at runtime ──────────
    // MOTIVE-1 — a fuel-purchase id is a transactional record id, normally wired
    // from the New Fuel Purchase trigger or a List Fuel Purchases step (or pasted
    // in Advanced). There are potentially thousands of fuel transactions — no
    // meaningful browse list — so a picker would be worse than variable mapping.
    "motive:get_fuel_purchase.fuelPurchaseId": {
      klass: "UPSTREAM",
      reason:
        "Fuel-purchase id comes from a New Fuel Purchase trigger or a List Fuel Purchases step; transactional records have no meaningful browse list.",
    },
    "motive:update_fuel_purchase.fuelPurchaseId": {
      klass: "UPSTREAM",
      reason:
        "Fuel-purchase id comes from a New Fuel Purchase trigger or a List Fuel Purchases step; transactional records have no meaningful browse list.",
    },
    "motive:delete_fuel_purchase.fuelPurchaseId": {
      klass: "UPSTREAM",
      reason:
        "Fuel-purchase id comes from a New Fuel Purchase trigger or a List Fuel Purchases step; transactional records have no meaningful browse list.",
    },
    // 5.TRUCK-BRIDGE-1 CS-3 — Find Linked Fleetio Vehicle's source id.
    "fleetio:find_linked_vehicle.sourceVehicleId": {
      klass: "UPSTREAM",
      reason:
        "The telematics vehicle id arrives at RUNTIME from the trigger ({{trigger.vehicleId}}) — that is the action's whole purpose: one workflow covers the fleet instead of one per truck. A design-time picker would imply the author must name a vehicle in advance, restating the problem this action removes. A motive:vehicles combobox was considered and rejected: it would make a requiresIntegration:false Fleetio node depend on a connected MOTIVE integration, and a picked value is still just the id the trigger already supplies.",
    },
    "slack:update_message.ts": {
      klass: "UPSTREAM",
      reason:
        "A message timestamp comes from the Slack step that posted the message or the trigger that received it — never something an author browses for.",
    },
    "slack:delete_message.ts": {
      klass: "UPSTREAM",
      reason:
        "Message ts is wired from an earlier Slack step or the trigger that received the message — there is no meaningful browse list of timestamps.",
    },
    "slack:add_reaction.ts": {
      klass: "UPSTREAM",
      reason:
        "Message ts is wired from an earlier Slack step or the trigger that received the message — there is no meaningful browse list of timestamps.",
    },
    "slack:remove_reaction.ts": {
      klass: "UPSTREAM",
      reason:
        "Message ts is wired from an earlier Slack step or the trigger that received the message — there is no meaningful browse list of timestamps.",
    },
    "slack:pin_message.ts": {
      klass: "UPSTREAM",
      reason:
        "Message ts is wired from an earlier Slack step or the trigger that received the message — there is no meaningful browse list of timestamps.",
    },
    "slack:unpin_message.ts": {
      klass: "UPSTREAM",
      reason:
        "Message ts is wired from an earlier Slack step or the trigger that received the message — there is no meaningful browse list of timestamps.",
    },
    "slack:cancel_scheduled_message.scheduledMessageId": {
      klass: "UPSTREAM",
      reason:
        "The scheduled-message id is returned by the schedule_message step that created it; Slack has no browse list of pending scheduled messages for a picker.",
    },
    "stripe:capture_payment_intent.paymentIntentId": {
      klass: "UPSTREAM",
      reason:
        "Payment intents are created by an earlier Stripe step or delivered by a webhook; they are per-transaction runtime values, not a catalog to browse.",
    },
    "stripe:confirm_payment_intent.paymentIntentId": {
      klass: "UPSTREAM",
      reason:
        "Payment intents are created by an earlier Stripe step or delivered by a webhook; they are per-transaction runtime values, not a catalog to browse.",
    },
    "stripe:find_payment_intent.paymentIntentId": {
      klass: "UPSTREAM",
      reason:
        "A lookup by an id supplied at runtime from an earlier step or a webhook payload — the whole point of the action is resolving a value it is given.",
    },
    "stripe:create_refund.chargeId": {
      klass: "UPSTREAM",
      reason:
        "Charge ids arrive from the payment step or the Stripe webhook payload that reported the charge.",
    },
    // ── CONTRACT: a builder/runtime contract blocks it today ────────────────
    "github:create_issue.milestone": {
      klass: "CONTRACT",
      reason:
        "Runtime schema stores z.number(); the ActionMeta contract forbids optionsSource on `number` fields and a combobox commits a string. Needs a coerce-to-number schema change (a slice that may touch schemas).",
    },
    // RESOLVERS-2 retired the `shopify:update_inventory.location_id` SCOPE
    // exemption: `read_locations` is now requested as an OPTIONAL manifest
    // scope (optional ⇒ no forced reconnect for existing stores), and the
    // field is a real `shopify:locations` picker. Tokens predating the scope
    // get PROVIDER_REAUTH_REQUIRED → Reconnect, not a broken empty box.
    // ── NO-LISTING / deliberate product decisions ───────────────────────────
    "google-analytics:send_event.apiSecret": {
      klass: "NO-LISTING",
      reason:
        "V2 decision D-GA1: the Measurement Protocol api_secret is NEVER read or surfaced by ChainReact; paste-only by design.",
    },
    "mailchimp:unsubscribe_subscriber.emailAddress": {
      klass: "CONTRACT",
      reason:
        "The action's V1 field names (listId/emailAddress) can't feed the members resolver, which reads deps.audience_id — SchemaForm keys deps by the parent field NAME. Needs a schema rename (breaks the handler) or a shared-resolver change.",
    },
    "gmail:get_attachment.messageId": {
      klass: "UPSTREAM",
      reason:
        "Message ids are produced by the step that sent the message or by the trigger that received it — there is no meaningful browse list, and mapping from that step is the correct UX.",
    },
    "gmail:add_label.messageId": {
      klass: "UPSTREAM",
      reason:
        "Message ids are produced by the step that sent the message or by the trigger that received it — there is no meaningful browse list, and mapping from that step is the correct UX.",
    },
    "gmail:remove_label.messageId": {
      klass: "UPSTREAM",
      reason:
        "Message ids are produced by the step that sent the message or by the trigger that received it — there is no meaningful browse list, and mapping from that step is the correct UX.",
    },
    "gmail:mark_as_read.messageId": {
      klass: "UPSTREAM",
      reason:
        "Message ids are produced by the step that sent the message or by the trigger that received it — there is no meaningful browse list, and mapping from that step is the correct UX.",
    },
    "gmail:mark_as_unread.messageId": {
      klass: "UPSTREAM",
      reason:
        "Message ids are produced by the step that sent the message or by the trigger that received it — there is no meaningful browse list, and mapping from that step is the correct UX.",
    },
    "gmail:archive_email.messageId": {
      klass: "UPSTREAM",
      reason:
        "Message ids are produced by the step that sent the message or by the trigger that received it — there is no meaningful browse list, and mapping from that step is the correct UX.",
    },
    "gmail:delete_email.messageId": {
      klass: "UPSTREAM",
      reason:
        "Message ids are produced by the step that sent the message or by the trigger that received it — there is no meaningful browse list, and mapping from that step is the correct UX.",
    },
    "gmail:get_attachment.attachmentId": {
      klass: "UPSTREAM",
      reason:
        "Attachment ids only exist inside a specific message payload delivered by the trigger / fetch step.",
    },
    "gmail:reply_to_email.originalMessageId": {
      klass: "UPSTREAM",
      reason:
        "Message ids are produced by the step that sent the message or by the trigger that received it — there is no meaningful browse list, and mapping from that step is the correct UX.",
    },
    "gmail:create_draft_reply.originalMessageId": {
      klass: "UPSTREAM",
      reason:
        "Message ids are produced by the step that sent the message or by the trigger that received it — there is no meaningful browse list, and mapping from that step is the correct UX.",
    },
    "microsoft-outlook:reply_to_email.emailId": {
      klass: "UPSTREAM",
      reason:
        "Outlook message ids come from the trigger that received the mail or the step that sent it; Graph has no user-facing browse list for the builder to offer.",
    },
    "microsoft-outlook:forward_email.emailId": {
      klass: "UPSTREAM",
      reason:
        "Outlook message ids come from the trigger that received the mail or the step that sent it; Graph has no user-facing browse list for the builder to offer.",
    },
    "microsoft-outlook:get_attachment.emailId": {
      klass: "UPSTREAM",
      reason:
        "Outlook message ids come from the trigger that received the mail or the step that sent it; Graph has no user-facing browse list for the builder to offer.",
    },
    "microsoft-outlook:add_categories.emailId": {
      klass: "UPSTREAM",
      reason:
        "Outlook message ids come from the trigger that received the mail or the step that sent it; Graph has no user-facing browse list for the builder to offer.",
    },
    "microsoft-outlook:move_email.emailId": {
      klass: "UPSTREAM",
      reason:
        "Outlook message ids come from the trigger that received the mail or the step that sent it; Graph has no user-facing browse list for the builder to offer.",
    },
    "microsoft-outlook:delete_email.emailId": {
      klass: "UPSTREAM",
      reason:
        "Outlook message ids come from the trigger that received the mail or the step that sent it; Graph has no user-facing browse list for the builder to offer.",
    },
    "microsoft-teams:reply_to_channel_message.messageId": {
      klass: "UPSTREAM",
      reason:
        "The parent message id comes from the Teams step/trigger that produced the message being replied to.",
    },
    "google-calendar:update_event.eventId": {
      klass: "UPSTREAM",
      reason:
        "Calendar event ids come from the create_event step or the event_changed trigger; a browse list of every event in a calendar is unbounded and time-scoped, so mapping is the honest UX.",
    },
    "google-calendar:delete_event.eventId": {
      klass: "UPSTREAM",
      reason:
        "Calendar event ids come from the create_event step or the event_changed trigger; a browse list of every event in a calendar is unbounded and time-scoped, so mapping is the honest UX.",
    },
    "google-calendar:add_attendees.eventId": {
      klass: "UPSTREAM",
      reason:
        "Calendar event ids come from the create_event step or the event_changed trigger; a browse list of every event in a calendar is unbounded and time-scoped, so mapping is the honest UX.",
    },
    "microsoft-outlook-calendar:update_event.eventId": {
      klass: "UPSTREAM",
      reason:
        "Calendar event ids come from the create_event step or the event_changed trigger; a browse list of every event in a calendar is unbounded and time-scoped, so mapping is the honest UX.",
    },
    "microsoft-outlook-calendar:delete_event.eventId": {
      klass: "UPSTREAM",
      reason:
        "Calendar event ids come from the create_event step or the event_changed trigger; a browse list of every event in a calendar is unbounded and time-scoped, so mapping is the honest UX.",
    },
    "microsoft-outlook-calendar:add_attendees.eventId": {
      klass: "UPSTREAM",
      reason:
        "Calendar event ids come from the create_event step or the event_changed trigger; a browse list of every event in a calendar is unbounded and time-scoped, so mapping is the honest UX.",
    },
    "slack:download_file.fileId": {
      klass: "UPSTREAM",
      reason:
        "Slack file ids arrive from the file_shared trigger or an upload step; files.list would be an unbounded workspace dump rather than a useful picker.",
    },
    "slack:get_file_info.fileId": {
      klass: "UPSTREAM",
      reason:
        "Slack file ids arrive from the file_shared trigger or an upload step; files.list would be an unbounded workspace dump rather than a useful picker.",
    },
    // RESOLVERS-2 retired the three `shopify:*.order_id` UPSTREAM exemptions.
    // The premise ("an order picker would list an unbounded, constantly-changing
    // history") didn't survive contact with the API: `GET /orders.json` is a
    // supported list endpoint on the already-required `read_orders` scope, and
    // ONE bounded page of the 50 most recent orders, labeled
    // `#1001 - Jane Smith - 84.20 USD - paid`, is exactly what a merchant needs
    // when hand-picking an order. Being ALSO commonly mapped from an order
    // webhook never justified withholding the picker — `allowManualEntry: true`
    // keeps {{...}} mapping and pasted ids working unchanged.
    "stripe:create_refund.paymentIntentId": {
      klass: "UPSTREAM",
      reason:
        "Payment intents are created by an earlier step or delivered by a Stripe webhook.",
    },
    // TEST-SUITE-GREEN-1 — the OTHER five Linear raw-id fields
    // (update_issue.id, add_comment.issueId, and the three parentId issue
    // references) were NOT exempted: they are now real `linear:issues` pickers
    // backed by captured live evidence. This one is different in kind.
    "linear:add_comment.parentId": {
      klass: "UPSTREAM",
      reason:
        "This is a COMMENT id, not an issue id: it threads a reply under a specific existing comment, which the author knows only from the comment payload that prompted the reply (a notification/trigger or an earlier Add Comment step that returned its own `id`). There is no design-time list of comments a workflow author would browse. Linear does expose list_comments, but it carries NO captured evidence in mcp-evidence.json — the item shape is unconfirmed, and this provider's standing rule (see mcp-catalog.ts, list_cycles/list_projects notes) is to ship no guessed shape. Leaving Reply-to as an Advanced text field is the honest UX; the top-level comment path, which is the common one, needs nothing here.",
    },
    "notion:create_comment.discussionId": {
      klass: "UPSTREAM",
      reason:
        "A discussion id identifies an existing comment thread and is only obtainable from a comment payload / earlier step.",
    },
    "google-analytics:send_event.clientId": {
      klass: "NO-LISTING",
      reason:
        "The GA client id is generated by the customer's own site/app at runtime and supplied per event — it is not a ChainReact-discoverable resource.",
    },
    "google-analytics:send_event.userId": {
      klass: "NO-LISTING",
      reason:
        "The GA user id is the customer's own identifier for their end user, supplied per event at runtime.",
    },
    "stripe:create_checkout_session.clientReferenceId": {
      klass: "NO-LISTING",
      reason:
        "A free reference the author chooses to correlate the session with their own system — not a Stripe resource to browse.",
    },
    // RESOLVERS-2 retired the `shopify:update_product_variant.variant_id` SCOPE
    // exemption. The "needs a product-scoped UI parent" premise was wrong: the
    // products list can return each product's variants INLINE
    // (`GET /products.json?fields=id,title,variants`), so one bounded call backs
    // a FLAT `shopify:variants` picker with product-qualified labels
    // ("Acme Tee - Small / Blue - SKU ABC-1 - 19.00"). No parent field, and no
    // runtime schema change, was needed after all.
    "shopify:update_inventory.inventory_item_id": {
      klass: "UPSTREAM",
      reason:
        "Re-classified in RESOLVERS-2 (was SCOPE, citing a product-parent gap + read_locations — both now resolved, and neither was ever this field's real blocker). An inventory item is a variant's invisible inventory record: it has no name, no SKU of its own, and no merchant-facing identity anywhere in the Shopify admin, and Shopify exposes no standalone listing (/inventory_items.json requires an ids= filter you can only get from variants you already hold). A picker could only show the PARENT VARIANT's label — the variants picker wearing a different id, which would silently mis-target. The real path is mapping {{step.inventoryItemId}} from an upstream Update / Create Product Variant step, which both emit it.",
    },
  };

  interface Offender {
    readonly key: string;
    readonly label: string;
  }

  function collect(): Offender[] {
    const registeredSources = new Set(listOptionsResolvers().map((r) => r.source));
    const offenders: Offender[] = [];

    const check = (metaKey: string, field: FieldMeta): void => {
      // Only plain typed inputs can strand a user on an opaque id. Pickers,
      // structured editors, temporal/boolean/number controls are all fine.
      if (field.type !== "text") return;
      if (!RESOURCE_NAME_RE.test(field.name)) return;
      const key = `${metaKey}.${field.name}`;
      if (EXEMPT[key]) return;
      offenders.push({ key, label: field.label });
    };

    for (const meta of listAllActionMetas()) {
      for (const field of meta.fields) check(meta.key, field);
    }
    for (const meta of listAllTriggerMetas()) {
      for (const field of meta.fields) check(meta.key, field);
    }

    // A wired picker must point at a REGISTERED resolver (a dangling source is a
    // dead dropdown — worse than text). The dedicated reference-integrity guard
    // covers this too; asserted here so this file tells the whole story.
    for (const meta of [...listAllActionMetas(), ...listAllTriggerMetas()]) {
      for (const field of meta.fields) {
        if (field.optionsSource && !registeredSources.has(field.optionsSource)) {
          offenders.push({
            key: `${meta.key}.${field.name}`,
            label: `points at unregistered source '${field.optionsSource}'`,
          });
        }
      }
    }
    return offenders;
  }

  describe("resource-field discovery coverage (RESOLVERS-1)", () => {
    it("sanity: the registry exposes a non-trivial field surface", () => {
      const total =
        listAllActionMetas().reduce((n, m) => n + m.fields.length, 0) +
        listAllTriggerMetas().reduce((n, m) => n + m.fields.length, 0);
      expect(total).toBeGreaterThan(1000);
    });

    it("no builder-visible resource field is plain Setup text without a resolver or a documented exemption", () => {
      const offenders = collect();
      if (offenders.length > 0) {
        const lines = offenders.map((o) => `  • ${o.key} — "${o.label}"`).join("\n");
        throw new Error(
          `${offenders.length} resource field(s) still make users supply a provider identifier by hand:\n` +
            lines +
            "\n\nEither wire a registered `optionsSource` picker (allowManualEntry stays on for " +
            "power users), or add a documented exemption to EXEMPT in this file with one of the " +
            "four classes (UPSTREAM / NO-LISTING / SCOPE / CONTRACT) and a real reason. " +
            "Do not exempt a field just to make this test pass.",
        );
      }
      expect(offenders).toEqual([]);
    });

    it("every exemption carries a real reason (no empty placeholders)", () => {
      for (const [key, ex] of Object.entries(EXEMPT)) {
        expect(`${key}:${ex.reason.length > 40}`).toBe(`${key}:true`);
        expect(["UPSTREAM", "NO-LISTING", "SCOPE", "CONTRACT"]).toContain(ex.klass);
      }
    });

    it("exemptions stay live: every exempted field still exists in the registry", () => {
      // Stops the ledger rotting into stale entries that hide real regressions.
      const live = new Set<string>();
      for (const meta of [...listAllActionMetas(), ...listAllTriggerMetas()]) {
        for (const field of meta.fields) live.add(`${meta.key}.${field.name}`);
      }
      const dead = Object.keys(EXEMPT).filter((k) => !live.has(k));
      expect(dead).toEqual([]);
    });

  });
});

describe("handlers.google-calendar", () => {
  /**
   * Structure test: all 5 Google Calendar action handlers are registered
   * in services/execution/handlers/_registry.ts and reachable via
   * getActionHandler.
   */

  describe("Google Calendar action handler registration", () => {
    const expectedTypes = [
      "create_event",
      "list_events",
      "update_event",
      "delete_event",
      "add_attendees",
    ] as const;

    it.each(expectedTypes)(
      "google-calendar:%s is registered and resolvable via getActionHandler",
      (type) => {
        const handler = getActionHandler("google-calendar", type);
        expect(handler).toBeDefined();
        expect(typeof handler).toBe("function");
      },
    );

    it("listRegisteredHandlers includes all 5 google-calendar entries", () => {
      const calendar = listRegisteredHandlers().filter(
        (h) => h.provider === "google-calendar",
      );
      expect(calendar).toHaveLength(5);
      expect(calendar.map((h) => h.type).sort()).toEqual(
        [...expectedTypes].sort(),
      );
    });

    it("does not return a handler for an unregistered google-calendar type", () => {
      expect(getActionHandler("google-calendar", "nonexistent")).toBeUndefined();
    });
  });
});

describe("manifest.google-calendar", () => {
  /**
   * Structure test: Google Calendar provider is registered correctly.
   *
   * Asserts that the manifest is in the registry, validates against the
   * ProviderManifestSchema (which the registry already enforces at module
   * load — but this is an explicit assertion), and surfaces the Calendar
   * scopes / capabilities / accountId field at the right shape for
   * downstream consumers.
   */

  describe("Google Calendar manifest registration", () => {
    it("is present in the frozen PROVIDERS registry", () => {
      expect(PROVIDERS["google-calendar"]).toBeDefined();
      expect(PROVIDERS["google-calendar"]).toBe(googleCalendarManifest);
    });

    it("is returned by getProvider('google-calendar')", () => {
      const m = getProvider("google-calendar");
      expect(m).toBeDefined();
      expect(m?.id).toBe("google-calendar");
    });

    it("appears in listProviders()", () => {
      const ids = listProviders().map((m: ProviderManifest) => m.id);
      expect(ids).toContain("google-calendar");
    });

    it("validates against ProviderManifestSchema", () => {
      expect(() =>
        ProviderManifestSchema.parse(googleCalendarManifest),
      ).not.toThrow();
    });

    it("declares OAuth + refresh + user-scoped tokens", () => {
      expect(googleCalendarManifest.capabilities.oauth).toBe(true);
      expect(googleCalendarManifest.refreshable).toBe(true);
      expect(googleCalendarManifest.tokenScope).toBe("user");
      expect(googleCalendarManifest.accountIdField).toBe("email");
    });

    it("declares the scope set (calendar.events + calendar.readonly + userinfo.email)", () => {
      // CONFIG-FIELD-UX-SWEEP-4 (Marcus-approved pre-launch) added
      // `calendar.readonly` so the `google-calendar:calendars` picker can call
      // calendarList.list (calendar.events alone doesn't grant it). RE-CONSENT:
      // existing connections must reconnect to gain the scope.
      expect(googleCalendarManifest.scopes.required).toEqual([
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
      ]);
      expect(googleCalendarManifest.scopes.optional).toEqual([]);
      expect(googleCalendarManifest.scopes.deprecated).toEqual([]);
    });

    it("has actions + webhookTrigger true (handlers + watch trigger registered)", () => {
      // Honest-state convention: capability flags reflect what's actually
      // wired up. Both the 5 action handlers and the watch-based
      // event_changed trigger are registered as of this batch; pollingTrigger
      // stays false because Calendar uses push-watch, not polling.
      expect(googleCalendarManifest.capabilities.actions).toBe(true);
      expect(googleCalendarManifest.capabilities.webhookTrigger).toBe(true);
      expect(googleCalendarManifest.capabilities.pollingTrigger).toBe(false);
    });

    it("reports oauth + actions + webhookTrigger via providerSupports", () => {
      expect(providerSupports("google-calendar", "oauth")).toBe(true);
      expect(providerSupports("google-calendar", "actions")).toBe(true);
      expect(providerSupports("google-calendar", "webhookTrigger")).toBe(true);
      expect(providerSupports("google-calendar", "pollingTrigger")).toBe(false);
    });
  });
});
