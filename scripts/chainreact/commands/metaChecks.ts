/**
 * Internal ChainReact CLI — deeper read-only metadata checks (text/regex only).
 *
 * These extend `app validate` from "the triad files exist" to "the metadata each
 * file declares is structurally complete and consistent with the contracts in
 * `contracts/actionMeta.ts`, `contracts/triggerMeta.ts`, and
 * `contracts/integration.ts`". They NEVER import provider code — each file is read
 * as text and scanned for the presence of the contract-required TOP-LEVEL keys and
 * for provider/key consistency.
 *
 * Conservatism (avoid false positives):
 *   - Only UNAMBIGUOUS top-level keys are presence-checked. Keys that also appear
 *     inside `fields[]` / `outputs[]` sub-objects (`type`, `description`, `name`,
 *     `label`) are deliberately NOT presence-checked — a text scan cannot tell a
 *     top-level `type:` from a field's `type:`.
 *   - A file that does not carry its `: ActionMeta` / `: TriggerMeta` marker is not
 *     statically analyzable; we emit a WARNING and skip the deep checks rather than
 *     emit false errors (these would only ever be a future dynamically-built meta).
 *   - All current 25 providers pass these checks (every required key is inlined and
 *     every `provider:`/`key:` is consistent), so they add no noise today.
 *
 * Why ERROR (not warning): each checked invariant is enforced by the Zod contract
 * at discovery-registry load — a violation means the app build fails AND the
 * action/trigger is invisible/broken in the builder + AI. That is real drift.
 */
import { type Finding, scanField } from "../providers";

/** UNAMBIGUOUS top-level keys (never present inside field/output sub-objects). */
export const REQUIRED_ACTION_META_KEYS: readonly string[] = ["provider", "displayName", "category", "requiresIntegration", "fields"];
export const REQUIRED_TRIGGER_META_KEYS: readonly string[] = ["provider", "displayName", "category", "activation", "requiresIntegration", "fields"];
/** Manifest keys beyond id/displayName/isEnabled (those are checked elsewhere). */
export const REQUIRED_MANIFEST_KEYS: readonly string[] = ["tokenScope", "scopes", "capabilities", "healthCheckIntervalMs"];

/** True if the text declares a top-level `<key>:` (word-boundary, not a substring). */
export function hasTopLevelKey(text: string, key: string): boolean {
  return new RegExp(`\\b${key}\\s*:`).test(text);
}

export type MetaKind = "action" | "trigger";

const MARKER: Record<MetaKind, string> = { action: "ActionMeta", trigger: "TriggerMeta" };
const REQUIRED: Record<MetaKind, readonly string[]> = { action: REQUIRED_ACTION_META_KEYS, trigger: REQUIRED_TRIGGER_META_KEYS };
const CODE_PREFIX: Record<MetaKind, string> = { action: "ACTION", trigger: "TRIGGER" };

/**
 * Deep-check one meta file's text against its contract. `label` is the action/
 * trigger basename for messages; `providerId` is the owning provider folder.
 */
export function checkMetaContent(text: string, kind: MetaKind, providerId: string, label: string): Finding[] {
  const findings: Finding[] = [];
  const prefix = CODE_PREFIX[kind];

  if (!text.includes(MARKER[kind])) {
    findings.push({
      level: "warning",
      code: `${prefix}_META_NOT_ANALYZABLE`,
      message: `${kind} meta '${label}' does not declare a \`: ${MARKER[kind]}\` literal — deeper checks skipped (build-time Zod still validates it).`,
    });
    return findings;
  }

  for (const key of REQUIRED[kind]) {
    if (!hasTopLevelKey(text, key)) {
      findings.push({
        level: "error",
        code: `${prefix}_META_INCOMPLETE`,
        message: `${kind} meta '${label}' is missing required \`${key}\`. The ${MARKER[kind]} contract requires it.`,
      });
    }
  }

  const declaredProvider = scanField(text, "provider");
  if (declaredProvider !== null && declaredProvider !== providerId) {
    findings.push({
      level: "error",
      code: `${prefix}_META_PROVIDER_MISMATCH`,
      message: `${kind} meta '${label}' declares provider "${declaredProvider}" but lives under integrations/${providerId}/.`,
    });
  }

  const declaredKey = scanField(text, "key");
  if (declaredKey !== null && !declaredKey.startsWith(`${providerId}:`)) {
    findings.push({
      level: "error",
      code: `${prefix}_META_KEY_MISMATCH`,
      message: `${kind} meta '${label}' key "${declaredKey}" must be "${providerId}:<type>" (key === provider:type).`,
    });
  }

  return findings;
}

/** Deep-check a manifest's text for required fields beyond id/displayName. */
export function checkManifestContent(text: string, providerId: string): Finding[] {
  const findings: Finding[] = [];
  for (const key of REQUIRED_MANIFEST_KEYS) {
    if (!hasTopLevelKey(text, key)) {
      findings.push({
        level: "error",
        code: "MANIFEST_FIELD_MISSING",
        message: `integrations/${providerId}/manifest.ts is missing required \`${key}\`. The ProviderManifest contract requires it.`,
      });
    }
  }
  return findings;
}
