/**
 * Connectionless provider registry (AI-PROVIDER-4 CS-4).
 *
 * The single source of truth for "this provider needs no user connection".
 * Before CS-4 the builder hardcoded `provider === "native"` in several
 * places; adding the ChainReact AI provider (`ai`) made that literal wrong
 * in every one of them, so the concept is named once here.
 *
 * A connectionless provider has NO OAuth manifest, NO credentials, and no
 * Connect / Reconnect UI. It is NOT a permission or capability statement —
 * `ActionMeta.requiresIntegration` remains the authoritative per-node
 * signal that readiness consults (`readiness/connectionInput.ts` short
 * circuits on it, provider-agnostically). This list answers a narrower
 * question: which catalog does the builder fetch a node's metadata from,
 * and which picker section does it belong to.
 *
 * Fail-safe: an UNKNOWN provider is never connectionless — a provider is
 * connection-backed until it is deliberately listed here (mirrors the
 * unknown → personal default in `credentialSharing.ts`).
 *
 * Pure + dependency-free (core purity): no env reads, no I/O. Importable
 * from `app/`, `services/`, and `features/` alike.
 */

export const CONNECTIONLESS_PROVIDERS = ["native", "ai"] as const;

export type ConnectionlessProvider = (typeof CONNECTIONLESS_PROVIDERS)[number];

const CONNECTIONLESS_SET: ReadonlySet<string> = new Set(CONNECTIONLESS_PROVIDERS);

/**
 * True when the provider ships built-in nodes that need no connection.
 * Accepts an arbitrary string so an untyped/undefined caller fails safe
 * (unknown → false → treated as connection-backed).
 */
export function isConnectionlessProvider(
  provider: string | undefined | null,
): provider is ConnectionlessProvider {
  return typeof provider === "string" && CONNECTIONLESS_SET.has(provider);
}

/** The built-in logic/utility provider id (loops, router, delay, HTTP…). */
export const NATIVE_PROVIDER_ID = "native";

/** The ChainReact AI provider id — a connectionless, first-party provider. */
export const AI_PROVIDER_ID = "ai";

/** User-facing name for the AI provider. Never "AI" alone (too generic). */
export const AI_PROVIDER_DISPLAY_NAME = "ChainReact AI";
