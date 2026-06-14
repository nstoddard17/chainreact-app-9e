/**
 * Shared, client-safe secret-shaped-key classifier (AI-CONFIG-ASSIST CS-2A).
 *
 * Single source of truth for "does this PROPERTY KEY look like it holds secret
 * material?" — used by both:
 *   - server redaction ([services/ai/tools/redact.ts](../../services/ai/tools/redact.ts)
 *     `isSecretKey` / `redactSecrets`), which scrubs secret-keyed VALUES before the
 *     agent sees them; and
 *   - the builder chat-fill eligibility guard
 *     ([features/workflow-builder/ai/chatFillEligibility.ts](../../features/workflow-builder/ai/chatFillEligibility.ts)),
 *     which refuses to place a chat-typed value into a secret-shaped field.
 *
 * CS-1 duplicated this predicate to avoid a client→`services/` import; CS-2A
 * removes the drift by hoisting it here (pure, zero-dependency, client-safe — no
 * `services/`, no `repositories/`, no I/O). It classifies KEY NAMES only — never
 * touches values, never redacts. The redaction/scrubbing behavior itself stays in
 * `services/ai/tools/redact.ts`.
 *
 * Matching is deliberately conservative against false positives on innocuous keys
 * (`idempotencyKey`, `channelId`, `publicId`, and crucially the `oauth` capability
 * key) while covering the required no-leak cases:
 *   - **Substring** (after stripping `_ - whitespace`, lowercased) for distinctive
 *     secret fragments that can't collide with innocuous keys —
 *     `accessToken`/`refreshToken`/`botToken`, `clientSecret`/`apiSecret`,
 *     `password`, `apiKey`, `privateKey`, `accessKey`, `credential`,
 *     `Authorization`, `*Encrypted`, `bearer`.
 *   - **Word** (camelCase / separator split) for the short, ambiguous `auth`, so
 *     `auth` / `authToken` are flagged but `oauth` is NOT (it is a single token).
 *
 * There is deliberately NO bare `key` or `id` pattern.
 */

/** Lowercase + strip `_`, `-`, and whitespace, so `access_token`/`access-token`/`accessToken` collapse. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_\-\s]/g, "");
}

/** Split a key into lowercased words on camelCase + `_ - . space` boundaries. */
function tokenizeKey(key: string): readonly string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_.-]+/)
    .map((w) => w.toLowerCase())
    .filter(Boolean);
}

/** Distinctive secret fragments — substring-matched against the normalized key. */
const SECRET_KEY_SUBSTRINGS: readonly string[] = [
  "token",
  "secret",
  "password",
  "passwd",
  "credential",
  "authorization",
  "apikey",
  "privatekey",
  "accesskey",
  "clientsecret",
  "encrypted",
  "bearer",
];

/**
 * Short, ambiguous secret WORDS — matched on tokenized words only, so they don't
 * collide with innocuous keys that merely contain them as a substring
 * (`auth` matches `auth`/`authToken` but NOT `oauth`).
 */
const SECRET_KEY_WORDS: ReadonlySet<string> = new Set(["auth"]);

/**
 * True when a property key looks like it holds secret material. Pure + deterministic.
 * Classifies the KEY NAME only — never inspects or returns a value.
 */
export function isSecretLikeKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (SECRET_KEY_SUBSTRINGS.some((pattern) => normalized.includes(pattern))) {
    return true;
  }
  return tokenizeKey(key).some((word) => SECRET_KEY_WORDS.has(word));
}
