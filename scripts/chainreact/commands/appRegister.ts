/**
 * Internal ChainReact CLI — `app register <provider>` command.
 *
 * Wires an EXISTING provider manifest into integrations/_registry.ts (the
 * complement to `app scaffold`, which only creates the manifest, and to
 * `app scaffold --register`, which scaffolds + registers a NEW provider). It:
 *   - requires integrations/<id>/manifest.ts to already exist (refuses unknown dirs),
 *   - no-ops cleanly if the provider is already registered,
 *   - applies a NARROW, deterministic two-line registry patch (1 import + 1
 *     ALL_MANIFESTS entry) via the shared `buildRegistryPatch`,
 *   - refuses (writes nothing) if the registry format can't be patched safely,
 *   - supports `--dry-run` (prints the patch, writes nothing).
 *
 * Registration does NOT enable the app — it only makes the manifest load. The
 * registry write is the ONLY mutation; reads/validation stay filesystem/text-safe.
 */
import {
  buildRegistryPatch,
  readManifestExportName,
  REGISTRY_PATH,
  registrationStatus,
  registryExportName,
} from "../registry";
import type { FsDeps, FsWriter } from "../repo";
import { normalizeProviderId, overlayFs } from "./appScaffold";
import { renderValidation, validateProvider } from "./appValidate";

export interface RegisterOptions {
  readonly dryRun: boolean;
}

export interface RegisterOutcome {
  readonly code: number;
  readonly output: string;
}

/**
 * Orchestrate `app register`. Reads + validation via `fs`; the single registry
 * write via `writer` (skipped on dry-run). Returns an exit code + rendered output.
 */
export function runAppRegister(rawId: string, opts: RegisterOptions, fs: FsDeps, writer: FsWriter): RegisterOutcome {
  const norm = normalizeProviderId(rawId);
  if (!norm.ok) return { code: 2, output: `Error: ${norm.error}` };
  const id = norm.id;

  const manifestPath = `integrations/${id}/manifest.ts`;
  if (!fs.exists(manifestPath)) {
    return {
      code: 2,
      output: `Error: ${manifestPath} does not exist — \`app register\` only wires an EXISTING provider. To create a new one use \`chainreact app scaffold ${id}\` (add --register to wire it in the same run).`,
    };
  }

  // Already registered → clean no-op (exit 0).
  if (registrationStatus(fs, id) === "registered") {
    return {
      code: 0,
      output: [
        `ChainReact — app register: ${id}`,
        "",
        `Already registered in ${REGISTRY_PATH} — nothing to do.`,
      ].join("\n"),
    };
  }

  // Use the symbol the manifest ACTUALLY exports (casing diverges from the id),
  // falling back to the id-derived name only if the export can't be read.
  const exportName = readManifestExportName(fs.readText(manifestPath)) ?? registryExportName(id);
  const patch = buildRegistryPatch(fs.readText(REGISTRY_PATH), id, exportName);
  if (!patch.ok) {
    return {
      code: 2,
      output: [
        `ChainReact — app register: ${id}`,
        "",
        `Error: cannot patch the registry safely — ${patch.reason}`,
        "Nothing was written. Add the wiring by hand:",
        `  import { ${exportName} } from "./${id}/manifest";`,
        `  // ...then add \`${exportName},\` to the ALL_MANIFESTS array.`,
      ].join("\n"),
    };
  }

  // patch.ok && not alreadyRegistered (we checked status above): apply the patch.
  const patchedFile = { path: REGISTRY_PATH, content: patch.newText };
  // Predict validation against the patched-registry overlay (identical for
  // dry-run and a real write) — the registry-wiring warning should now be gone.
  const predicted = validateProvider(id, overlayFs(fs, [patchedFile]));

  const lines: string[] = [
    `ChainReact — app register: ${id}${opts.dryRun ? " (dry-run)" : ""}`,
    "",
    `Registry patch ${opts.dryRun ? "that would be applied" : "applied"} to ${REGISTRY_PATH} (deterministic, appended):`,
    `  + ${patch.importLine}`,
    `  + ${patch.arrayEntry}   // into ALL_MANIFESTS`,
    "",
  ];

  if (!opts.dryRun) {
    writer.writeFile(REGISTRY_PATH, patch.newText);
  }

  lines.push("Validation (predicted from the patched registry):");
  lines.push(...renderValidation(predicted).split("\n").map((l) => `  ${l}`));
  lines.push("");
  lines.push(
    "Registration only makes the manifest LOAD — it does not enable the app. isEnabled and real actions/triggers are still up to you.",
  );

  return { code: predicted.ok ? 0 : 1, output: lines.join("\n") };
}
