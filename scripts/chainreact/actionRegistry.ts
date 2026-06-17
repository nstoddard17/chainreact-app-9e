/**
 * Internal ChainReact CLI — ACTION registry awareness (text-only).
 *
 * Actions are wired into the app through two hand-maintained inventories (same
 * explicit-import convention as integrations/_registry.ts):
 *   - HANDLER inventory `services/execution/handlers/_handlerInventory.ts` —
 *     imports each handler (`{ <export> as <alias> }`) + lists
 *     `ALL_HANDLERS` entries `{ provider, type, handler: <alias> }`.
 *   - META inventory `services/discovery/_metaInventory.ts` — imports each meta
 *     (`{ <metaExport> }`) + lists `ALL_ACTION_META` (bare symbols).
 *
 * This module reads BOTH as TEXT only — it never imports them or any provider
 * runtime code — to (a) detect whether an action's handler/meta are registered
 * and (b) compute NARROW, deterministic append patches that wire an IMPLEMENTED
 * action in. It also detects a TRIGGER's meta registration (detection only — no
 * trigger patching this slice). Detection is anchored on the IMPORT PATH
 * (`@/integrations/<provider>/<actions|triggers>/<…>/<base>[.meta]`), which is
 * exactly the provider + basename and therefore independent of export-symbol/alias
 * casing — mirrors the provider registry detection in registry.ts.
 *
 * Pure over injected `FsDeps` for reads; patch computation is a pure string
 * transform. Both are fully unit-testable with in-memory fakes.
 */
import { camelCaseId, type RegistrationStatus } from "./registry";
import type { FsDeps } from "./repo";

export const HANDLER_INVENTORY_PATH = "services/execution/handlers/_handlerInventory.ts";
export const META_INVENTORY_PATH = "services/discovery/_metaInventory.ts";
/** Per-provider discovery barrels: `_metaInventory.ts` spreads `<X>_ACTION_METAS`. */
export const META_PROVIDERS_DIR = "services/discovery/providers";

/** The discovery barrel path for a provider (may or may not exist). */
export function metaBarrelPath(provider: string): string {
  return `${META_PROVIDERS_DIR}/${provider}.ts`;
}

/**
 * The meta-registry TEXT relevant to a provider: the central `_metaInventory.ts`
 * PLUS the provider's barrel (when it exists). The discovery registry imports
 * ~18 providers' metas indirectly through `providers/<provider>.ts` barrels (the
 * `@/integrations/...meta` import lives there, not centrally), so detection must
 * read both or it false-negatives every barrel-backed provider.
 */
export function readMetaRegistryText(fs: FsDeps, provider: string): string {
  const central = fs.readText(META_INVENTORY_PATH);
  const barrelPath = metaBarrelPath(provider);
  const barrel = fs.exists(barrelPath) ? fs.readText(barrelPath) : "";
  return barrel ? `${central}\n${barrel}` : central;
}

/**
 * The exact throw string emitted by `app action scaffold` handlers. Detecting it
 * is an OPERATOR SAFETY check (don't register a placeholder that still throws),
 * NOT a security boundary — it deliberately recognizes only the known scaffold
 * marker and makes no attempt to prove arbitrary handlers are "implemented".
 */
export const SCAFFOLD_PLACEHOLDER_MARKER = "is not implemented yet (scaffolded placeholder";

/** True when a handler's text is the known scaffold placeholder (throws TODO). */
export function looksLikeScaffoldPlaceholder(handlerText: string): boolean {
  return handlerText.includes(SCAFFOLD_PLACEHOLDER_MARKER);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const cap = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1);

/** Optional nested subpath under `actions/` (e.g. `channels/`, `meta/`). */
const SUBPATH = "(?:[A-Za-z0-9_-]+/)*";

/**
 * Detect META registration from the discovery-inventory TEXT, anchored on the
 * import path `@/integrations/<provider>/<segment>/<…>/<base>.meta` (segment =
 * `actions` or `triggers`). Registered when that import exists AND the imported
 * symbol also appears in an array (i.e. ≥2 occurrences: the import + the array
 * entry — `ALL_ACTION_META`/`ALL_TRIGGER_META` or a barrel `<X>_*_METAS`). Empty
 * text → `unknown`. Casing-independent (anchored on the path, not the symbol).
 */
function detectMetaInSegment(
  metaInventoryText: string,
  provider: string,
  base: string,
  segment: "actions" | "triggers",
): RegistrationStatus {
  if (!metaInventoryText.trim()) return "unknown";
  const importRe = new RegExp(
    `import\\s*\\{\\s*([A-Za-z_$][\\w$]*)\\s*\\}\\s*from\\s*["']@/integrations/${escapeRe(provider)}/${segment}/${SUBPATH}${escapeRe(base)}\\.meta["']`,
  );
  const m = metaInventoryText.match(importRe);
  const sym = m?.[1];
  if (!sym) return "unregistered";
  const count = (metaInventoryText.match(new RegExp(`\\b${escapeRe(sym)}\\b`, "g")) ?? []).length;
  return count >= 2 ? "registered" : "unregistered";
}

/** Detect ACTION-meta registration (discovery `ALL_ACTION_META` / barrel `<X>_ACTION_METAS`). */
export function detectMetaRegistration(metaInventoryText: string, provider: string, base: string): RegistrationStatus {
  return detectMetaInSegment(metaInventoryText, provider, base, "actions");
}

/** Detect TRIGGER-meta registration (discovery `ALL_TRIGGER_META` / barrel `<X>_TRIGGER_METAS`). */
export function detectTriggerMetaRegistration(metaInventoryText: string, provider: string, base: string): RegistrationStatus {
  return detectMetaInSegment(metaInventoryText, provider, base, "triggers");
}

/**
 * Detect HANDLER registration from the handler-inventory TEXT, anchored on the
 * import path `@/integrations/<provider>/actions/<…>/<base>`. Registered when
 * that import exists AND its (aliased) symbol is referenced by an `ALL_HANDLERS`
 * entry (`handler: <alias>`). Empty text → `unknown`.
 */
export function detectHandlerRegistration(handlerInventoryText: string, provider: string, base: string): RegistrationStatus {
  if (!handlerInventoryText.trim()) return "unknown";
  const importRe = new RegExp(
    `import\\s*\\{\\s*([A-Za-z_$][\\w$]*)(?:\\s+as\\s+([A-Za-z_$][\\w$]*))?\\s*\\}\\s*from\\s*["']@/integrations/${escapeRe(provider)}/actions/${SUBPATH}${escapeRe(base)}["']`,
  );
  const m = handlerInventoryText.match(importRe);
  if (!m) return "unregistered";
  const alias = m[2] ?? m[1] ?? "";
  if (!alias) return "unregistered";
  return new RegExp(`handler:\\s*${escapeRe(alias)}\\b`).test(handlerInventoryText) ? "registered" : "unregistered";
}

/** Read the relevant meta registry text via `fs` and report an action's meta-registration status. */
export function metaRegistrationStatus(fs: FsDeps, provider: string, base: string): RegistrationStatus {
  return detectMetaRegistration(readMetaRegistryText(fs, provider), provider, base);
}

/** Read the relevant meta registry text via `fs` and report a trigger's meta-registration status. */
export function triggerMetaRegistrationStatus(fs: FsDeps, provider: string, base: string): RegistrationStatus {
  return detectTriggerMetaRegistration(readMetaRegistryText(fs, provider), provider, base);
}

/**
 * Where a provider's action metas are registered: its discovery barrel (when one
 * exists and exposes a `<X>_ACTION_METAS` array) or the central `ALL_ACTION_META`.
 * Returned `arrayDecl` is the array a new meta entry is appended to.
 */
export function resolveMetaRegistryTarget(fs: FsDeps, provider: string): { path: string; arrayDecl: string } {
  const barrelPath = metaBarrelPath(provider);
  if (fs.exists(barrelPath)) {
    const arr = fs.readText(barrelPath).match(/export\s+const\s+([A-Za-z0-9_$]+_ACTION_METAS)\b/);
    if (arr?.[1]) return { path: barrelPath, arrayDecl: arr[1] };
  }
  return { path: META_INVENTORY_PATH, arrayDecl: "ALL_ACTION_META" };
}

/** Read the handler inventory via `fs` and report an action's handler-registration status. */
export function handlerRegistrationStatus(fs: FsDeps, provider: string, base: string): RegistrationStatus {
  return detectHandlerRegistration(fs.readText(HANDLER_INVENTORY_PATH), provider, base);
}

/** Read the `export const <name>: ActionMeta` symbol a meta file exports (text only). */
export function readActionMetaExportName(metaText: string): string | null {
  const m = metaText.match(/export\s+const\s+([A-Za-z_$][\w$]*)\s*:\s*ActionMeta\b/);
  if (m?.[1]) return m[1];
  const m2 = metaText.match(/export\s+const\s+([A-Za-z_$][\w$]*Meta)\s*=/);
  return m2?.[1] ?? null;
}

/** Read the `export const <name>: ActionHandler` symbol a handler file exports (text only). */
export function readActionHandlerExportName(handlerText: string): string | null {
  const m = handlerText.match(/export\s+const\s+([A-Za-z_$][\w$]*)\s*:\s*ActionHandler\b/);
  return m?.[1] ?? null;
}

/** Outcome of computing a single-inventory append patch. */
export type InventoryPatch =
  | { readonly ok: true; readonly newText: string; readonly importLine: string; readonly arrayEntry: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Append one import (after the last existing matching import) + one array entry
 * (before the named array's closing `];`). Narrow + deterministic; refuses when
 * the expected anchors are absent. Mirrors registry.ts's two-point patch.
 */
function spliceInventory(
  text: string,
  opts: { importLine: string; importAnchor: RegExp; arrayDecl: string; arrayEntry: string; label: string },
): InventoryPatch {
  if (!text.trim()) return { ok: false, reason: `${opts.label} is empty or unreadable — cannot patch safely.` };

  const importMatches = [...text.matchAll(opts.importAnchor)];
  const last = importMatches[importMatches.length - 1];
  if (!last || last.index === undefined) {
    return { ok: false, reason: `${opts.label}: no anchor import line found — declined to patch.` };
  }
  const importInsertAt = last.index + last[0].length;

  const declAt = text.indexOf(opts.arrayDecl);
  if (declAt < 0) return { ok: false, reason: `${opts.label}: \`${opts.arrayDecl}\` not found — declined to patch.` };
  const openAt = text.indexOf("[", declAt);
  const closeAt = openAt >= 0 ? text.indexOf("];", openAt) : -1;
  if (openAt < 0 || closeAt < 0) return { ok: false, reason: `${opts.label}: array brackets not found — declined to patch.` };
  if (closeAt < importInsertAt) return { ok: false, reason: `${opts.label}: layout unexpected — declined to patch.` };

  // Array insertion first (higher index) keeps the import offset valid.
  const withEntry = `${text.slice(0, closeAt)}${opts.arrayEntry}\n${text.slice(closeAt)}`;
  const newText = `${withEntry.slice(0, importInsertAt)}\n${opts.importLine}${withEntry.slice(importInsertAt)}`;
  return { ok: true, newText, importLine: opts.importLine, arrayEntry: opts.arrayEntry.trim() };
}

const HANDLER_IMPORT_ANCHOR = /^import\s*\{[^}]*\}\s*from\s*["']@\/integrations\/[A-Za-z0-9_./-]+\/actions\/[A-Za-z0-9_./-]+["'];?[ \t]*$/gm;
const META_IMPORT_ANCHOR = /^import\s*\{[^}]*\}\s*from\s*["']@\/integrations\/[A-Za-z0-9_./-]+\.meta["'];?[ \t]*$/gm;

export interface HandlerPatchInput {
  readonly provider: string;
  readonly type: string;
  /** Symbol the handler file exports (`export const <exportName>: ActionHandler`). */
  readonly exportName: string;
  /** Import path under @/ without extension, e.g. `slack/actions/sendMessage`. */
  readonly handlerImportPath: string;
}

/** Compute the handler-inventory patch (import alias + ALL_HANDLERS entry). */
export function buildHandlerInventoryPatch(text: string, input: HandlerPatchInput): InventoryPatch {
  const alias = `${camelCaseId(input.provider)}${cap(input.exportName)}`;
  const importLine = `import { ${input.exportName} as ${alias} } from "@/integrations/${input.handlerImportPath}";`;
  const arrayEntry = `  { provider: "${input.provider}", type: "${input.type}", handler: ${alias} },`;
  return spliceInventory(text, {
    importLine,
    importAnchor: HANDLER_IMPORT_ANCHOR,
    arrayDecl: "ALL_HANDLERS",
    arrayEntry,
    label: HANDLER_INVENTORY_PATH,
  });
}

export interface MetaPatchInput {
  /** Symbol the meta file exports (`export const <metaExport>: ActionMeta`). */
  readonly metaExport: string;
  /** Import path under @/ without extension, e.g. `slack/actions/sendMessage.meta`. */
  readonly metaImportPath: string;
  /** Array the entry is appended to (central `ALL_ACTION_META` or a barrel `<X>_ACTION_METAS`). */
  readonly arrayDecl: string;
  /** Repo-relative path of the file being patched (central inventory or a barrel) — for messages. */
  readonly label: string;
}

/** Compute the meta-inventory patch (import + entry into the target metas array). */
export function buildMetaInventoryPatch(text: string, input: MetaPatchInput): InventoryPatch {
  const importLine = `import { ${input.metaExport} } from "@/integrations/${input.metaImportPath}";`;
  const arrayEntry = `  ${input.metaExport},`;
  return spliceInventory(text, {
    importLine,
    importAnchor: META_IMPORT_ANCHOR,
    arrayDecl: input.arrayDecl,
    arrayEntry,
    label: input.label,
  });
}
