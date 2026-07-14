/**
 * Schema-drift detection for pinned MCP tools.
 *
 * Eden states its tool catalog changes regularly, and V2 pins an explicitly certified
 * set. Before invoking a pinned tool with V2-shaped arguments, the caller compares the
 * server's live `inputSchema` against the schema captured at certification time. If the
 * set of properties or the required set changed in a way that could make our arguments
 * wrong, we REFUSE (McpSchemaDriftError) rather than send uncertified args.
 *
 * This is a deliberately shallow, dependency-free structural comparison (top-level
 * `properties` keys + `required` list) — enough to catch renamed/removed/newly-required
 * fields, which are the drifts that break a pinned call. Deep JSON-Schema equality is
 * intentionally out of scope (too brittle; the certified allow-list is the real guard).
 */

function topLevelPropertyNames(schema: Record<string, unknown>): string[] {
  const props = schema.properties;
  if (!props || typeof props !== "object") return [];
  return Object.keys(props as Record<string, unknown>).sort();
}

function requiredNames(schema: Record<string, unknown>): string[] {
  const req = schema.required;
  if (!Array.isArray(req)) return [];
  return req.filter((r): r is string => typeof r === "string").sort();
}

export interface SchemaDriftResult {
  readonly drifted: boolean;
  /** Human-safe reason (no values) when drifted; empty string otherwise. */
  readonly reason: string;
}

/**
 * Compare a pinned/certified input schema to the live one. `drifted: true` when a
 * property present at certification is gone, or a field became newly required — both
 * can make a previously-valid pinned call invalid. NEW optional properties do NOT count
 * as breaking drift (they're additive; our args stay valid), but are noted.
 */
export function detectSchemaDrift(
  pinned: Record<string, unknown>,
  live: Record<string, unknown>,
): SchemaDriftResult {
  const pinnedProps = new Set(topLevelPropertyNames(pinned));
  const liveProps = new Set(topLevelPropertyNames(live));

  const removed = [...pinnedProps].filter((p) => !liveProps.has(p));
  if (removed.length > 0) {
    return { drifted: true, reason: `removed field(s): ${removed.join(", ")}` };
  }

  const pinnedReq = new Set(requiredNames(pinned));
  const newlyRequired = requiredNames(live).filter((r) => !pinnedReq.has(r));
  if (newlyRequired.length > 0) {
    return { drifted: true, reason: `newly-required field(s): ${newlyRequired.join(", ")}` };
  }

  return { drifted: false, reason: "" };
}
