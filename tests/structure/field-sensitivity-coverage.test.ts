/**
 * @jest-environment node
 *
 * Anti-drift guard (AI-REPAIR-SAFETY-HARDENING CS-3 + follow-up sweep).
 *
 * Apply-safety blocks a deterministic AI repair / Apply from writing a secret /
 * connection-identity / recipient field. That decision is the fail-closed UNION of
 * (a) the field's declared `FieldMeta.sensitivity` and (b) the historical key-name
 * heuristics. The heuristics stay as permanent defense-in-depth — but METADATA is the
 * source of truth.
 *
 * This guard now covers the FULL registry: for EVERY registered action/trigger config
 * field whose KEY NAME the apply-safety heuristics flag as sensitive, the field MUST
 * either (1) declare a consistent `sensitivity`, or (2) be listed in
 * `HEURISTIC_FALSE_POSITIVES` below with a reason. A new sensitive-named field that is
 * neither annotated nor exempted fails here, naming the offender.
 *
 * WHY AN EXEMPTION LIST (not "annotate everything"): the key-name heuristics OVER-MATCH.
 * A field whose name merely CONTAINS a flagged token is not necessarily sensitive — a
 * record id (`emailId`), a pagination cursor (`pageToken`), an enum/boolean/number
 * (`attendeeType`, `send_welcome_email`, `amount_to_capture`), or a content/data URL
 * (`tracking_url`). Annotating those as a "recipient"/"secret" would be INVENTING
 * metadata. So they are EXEMPTED here with a reason instead.
 *
 * CRITICAL — exemption is GUARD-ONLY, never a gate bypass: an exempted field is STILL
 * blocked at runtime by the key-name heuristic (the CS-2 union). The exemption only
 * says "don't force a metadata annotation here"; it does NOT make the field apply-safe.
 * That invariant is proven in
 * `tests/unit/services/workflows/patch/applySafety.test.ts`
 * ("exempted false-positive field names are still blocked by the heuristics").
 *
 * Uses the SAME predicates as the live apply gate (no re-implementation, no drift):
 *   - `isSecretLikeKey`              (core/security/secretKeys)
 *   - `isConnectionIdentityKey`      (services/workflows/patch/applySafety — exported for this)
 *   - `isRecipientOrDestinationKey`  (core/security/recipientKeys)
 */
import { isSecretLikeKey } from "@/core/security/secretKeys";
import { isRecipientOrDestinationKey } from "@/core/security/recipientKeys";
import { isConnectionIdentityKey } from "@/services/workflows/patch/applySafety";
import {
  listAllActionMetas,
  listAllTriggerMetas,
} from "@/services/discovery/_registry";
import type { FieldSensitivity } from "@/contracts/actionMeta";

/**
 * Heuristic false positives — fields whose KEY NAME a heuristic flags but which are
 * genuinely NOT sensitive. Keyed by `provider:type` → field names. Each is still
 * heuristic-blocked at the apply gate (exemption is guard-only); we just don't assert a
 * metadata category for it (mislabeling would be inventing metadata).
 */
const HEURISTIC_FALSE_POSITIVES: Record<string, readonly string[]> = {
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
  "microsoft-onenote:update_page": ["target"], // CSS selector / data-id (insert target in HTML), not a destination
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
