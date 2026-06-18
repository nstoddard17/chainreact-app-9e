/**
 * @jest-environment node
 *
 * Anti-drift guard (AI-REPAIR-SAFETY-HARDENING CS-3).
 *
 * Apply-safety blocks a deterministic AI repair / Apply from writing a secret /
 * connection-identity / recipient field. As of CS-1/CS-2 that decision is the fail-closed
 * UNION of (a) the field's declared `FieldMeta.sensitivity` and (b) the historical
 * key-name heuristics. The heuristics stay as permanent defense-in-depth — but the OWNER
 * DECISION is that METADATA, not key names, is the source of truth.
 *
 * This guard keeps the metadata in lockstep with the heuristics for an explicit
 * FIRST-WAVE covered set of metas — the canonical send / messaging / email / calendar
 * actions that are the real deterministic-repair target surface. For every covered meta,
 * every config field whose KEY NAME the apply-safety heuristics flag as sensitive MUST
 * declare `sensitivity`, set to a category its key matches. A covered meta that gains a
 * new `to` / `channel` / `apiKey`-style field but no `sensitivity` fails here.
 *
 * WHY A COVERED SET RATHER THAN THE WHOLE REGISTRY (the honest scope):
 * The key-name heuristics OVER-MATCH. Across the full registry they flag ~147 config
 * fields, but ~16 of those are semantic FALSE POSITIVES — fields whose name merely
 * contains a flagged token (`emailId`, `targetFormat`, `attendeeType`, `send_welcome_email`,
 * `email_type_option`, `amount_to_capture`, `pageToken`, `tracking_url`, `attachmentUrl`).
 * Forcing a `sensitivity` onto those would be INVENTING metadata (mislabeling a boolean
 * toggle / pagination cursor / record id as a "recipient" or "secret"). Behavior is
 * unaffected either way (the heuristic already blocks them via the CS-2 union), so the
 * first wave deliberately covers the high-value surface where the flagged fields are
 * unambiguous recipients/secrets/connections, with ZERO false positives. Extending the
 * covered set (after triaging the remaining ~132 fields and deciding which to annotate vs
 * exempt vs narrow the heuristic) is the documented follow-up in
 * docs/slices/phase-4/ai/ai-repair-safety-hardening-plan.md.
 *
 * Uses the SAME predicates as the live apply gate (no re-implementation, no drift):
 *   - `isSecretLikeKey`              (core/security/secretKeys)
 *   - `isConnectionIdentityKey`      (services/workflows/patch/applySafety — exported for this)
 *   - `isRecipientOrDestinationKey`  (core/security/recipientKeys)
 */
import { isSecretLikeKey } from "@/core/security/secretKeys";
import { isRecipientOrDestinationKey } from "@/core/security/recipientKeys";
import { isConnectionIdentityKey } from "@/services/workflows/patch/applySafety";
import { getActionMeta, getTriggerMeta } from "@/services/discovery/_registry";
import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { FieldSensitivity } from "@/contracts/actionMeta";

/**
 * First-wave covered metas (provider:type). Every config field in these metas that the
 * apply-safety heuristics flag MUST declare a consistent `sensitivity`. These are the
 * canonical "where does it send / what credential" actions — the genuine deterministic
 * Apply / repair target surface — and their flagged fields are all unambiguous
 * recipients / connections / secrets (no heuristic false positives).
 */
const COVERED_META_KEYS: readonly string[] = [
  "gmail:send_email",
  "microsoft-outlook:send_email",
  "slack:send_channel_message",
  "discord:send_message",
  "microsoft-teams:send_channel_message",
  "google-calendar:create_event",
  "microsoft-outlook-calendar:create_event",
  "facebook:send_message",
  "google-analytics:send_event",
  "native:http_request",
];

/** Every sensitivity category the apply-safety heuristics would assign to this key. */
function heuristicCategories(key: string): ReadonlySet<FieldSensitivity> {
  const out = new Set<FieldSensitivity>();
  if (isSecretLikeKey(key)) out.add("secret");
  if (isConnectionIdentityKey(key)) out.add("connection");
  if (isRecipientOrDestinationKey(key)) out.add("recipient");
  return out;
}

function lookupMeta(key: string): ActionMeta | TriggerMeta | undefined {
  return getActionMeta(key) ?? getTriggerMeta(key);
}

describe("guardrail — first-wave covered metas declare FieldMeta.sensitivity on heuristic-sensitive fields (CS-3)", () => {
  it.each(COVERED_META_KEYS)(
    "%s — every heuristic-flagged config field declares a consistent `sensitivity`",
    (metaKey) => {
      const meta = lookupMeta(metaKey);
      // A covered key that no longer resolves is itself a drift signal (renamed/removed).
      expect(meta).toBeDefined();
      if (!meta) return;

      const offenders: string[] = [];
      for (const field of meta.fields) {
        const matched = heuristicCategories(field.name);
        if (matched.size === 0) continue;
        const declared = field.sensitivity;
        if (declared === undefined || !matched.has(declared)) {
          offenders.push(
            `"${field.name}" — ` +
              (declared === undefined
                ? `missing \`sensitivity\` (key matches: ${[...matched].join(", ")})`
                : `declared "${declared}" but key matches: ${[...matched].join(", ")}`),
          );
        }
      }
      if (offenders.length > 0) {
        throw new Error(
          `${metaKey} has ${offenders.length} heuristic-sensitive field(s) missing/` +
            "inconsistent `FieldMeta.sensitivity`:\n" +
            offenders.map((o) => `  • ${o}`).join("\n") +
            "\n\nApply-safety is SCHEMA-DRIVEN for covered metas: declare each sensitive\n" +
            "field's `sensitivity` ('secret' | 'connection' | 'recipient'). See\n" +
            "docs/slices/phase-4/ai/ai-repair-safety-hardening-plan.md.",
        );
      }
    },
  );

  // Sanity: the covered metas actually contain heuristic-sensitive fields (so the guard
  // can't vacuously pass if a meta were emptied or a predicate silently broke).
  it("the covered set contains at least one heuristic-sensitive field", () => {
    const total = COVERED_META_KEYS.flatMap((k) => lookupMeta(k)?.fields ?? []).filter(
      (f) => heuristicCategories(f.name).size > 0,
    ).length;
    expect(total).toBeGreaterThan(0);
  });
});
