/**
 * Internal ChainReact CLI — `app action register <provider> <action>` command.
 *
 * Wires an IMPLEMENTED action's handler + meta into the app's two hand-maintained
 * inventories:
 *   - handler → services/execution/handlers/_handlerInventory.ts (ALL_HANDLERS)
 *   - meta    → services/discovery/_metaInventory.ts (ALL_ACTION_META) OR the
 *               provider's discovery barrel services/discovery/providers/<id>.ts
 *               (`<X>_ACTION_METAS`) when the provider uses that layout.
 *
 * Safety:
 *   - Requires the full triad (handler + schema + meta) to exist on disk.
 *   - REFUSES if the handler still looks like the `app action scaffold`
 *     placeholder (it throws "not implemented") — operator-safety, NOT a security
 *     boundary; implement the handler first.
 *   - No-ops cleanly when already registered.
 *   - Patches are NARROW + deterministic (append import + array entry) and REFUSE
 *     (writing nothing) when an inventory's anchors are missing/unreadable —
 *     printing manual instructions instead of risking a malformed edit.
 *
 * Writes go through the injectable `FsWriter`; reads/validation stay
 * filesystem/text-safe (no provider runtime imported). Pure + testable.
 */
import {
  buildHandlerInventoryPatch,
  buildMetaInventoryPatch,
  detectHandlerRegistration,
  detectMetaRegistration,
  HANDLER_INVENTORY_PATH,
  type InventoryPatch,
  looksLikeScaffoldPlaceholder,
  readActionHandlerExportName,
  readActionMetaExportName,
  readMetaRegistryText,
  resolveMetaRegistryTarget,
} from "../actionRegistry";
import { scanField } from "../providers";
import type { FsDeps, FsWriter } from "../repo";
import { normalizeActionId } from "./appActionScaffold";
import { normalizeProviderId, overlayFs } from "./appScaffold";
import { renderValidation, validateProvider } from "./appValidate";

export interface ActionRegisterOptions {
  readonly dryRun: boolean;
}

export interface ActionRegisterOutcome {
  readonly code: number;
  readonly output: string;
}

const stripImportPath = (repoRelPath: string): string => repoRelPath.replace(/^integrations\//, "").replace(/\.ts$/, "");

/** Locate the meta file for an action basename (sibling or actions/meta/ subfolder). */
function findMetaPath(fs: FsDeps, provider: string, base: string): string | null {
  const sibling = `integrations/${provider}/actions/${base}.meta.ts`;
  if (fs.exists(sibling)) return sibling;
  const sub = `integrations/${provider}/actions/meta/${base}.meta.ts`;
  if (fs.exists(sub)) return sub;
  return null;
}

/**
 * Orchestrate `app action register`. Reads + validation via `fs`; the (1–2)
 * inventory writes via `writer` (skipped on dry-run). Returns exit code + output.
 */
export function runAppActionRegister(
  rawProvider: string,
  rawAction: string,
  opts: ActionRegisterOptions,
  fs: FsDeps,
  writer: FsWriter,
): ActionRegisterOutcome {
  const np = normalizeProviderId(rawProvider);
  if (!np.ok) return { code: 2, output: `Error: ${np.error}` };
  const provider = np.id;

  if (!fs.exists(`integrations/${provider}/manifest.ts`)) {
    return { code: 2, output: `Error: integrations/${provider}/manifest.ts does not exist — unknown provider. Create it with \`chainreact app scaffold ${provider}\` first.` };
  }

  const a = normalizeActionId(rawAction);
  if (!a.ok) return { code: 2, output: `Error: ${a.error}` };
  const base = a.base;

  // Triad must exist (handler + schema in actions/; meta sibling or actions/meta/).
  const handlerPath = `integrations/${provider}/actions/${base}.ts`;
  const schemaPath = `integrations/${provider}/actions/${base}.schema.ts`;
  const metaPath = findMetaPath(fs, provider, base);
  const missing: string[] = [];
  if (!fs.exists(handlerPath)) missing.push(`${base}.ts`);
  if (!fs.exists(schemaPath)) missing.push(`${base}.schema.ts`);
  if (!metaPath) missing.push(`${base}.meta.ts`);
  if (missing.length > 0) {
    return {
      code: 2,
      output: `Error: ${provider} action '${base}' is incomplete — missing ${missing.join(", ")}. Scaffold it first with \`chainreact app action scaffold ${provider} ${a.type}\`, then implement it.`,
    };
  }

  // Operator-safety: never register the scaffold placeholder (still throws).
  const handlerText = fs.readText(handlerPath);
  if (looksLikeScaffoldPlaceholder(handlerText)) {
    return {
      code: 2,
      output: `Error: ${provider} action '${base}' is still a scaffold placeholder (its handler throws "not implemented"). Implement ${handlerPath} before registering it.`,
    };
  }

  const metaText = fs.readText(metaPath as string);
  const metaExport = readActionMetaExportName(metaText);
  const handlerExport = readActionHandlerExportName(handlerText) ?? base;
  const type = scanField(metaText, "type") ?? a.type;
  if (!metaExport) {
    return { code: 2, output: `Error: could not read an \`export const … : ActionMeta\` from ${metaPath} — cannot determine the symbol to register.` };
  }

  // Current registration (handler inventory is single-file; meta may live in a barrel).
  const handlerInvText = fs.readText(HANDLER_INVENTORY_PATH);
  const handlerStatus = detectHandlerRegistration(handlerInvText, provider, base);
  const metaStatus = detectMetaRegistration(readMetaRegistryText(fs, provider), provider, base);

  if (handlerStatus === "registered" && metaStatus === "registered") {
    return { code: 0, output: [`ChainReact — app action register: ${provider}:${type}`, "", "Already registered (handler + meta) — nothing to do."].join("\n") };
  }

  // Compute the needed patches up-front so we can refuse before any write.
  const planned: { label: string; path: string; patch: InventoryPatch }[] = [];
  const overlayFiles: { path: string; content: string }[] = [];
  const refusals: string[] = [];

  if (handlerStatus !== "registered") {
    if (handlerStatus === "unknown") {
      refusals.push(`${HANDLER_INVENTORY_PATH} is unreadable — cannot patch the handler registry.`);
    } else {
      const patch = buildHandlerInventoryPatch(handlerInvText, {
        provider,
        type,
        exportName: handlerExport,
        handlerImportPath: stripImportPath(handlerPath),
      });
      if (!patch.ok) refusals.push(patch.reason);
      else {
        planned.push({ label: "handler", path: HANDLER_INVENTORY_PATH, patch });
        overlayFiles.push({ path: HANDLER_INVENTORY_PATH, content: patch.newText });
      }
    }
  }

  if (metaStatus !== "registered") {
    if (metaStatus === "unknown") {
      refusals.push(`The discovery meta registry is unreadable — cannot patch the meta registry.`);
    } else {
      const target = resolveMetaRegistryTarget(fs, provider);
      const targetText = fs.readText(target.path);
      const patch = buildMetaInventoryPatch(targetText, {
        metaExport,
        metaImportPath: stripImportPath(metaPath as string),
        arrayDecl: target.arrayDecl,
        label: target.path,
      });
      if (!patch.ok) refusals.push(patch.reason);
      else {
        planned.push({ label: "meta", path: target.path, patch });
        overlayFiles.push({ path: target.path, content: patch.newText });
      }
    }
  }

  if (refusals.length > 0) {
    return {
      code: 2,
      output: [
        `ChainReact — app action register: ${provider}:${type}`,
        "",
        "Error: cannot patch the registries safely — wrote nothing.",
        ...refusals.map((r) => `  - ${r}`),
        "",
        "Add the wiring by hand:",
        `  handler → ${HANDLER_INVENTORY_PATH}: import + ALL_HANDLERS entry { provider: "${provider}", type: "${type}", handler }`,
        `  meta    → ${resolveMetaRegistryTarget(fs, provider).path}: import { ${metaExport} } + array entry`,
      ].join("\n"),
    };
  }

  // Predicted validation against the patched overlay — the action should now be
  // registered (no ACTION_*_NOT_REGISTERED warning for it).
  const predicted = validateProvider(provider, overlayFs(fs, overlayFiles));

  const lines: string[] = [`ChainReact — app action register: ${provider}:${type}${opts.dryRun ? " (dry-run)" : ""}`, ""];
  lines.push(`Registry edits ${opts.dryRun ? "that would be applied" : "applied"} (${planned.length}):`);
  for (const p of planned) {
    if (!p.patch.ok) continue; // type-narrow (already filtered)
    lines.push(`  ${p.path} (${p.label}):`);
    lines.push(`    + ${p.patch.importLine}`);
    lines.push(`    + ${p.patch.arrayEntry}`);
  }
  lines.push("");

  if (!opts.dryRun) {
    for (const p of planned) {
      if (p.patch.ok) writer.writeFile(p.path, p.patch.newText);
    }
  }

  lines.push("Validation (predicted from the patched registries):");
  lines.push(...renderValidation(predicted).split("\n").map((l) => `  ${l}`));
  lines.push("");
  lines.push("Registration wires the action into the builder/AI (meta) and execution (handler). It does NOT enable the provider or run anything.");

  return { code: predicted.ok ? 0 : 1, output: lines.join("\n") };
}
