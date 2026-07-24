import { resolveValueAtPath } from "./resolveValueAtPath";

/**
 * Sample resolution for "Suggest fields" (AI-PROVIDER-7 CS-7).
 *
 * The schema editor needs a REAL sample of the author's data to propose
 * fields from. At config time the node's document input is usually still a
 * `{{step.path}}` token — the file only exists once the workflow has run —
 * so this resolves, in order:
 *
 *   1. a LITERAL value saved in the node's own config (a pasted FileRef, or
 *      text the author typed), which needs no run at all; or
 *   2. the value that token pointed at in the workflow's most recent test
 *      run, read from the same `latestValuesBySource` map the variable
 *      picker already renders previews from.
 *
 * PURE — no I/O. The caller supplies the config and the latest-run map; the
 * server route owns loading them under its own authorization rules. Keeping
 * this pure is what lets the builder and the route agree on "is there a
 * sample yet?" without a round trip.
 */

/** A single `{{ ... }}` template and nothing else. */
const SINGLE_TOKEN = /^\s*\{\{\s*([^{}]+?)\s*\}\}\s*$/;

export type SuggestionSampleSource = "config_literal" | "latest_run";

export type SuggestionSampleResolution =
  | {
      readonly ok: true;
      readonly value: unknown;
      readonly source: SuggestionSampleSource;
      /** The `{{...}}` path the sample came from, when it came from a run. */
      readonly path?: string;
    }
  | { readonly ok: false; readonly reason: SuggestionSampleFailure };

/**
 * Why no sample is available. Each maps to one piece of author-facing copy —
 * the point is telling the author what to DO, not that something failed.
 */
export type SuggestionSampleFailure =
  | "no_input" // the document/data field is empty
  | "no_run_yet" // it points at a step that has no recent value
  | "empty_value"; // the step ran but produced nothing at that path

/** Read the single `{{path}}` a template holds, or `null` if it isn't one. */
export function readSingleTemplatePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = SINGLE_TOKEN.exec(value);
  return match?.[1] ?? null;
}

export interface ResolveSuggestionSampleInput {
  /** The node's saved config. */
  readonly config: Readonly<Record<string, unknown>>;
  /** Name of the field holding the document / data input. */
  readonly sampleSourceField: string;
  /** `sourceId → latest run output`, from `buildLatestValuesBySource`. */
  readonly latestValuesBySource: Readonly<Record<string, unknown>>;
}

export function resolveSuggestionSample(
  input: ResolveSuggestionSampleInput,
): SuggestionSampleResolution {
  const raw = input.config[input.sampleSourceField];

  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
    return { ok: false, reason: "no_input" };
  }

  const path = readSingleTemplatePath(raw);
  if (path === null) {
    // A literal the author saved (pasted FileRef object, typed text, or a
    // string with surrounding prose — the classifier downstream judges it).
    return { ok: true, value: raw, source: "config_literal" };
  }

  // `{{nodeId.rest.of.path}}` — the first segment names the source step.
  const firstDot = path.indexOf(".");
  const sourceId = firstDot === -1 ? path : path.slice(0, firstDot);
  const rest = firstDot === -1 ? "" : path.slice(firstDot + 1);

  if (!Object.prototype.hasOwnProperty.call(input.latestValuesBySource, sourceId)) {
    return { ok: false, reason: "no_run_yet" };
  }
  const resolved = resolveValueAtPath(input.latestValuesBySource[sourceId], rest);
  if (!resolved.found || resolved.value === null) {
    return { ok: false, reason: "empty_value" };
  }
  return { ok: true, value: resolved.value, source: "latest_run", path };
}

/** Author-facing copy for each failure. One sentence, always actionable. */
export const SUGGESTION_SAMPLE_MESSAGES: Readonly<
  Record<SuggestionSampleFailure, string>
> = {
  no_input:
    "Pick the document or data for this step first — ChainReact reads it to suggest fields.",
  no_run_yet:
    "Test this workflow once so ChainReact has a real example to read, then try again.",
  empty_value:
    "The last test run didn't produce anything at that step. Run it again with real data, then try again.",
};
