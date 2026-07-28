/**
 * Friendly, user-facing rendering of `{{nodeId.path}}` variable tokens
 * (REACT-AGENT-FRIENDLY-VARIABLE-DISPLAY-1).
 *
 * A `{{...}}` token is ENGINE syntax. It carries a raw node id and a dotted path, and it exists so
 * the runtime resolver can substitute a value at execute time. It is not a name, and the project
 * already treats it as unfit for primary display — the Data Map's contract is "the PRIMARY variable
 * display is a friendly `Step N → path` label; the raw engine token sits behind a Show-token
 * toggle", and `configVariableReferences` documents its token field as "NOT for raw display".
 *
 * What was missing is a SHARED formatter, so the React agent's own surfaces (which list the
 * variables a proposed step will consume) kept printing the raw token. This module is that
 * formatter, and it deliberately matches the Data Map's established shape so the two never drift:
 *
 *     {{trigger.customer.email}}   →   Trigger → customer.email
 *     {{n_4f2a.messageId}}         →   Send Channel Message → messageId
 *     {{n_unknown.id}}             →   Earlier step → id
 *
 * Resolution never falls back to the raw node id. An unresolvable source renders as the neutral
 * "Earlier step", exactly as `sourceLabelFor` does in the Data Map — a UUID on screen is noise the
 * author cannot act on, and node ids are system identity, not labels.
 *
 * Pure and provider-neutral: no React, no I/O, no registry, no model. Callers supply the id → label
 * map they already hold (the config diff's node labels, the preview's steps, the graph). Tokenizing
 * is delegated to the same `parseReferences` the picker, the field validator, and the patch
 * validator use, so this can never disagree with them about what a reference IS.
 */

import { parseReferences } from "./variableReferences";

/** The `trigger` alias the runtime resolver accepts in place of the trigger node's real id. */
const TRIGGER_ALIAS = "trigger";

/** What an unresolvable source renders as. Never a raw node id. */
const UNKNOWN_SOURCE_LABEL = "Earlier step";

/** Default label for the trigger alias when the caller supplies no better one. */
const TRIGGER_LABEL = "Trigger";

/** Separator between the source and its path — matches the Data Map's produced-field rows. */
const PATH_SEPARATOR = " → ";

export interface VariableTokenDisplay {
  /** The raw `{{...}}` token exactly as written. For copy / a Show-token affordance — not a label. */
  readonly token: string;
  /** Friendly source: the caller's label, "Trigger", or "Earlier step". NEVER a raw node id. */
  readonly sourceLabel: string;
  /** Dotted path inside the source's data. Empty when the token references the whole source. */
  readonly path: string;
  /** The display string: `Trigger → customer.email`, or just the source when there is no path. */
  readonly text: string;
  /** False when the source id resolved to neither the trigger alias nor a supplied label. */
  readonly resolved: boolean;
}

/**
 * Source labels keyed by node id. The `trigger` alias resolves from this map first (so a caller
 * that knows the trigger's real display name can use it), then falls back to "Trigger".
 */
export type VariableSourceLabels = Readonly<Record<string, string>>;

function labelFor(sourceId: string, sources?: VariableSourceLabels): { label: string; resolved: boolean } {
  const supplied = sources?.[sourceId]?.trim();
  if (supplied) return { label: supplied, resolved: true };
  if (sourceId === TRIGGER_ALIAS) return { label: TRIGGER_LABEL, resolved: true };
  return { label: UNKNOWN_SOURCE_LABEL, resolved: false };
}

/**
 * Describe ONE token. A string that is not a parseable reference yields `resolved: false` with the
 * input echoed as `text`, so a caller can render it verbatim rather than showing a broken label.
 */
export function describeVariableToken(
  token: string,
  sources?: VariableSourceLabels,
): VariableTokenDisplay {
  const [ref] = parseReferences(token);
  if (!ref) {
    return { token, sourceLabel: "", path: "", text: token, resolved: false };
  }
  const { label, resolved } = labelFor(ref.nodeId, sources);
  return {
    token: ref.token,
    sourceLabel: label,
    path: ref.path,
    text: ref.path ? `${label}${PATH_SEPARATOR}${ref.path}` : label,
    resolved,
  };
}

/** True when the value is a string carrying at least one parseable `{{...}}` reference. */
export function containsVariableToken(value: unknown): boolean {
  return parseReferences(value).length > 0;
}

/**
 * Replace every `{{...}}` reference INSIDE a larger string with its friendly form, leaving the
 * surrounding text untouched:
 *
 *     "New order from {{trigger.customer.name}}"  →  "New order from Trigger → customer.name"
 *
 * Non-string input and strings with no references are returned unchanged (stringified), so this is
 * safe to apply blanket-style to any displayed config value. Replacement walks the parser's
 * offsets rather than doing a regex pass, so malformed tokens the parser skips stay verbatim
 * instead of being mangled.
 */
export function humanizeVariableTokens(value: unknown, sources?: VariableSourceLabels): string {
  if (typeof value !== "string") return String(value);
  const refs = parseReferences(value);
  if (refs.length === 0) return value;
  let out = "";
  let cursor = 0;
  for (const ref of refs) {
    out += value.slice(cursor, ref.offset);
    out += describeVariableToken(ref.token, sources).text;
    cursor = ref.offset + ref.token.length;
  }
  return out + value.slice(cursor);
}
