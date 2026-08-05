/**
 * DEV-CONNECTION-TRANSPLANT-UTILITY-1 — provider-specific scope-assertion
 * semantics (SCOPE-GATE-REFINEMENT-1).
 *
 * The naive gate ("every manifest-required scope must appear in
 * `integrations.scopes`") mirrors the app's own `connectionDiagnosis`, but
 * audit of the actual connect flows (2026-08-04) showed the column is NOT a
 * reliable record of granted scopes for several providers. Treating absent
 * metadata as proof of a deficient credential produced FALSE
 * `reconnect_required` verdicts for working production connections.
 *
 * This module encodes, per provider and with the evidence cited, whether the
 * scope column can be trusted — plus two documented normalizations. It is a
 * PROVIDER-SPECIFIC correction, never a global relaxation: any provider not
 * listed here keeps the strict comparison, so unknown providers fail closed.
 *
 * A `scopes_not_asserted` verdict is NOT a pass for the credential: it means
 * "the app has no scope evidence either way", and the transplant then REQUIRES
 * the provider's read-only identity/acceptance probe to succeed at apply time
 * (strict verification mode already refuses any provider without a probe).
 */

export type ScopeStatus =
  /** Every required scope is present (after documented normalization). */
  | "scopes_verified"
  /** Reliable scope data present AND a required scope is genuinely absent. */
  | "scopes_missing"
  /** Provider/flow does not persist trustworthy granted-scope metadata. */
  | "scopes_not_asserted"
  /** The provider has no scope concept (manifest declares none required). */
  | "scopes_not_applicable";

/**
 * Providers whose persisted scope record cannot be used as evidence.
 *
 *  - `never_persisted` — the connect flow hardcodes a value that does not come
 *    from the provider at all, so the column can never show what was granted.
 *  - `provider_optional` — the flow DOES read the provider's `scope` field, but
 *    the provider may omit it entirely; an EMPTY record therefore means "no
 *    metadata returned", not "nothing granted". A NON-EMPTY record from these
 *    providers IS real evidence and keeps the strict comparison.
 */
const SCOPE_ASSERTION: Record<string, { mode: "never_persisted" | "provider_optional"; evidence: string }> = {
  asana: {
    mode: "never_persisted",
    evidence:
      "integrations/asana/oauth.ts:263 hardcodes `scopes: []`; Asana's token response does not echo granted scopes (comment :261-262).",
  },
  notion: {
    mode: "never_persisted",
    evidence:
      "integrations/notion/oauth.ts:164 hardcodes `scopes: []`; Notion's authorize URL takes no scope param — capabilities are integration-level.",
  },
  trello: {
    mode: "never_persisted",
    evidence:
      "integrations/trello/auth.ts:112 hardcodes `scopes: []`; the implicit token flow never returns the requested scope string back.",
  },
  fleetio: {
    mode: "never_persisted",
    evidence:
      "integrations/fleetio/auth.ts:92 hardcodes `scopes: []` — API-key auth has no scope negotiation.",
  },
  mailchimp: {
    mode: "never_persisted",
    evidence:
      "integrations/mailchimp/oauth.ts:208 persists the SYNTHETIC value ['account_access']; Mailchimp returns `scope: null`.",
  },
  dropbox: {
    mode: "provider_optional",
    evidence:
      "integrations/dropbox/oauth.ts:166 reads `json.scope`, which Dropbox may omit; an empty column is absence of metadata.",
  },
  hubspot: {
    mode: "provider_optional",
    evidence:
      "integrations/hubspot/oauth.ts:199 reads `json.scope`, which HubSpot may omit; the introspection endpoint's `scopes[]` is fetched but never persisted.",
  },
};

/**
 * Documented per-provider normalizations applied to the GRANTED list before
 * comparison. Each states a provider contract or a known upstream defect —
 * never a generic "close enough" rule.
 */
function normalizeGranted(provider: string, granted: readonly string[]): string[] {
  if (provider === "monday") {
    // UPSTREAM DEFECT (found 2026-08-04): monday returns a COMMA-separated
    // scope string, but integrations/monday/oauth.ts:237 splits on " ", so all
    // granted scopes land in ONE mangled array element. Splitting each element
    // on commas recovers the true grant; it can never invent a scope the
    // provider did not return. Fixing the provider handler is tracked
    // separately — this keeps the transplant honest meanwhile.
    return granted.flatMap((s) => s.split(",")).map((s) => s.trim()).filter(Boolean);
  }
  if (provider === "shopify") {
    // Shopify access-scope semantics: `write_<resource>` confers read access to
    // that resource, so a store that granted write_orders satisfies a
    // read_orders requirement. Expand each granted write scope with its read
    // counterpart. Scoped to Shopify ONLY — no other provider in V2 documents
    // this implication.
    const out = new Set<string>();
    for (const raw of granted) {
      const s = raw.trim();
      if (!s) continue;
      out.add(s);
      if (s.startsWith("write_")) out.add(`read_${s.slice("write_".length)}`);
    }
    return [...out];
  }
  return granted.filter((s) => s.trim().length > 0);
}

export interface ScopeEvaluation {
  status: ScopeStatus;
  /** Populated only for `scopes_missing`. */
  missingCount: number;
  /** Why the status was reached (safe, non-secret; scope NAMES are public). */
  detail: string;
}

export function evaluateScopes(input: {
  provider: string;
  requiredScopes: readonly string[];
  grantedScopes: readonly string[];
}): ScopeEvaluation {
  const { provider, requiredScopes } = input;

  if (requiredScopes.length === 0) {
    return {
      status: "scopes_not_applicable",
      missingCount: 0,
      detail: "provider manifest declares no required scopes",
    };
  }

  const assertion = SCOPE_ASSERTION[provider];
  const granted = normalizeGranted(provider, input.grantedScopes);

  if (assertion) {
    const noEvidence =
      assertion.mode === "never_persisted" || granted.length === 0;
    if (noEvidence) {
      return {
        status: "scopes_not_asserted",
        missingCount: 0,
        detail: `${assertion.mode}: ${assertion.evidence}`,
      };
    }
    // provider_optional with real data → fall through to the strict comparison.
  }

  const missing = requiredScopes.filter((s) => !granted.includes(s));
  if (missing.length === 0) {
    return {
      status: "scopes_verified",
      missingCount: 0,
      detail: "all manifest-required scopes present",
    };
  }
  return {
    status: "scopes_missing",
    missingCount: missing.length,
    detail: `missing ${missing.length} of ${requiredScopes.length} required scopes`,
  };
}

/** Providers whose scope record this module treats as non-evidential. */
export function listScopeAssertionProviders(): Array<{ provider: string; mode: string; evidence: string }> {
  return Object.entries(SCOPE_ASSERTION).map(([provider, v]) => ({
    provider,
    mode: v.mode,
    evidence: v.evidence,
  }));
}
