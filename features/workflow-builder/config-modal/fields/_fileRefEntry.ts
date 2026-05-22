/**
 * Pure helpers for parsing / validating / labelling FileRef-backed
 * builder values. Shared between `FileField` (Slice 3.25, single value)
 * and `FileRefArrayField` (Slice 3.21/3.22, array value) so both
 * renderers stay in lockstep on what counts as a valid token / a
 * parseable FileRef literal / a dedup key / a chip label.
 *
 * Pure module — no React, no DOM, no logging, no fetch.
 *
 * Plan reference: docs/slices/phase-3/single-file-ref-metadata-plan.md
 * decision D-SFR-4.
 *
 * The on-disk value shape for a FileRef-backed builder field is one
 * of:
 *   - a canonical `{{nodeId.path}}` token STRING (variable reference
 *     resolved to an upstream FileRef-typed output at execute time),
 *   - a strict `FileRefSchema` OBJECT (paste-text literal — power-user
 *     escape hatch), or
 *   - `undefined` (untouched optional field — the renderer MUST never
 *     manufacture `[]` / `null` / object literals at mount).
 *
 * `string-typed-as-token` is intentionally narrower than "any string":
 * we accept ONLY tokens whose parsed shape collapses back to the
 * original literal (so partial / multi / surrounded tokens fail). This
 * mirrors the discipline the resolver applies at execute time.
 */

import { FileRefSchema, type FileRef } from "@/contracts/file";
import { parseReferences } from "@/core/workflows/variableReferences";

/**
 * True when `trimmed` is exactly one `{{nodeId.path}}` token and
 * nothing else. Permissively rejects malformed input (delegated to
 * `parseReferences` which is itself permissive).
 *
 * Whitespace handling is the CALLER's responsibility — pass an already-
 * trimmed string. Returning `false` for surrounding whitespace would
 * be unhelpful here because the renderer wants to surface the trim
 * separately.
 */
export function isExactToken(trimmed: string): boolean {
  if (!trimmed.startsWith("{{") || !trimmed.endsWith("}}")) return false;
  const refs = parseReferences(trimmed);
  if (refs.length !== 1) return false;
  return refs[0]!.token === trimmed;
}

/**
 * Best-effort parse of a paste-text input into a `FileRef`. Returns
 * `null` on any failure (not-JSON, JSON-but-not-an-object, JSON-but-
 * fails FileRefSchema). Never throws.
 *
 * The prefix check (`{` / `}`) avoids paying `JSON.parse` cost on
 * inputs that obviously aren't object literals.
 */
export function tryParseFileRef(trimmed: string): FileRef | null {
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const result = FileRefSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

/**
 * Canonical comparison key for dedup. Tokens compare by literal;
 * FileRef objects compare by canonical-JSON of the validated object.
 * `JSON.stringify` is stable enough on a strict, validated FileRef
 * shape (Zod strict-arms have a fixed set of keys, no extras to vary
 * order).
 *
 * The `t:` / `f:` prefixes prevent the (vanishingly rare) collision of
 * a stringified FileRef matching a token literal — defense in depth.
 */
export function entryKey(value: string | FileRef): string {
  if (typeof value === "string") return `t:${value}`;
  return `f:${JSON.stringify(value)}`;
}

/**
 * Display label for a chip. Tokens render as their literal form
 * (intentional — authors copy/paste tokens between fields and need
 * to see them verbatim). FileRef objects render as their `name`
 * field, which is the file's stable display name from the upstream
 * producer (e.g. `report.pdf`). Never surfaces `url` / `storagePath`
 * — those are transport details and not safe to render by default
 * (signed-URL leakage, etc.).
 */
export function entryLabel(value: string | FileRef): string {
  if (typeof value === "string") return value;
  return value.name;
}

/**
 * Coerce an opaque builder value into a clean `Array<string | FileRef>`
 * (used by `file-array`). The renderer ingests this on every render
 * to:
 *   - filter out malformed entries (a stale workflow JSON edit that
 *     introduced an invalid token / FileRef shape),
 *   - keep itself crash-free against any prop shape,
 *   - never invent values that weren't in the input array.
 *
 * Non-array input collapses to `[]`. Per-entry rules:
 *   - strings: must be valid `isExactToken` results (after trim);
 *     otherwise dropped.
 *   - objects: must parse against `FileRefSchema`; otherwise dropped.
 *   - everything else (numbers, null, booleans, …): dropped.
 */
export function coerceFileRefArray(value: unknown): Array<string | FileRef> {
  if (!Array.isArray(value)) return [];
  const out: Array<string | FileRef> = [];
  for (const raw of value) {
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed.length > 0 && isExactToken(trimmed)) {
        out.push(trimmed);
      }
      continue;
    }
    if (raw && typeof raw === "object") {
      const parsed = FileRefSchema.safeParse(raw);
      if (parsed.success) out.push(parsed.data);
    }
  }
  return out;
}

/**
 * Coerce an opaque builder value into a single `string | FileRef`
 * (used by `file`). Mirrors `coerceFileRefArray` per-entry rules but
 * for the single-value case:
 *   - string + `isExactToken` → string token.
 *   - object + `FileRefSchema` parse → FileRef.
 *   - everything else (including the empty string) → `undefined`.
 *
 * The renderer can compare `(value, coerced)` and decide whether the
 * incoming prop is renderable as-is or should be treated as empty.
 * The renderer MUST NOT call `onChange` on mount even when coercion
 * differs from the raw value — the parent's draft already holds the
 * raw value, and emitting a normalized one would mask a real
 * upstream-producer bug.
 */
export function coerceSingleFileRef(value: unknown): string | FileRef | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    return isExactToken(trimmed) ? trimmed : undefined;
  }
  if (value && typeof value === "object") {
    const parsed = FileRefSchema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
  }
  return undefined;
}
