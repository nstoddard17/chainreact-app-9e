/**
 * Internal ChainReact CLI — provider-registry awareness (text-only).
 *
 * The repo wires providers by EXPLICIT import in `integrations/_registry.ts`
 * (see docs/rules/provider-registry.md). A manifest is inert until it is both
 * imported AND listed in the `ALL_MANIFESTS` array. This module reads that file
 * as TEXT only — it never imports `_registry.ts` or any provider runtime code —
 * to (a) detect whether a provider is registered and (b) compute a NARROW,
 * deterministic text patch that wires a new manifest in.
 *
 * Pure over the injected `FsDeps` for reads; patch computation is a pure string
 * transform (no fs). Both are fully unit-testable with in-memory fakes.
 */
import type { FsDeps } from "./repo";

/** Repo-relative path of the hand-maintained provider registry. */
export const REGISTRY_PATH = "integrations/_registry.ts";

/** `google-analytics` → `googleAnalytics` (manifest export-const naming). */
export function camelCaseId(id: string): string {
  return id
    .split(/[-_]/)
    .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join("");
}

/** `google-analytics` → `googleAnalyticsManifest` (the symbol the registry imports). */
export function registryExportName(id: string): string {
  return `${camelCaseId(id)}Manifest`;
}

/** Escape a string for safe interpolation into a `RegExp`. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Registration state for a provider:
 *   - `registered`   — manifest is imported AND listed in ALL_MANIFESTS.
 *   - `unregistered` — registry is readable but the provider is not wired in
 *     (a valid intermediate state for a freshly-scaffolded, inert provider).
 *   - `unknown`      — the registry file could not be read (so we don't guess).
 */
export type RegistrationStatus = "registered" | "unregistered" | "unknown";

/**
 * Detect registration from registry TEXT, anchored on the IMPORT PATH
 * (`./<id>/manifest`) — which is exactly the provider id and therefore
 * casing-independent. (Export symbols are NOT purely id-derived: e.g.
 * `microsoft-onedrive` exports `microsoftOneDriveManifest`, not
 * `microsoftOnedriveManifest`, so deriving the symbol from the id would give
 * false negatives.) A provider counts as registered when its manifest is
 * imported from `./<id>/manifest` AND the imported symbol is used a second time
 * (i.e. it also appears in the `ALL_MANIFESTS` array, not just the import).
 * Empty/unreadable text → `unknown` (never asserted as a fact).
 */
export function detectRegistration(registryText: string, id: string): RegistrationStatus {
  if (!registryText.trim()) return "unknown";
  const importMatch = registryText.match(
    new RegExp(`import\\s*\\{\\s*([A-Za-z_$][A-Za-z0-9_$]*)\\s*\\}\\s*from\\s*["']\\./${escapeRe(id)}/manifest["']`),
  );
  const symbol = importMatch?.[1];
  if (!symbol) return "unregistered";
  const tokenCount = (registryText.match(new RegExp(`\\b${escapeRe(symbol)}\\b`, "g")) ?? []).length;
  // ≥2 occurrences = the import symbol PLUS at least one array usage.
  return tokenCount >= 2 ? "registered" : "unregistered";
}

/** Read the registry via `fs` and report a provider's registration status. */
export function registrationStatus(fs: FsDeps, id: string): RegistrationStatus {
  return detectRegistration(fs.readText(REGISTRY_PATH), id);
}

/**
 * Read the `export const <name>(Manifest): ProviderManifest` symbol that a
 * provider's manifest.ts actually exports. Text/regex only (never executed).
 * Returns null when the manifest can't be read or no such export is found —
 * callers fall back to the derived `registryExportName(id)`.
 */
export function readManifestExportName(manifestText: string): string | null {
  // `export const fooManifest: ProviderManifest = ...` or `... = ProviderManifestSchema.parse(`
  const m = manifestText.match(/export\s+const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*ProviderManifest\b/);
  if (m?.[1]) return m[1];
  const m2 = manifestText.match(/export\s+const\s+([A-Za-z_$][A-Za-z0-9_$]*Manifest)\s*=/);
  return m2?.[1] ?? null;
}

/** Outcome of computing a registry patch for a provider. */
export type RegistryPatch =
  | {
      readonly ok: true;
      /** Already wired in — caller should treat as a clean no-op. */
      readonly alreadyRegistered: boolean;
      /** Full patched file text (unchanged when `alreadyRegistered`). */
      readonly newText: string;
      /** The single import line that was inserted ("" when already registered). */
      readonly importLine: string;
      /** The single array entry that was inserted ("" when already registered). */
      readonly arrayEntry: string;
    }
  | {
      readonly ok: false;
      /** Why patching was refused (unsafe/unrecognized registry format). */
      readonly reason: string;
    };

const MANIFEST_IMPORT_RE = /^import\s*\{\s*\w+\s*\}\s*from\s*["']\.\/[a-z0-9_-]+\/manifest["'];?[ \t]*$/gm;

/**
 * Compute a NARROW, deterministic two-point patch that wires a provider into the
 * registry: one manifest import (appended after the last existing manifest
 * import) and one `ALL_MANIFESTS` entry (appended before the array's `];`).
 *
 * We APPEND rather than sort: the real file groups entries by slice with inline
 * comments and is not strictly id-sorted, so appending preserves local
 * convention and keeps the edit to two inserted lines (never a full rewrite).
 *
 * Refuses (ok:false) when the file is empty/unreadable or its expected anchors
 * (a manifest import, the `ALL_MANIFESTS` array) are absent — i.e. when the
 * format is not what this patcher was written against, we decline rather than
 * risk a malformed edit.
 *
 * `exportName` MUST be the symbol the provider's manifest.ts actually exports
 * (read via `readManifestExportName`, or `registryExportName(id)` for a freshly
 * scaffolded manifest) — NOT blindly id-derived, since real export casing
 * diverges (e.g. `microsoftOneDriveManifest`).
 */
export function buildRegistryPatch(registryText: string, id: string, exportName: string): RegistryPatch {
  if (!registryText.trim()) {
    return { ok: false, reason: `${REGISTRY_PATH} is empty or could not be read — cannot patch safely.` };
  }

  if (detectRegistration(registryText, id) === "registered") {
    return { ok: true, alreadyRegistered: true, newText: registryText, importLine: "", arrayEntry: "" };
  }

  const importLine = `import { ${exportName} } from "./${id}/manifest";`;
  const arrayEntry = `  ${exportName},`;

  // Anchor 1: insert the import after the LAST existing manifest import.
  const importMatches = [...registryText.matchAll(MANIFEST_IMPORT_RE)];
  const lastImport = importMatches[importMatches.length - 1];
  if (!lastImport || lastImport.index === undefined) {
    return {
      ok: false,
      reason: `${REGISTRY_PATH} has no recognizable \`import { xManifest } from "./x/manifest"\` line to anchor a new import — declined to patch.`,
    };
  }
  const importInsertAt = lastImport.index + lastImport[0].length;

  // Anchor 2: insert the array entry before the `];` that closes ALL_MANIFESTS.
  const arrayDeclAt = registryText.indexOf("const ALL_MANIFESTS");
  if (arrayDeclAt < 0) {
    return { ok: false, reason: `${REGISTRY_PATH} has no \`const ALL_MANIFESTS\` array — declined to patch.` };
  }
  const openAt = registryText.indexOf("[", arrayDeclAt);
  const closeAt = openAt >= 0 ? registryText.indexOf("];", openAt) : -1;
  if (openAt < 0 || closeAt < 0) {
    return { ok: false, reason: `${REGISTRY_PATH} \`ALL_MANIFESTS\` array brackets not found — declined to patch.` };
  }
  if (closeAt < importInsertAt) {
    return { ok: false, reason: `${REGISTRY_PATH} layout unexpected (array closes before imports) — declined to patch.` };
  }

  // Apply the array insertion first (higher index) so the import insertion's
  // offset stays valid, then the import insertion.
  const withArray = `${registryText.slice(0, closeAt)}${arrayEntry}\n${registryText.slice(closeAt)}`;
  const newText = `${withArray.slice(0, importInsertAt)}\n${importLine}${withArray.slice(importInsertAt)}`;

  return { ok: true, alreadyRegistered: false, newText, importLine, arrayEntry: arrayEntry.trim() };
}
