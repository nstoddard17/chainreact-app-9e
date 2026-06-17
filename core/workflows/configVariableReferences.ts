/**
 * Pure collector for ALL `{{nodeId.path}}` variable references in a node's
 * config (Slice 4.BUILDER-DATA-MAP-MVP-1).
 *
 * Sibling to `findInvalidVariableReferences` (which returns only the BROKEN
 * subset) — this returns every reference so the top-level Data Map can show
 * authors which upstream data each step consumes ("Uses variables"). Both
 * delegate tokenization to the same `parseReferences` parser the field
 * validator + patch validator use, so they can never disagree on what a
 * reference IS.
 *
 * Scope (deliberately identical to `findInvalidVariableReferences`): scans
 * TOP-LEVEL config keys whose value is a string or an array of strings. Deep-
 * nested refs (keyvalue maps, router routes) are out of scope for this slice —
 * matching the broken-ref detector keeps the two honest about the same surface.
 *
 * Pure: no registry, no I/O, no model. Friendly source-label resolution + safe
 * display happen in the builder layer that consumes this (never the raw node id
 * / token).
 */

import { parseReferences } from "./variableReferences";

/** Minimal node shape — satisfied by `WorkflowDefinition` nodes and the AI graph view. */
export interface ConfigRefScanNode {
  readonly id: string;
  readonly config: Record<string, unknown>;
}

export interface ConfigVariableReference {
  /** Id of the node whose config holds the reference. */
  readonly nodeId: string;
  /** Top-level config key holding it. */
  readonly fieldKey: string;
  /** The `{{...}}` token exactly as written — carries a node id, NOT for raw display. */
  readonly token: string;
  /** The referenced source id segment (`"trigger"` alias or an upstream node id). */
  readonly sourceId: string;
  /** Dotted path of the reference (empty for a whole-node `{{nodeId}}` token). */
  readonly refPath: string;
}

/** Top-level config values we scan: a string, or an array's string elements. */
function configStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return [];
}

/**
 * Return every variable reference across one node's top-level config, in field
 * + source order. Empty when the node's config holds no references.
 */
export function collectConfigVariableReferences(
  node: ConfigRefScanNode,
): ConfigVariableReference[] {
  const out: ConfigVariableReference[] = [];
  for (const [fieldKey, value] of Object.entries(node.config ?? {})) {
    for (const str of configStrings(value)) {
      for (const ref of parseReferences(str)) {
        out.push({
          nodeId: node.id,
          fieldKey,
          token: ref.token,
          sourceId: ref.nodeId,
          refPath: ref.path,
        });
      }
    }
  }
  return out;
}
