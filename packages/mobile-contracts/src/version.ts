/**
 * Contract version identity.
 *
 * `MOBILE_CONTRACTS_SCHEMA_VERSION` — bumped when the meaning of any shape in
 * this package changes (follows the repo's exported schema-version-constant
 * idiom, e.g. `AI_GUIDANCE_SCHEMA_VERSION`). The npm semver tracks release
 * mechanics; this constant tracks wire-shape semantics and travels inside
 * payloads that carry a `v` field (push data).
 *
 * `MOBILE_API_VERSION` / `MOBILE_API_BASE_PATH` — the versioned namespace this
 * package describes. A breaking API change means a NEW namespace (`v2`) and a
 * new major of this package, never an in-place mutation of `v1`.
 */
export const MOBILE_CONTRACTS_SCHEMA_VERSION = 1;

export const MOBILE_API_VERSION = "v1";

export const MOBILE_API_BASE_PATH = "/api/mobile/v1";
