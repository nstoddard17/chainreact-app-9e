/**
 * React Agent audit recorder — live implementation (REACT-AGENT-CS-5C-AUDIT-RECORDER).
 *
 * Maps a `ReactAgentAuditRecorderInput` onto the repository insert shape and
 * appends one row to `react_agent_audit_events` (service-role, via the repo).
 * STORAGE-WIRING ONLY: nothing in the runtime calls this yet — CS-5d injects a
 * recorder into `runAuthorizedCapability` and emits for read-only Q&A/Explain
 * outcomes. This module deliberately:
 *   - runs `metadata` through the SHARED `sanitizeAiEventMetadata` denylist
 *     (reused from `ai_cost_events`, not a second sanitizer) and coerces any
 *     non-object metadata to `{}`, so a scalar/array can never reach the DB;
 *   - caps the safe reason / opaque-ref strings to the ledger's CHECK lengths so
 *     a slightly-oversized value is truncated rather than losing the audit row;
 *   - FAILS OPEN — a repository/DB error is swallowed so audit emission can never
 *     break the agent/user path (the repository itself still throws; the recorder
 *     is the fail-open boundary above it).
 */

import { insertAuditEvent } from "@/repositories/reactAgentAuditEvents";
import { sanitizeAiEventMetadata } from "@/services/billing/aiCostEvents";
import type {
  ReactAgentAuditRecorder,
  ReactAgentAuditRecorderInput,
} from "./types";

// Mirror the `react_agent_audit_text_len_chk` caps so a too-long safe string is
// truncated (still persisted) rather than rejected by the CHECK (→ row lost).
const MAX_REASON_LEN = 128;
const MAX_REF_LEN = 256;

function capString(value: string | null | undefined, max: number): string | null {
  if (typeof value !== "string") return null;
  return value.length > max ? value.slice(0, max) : value;
}

/** Coerce to a plain object so a scalar/array never reaches `jsonb_typeof = object`. */
function toPlainObject(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

/** Injectable seams (tests pass a mock `insert`; default = the real repo + sanitizer). */
export interface ReactAgentAuditRecorderDeps {
  readonly insert?: typeof insertAuditEvent;
  readonly sanitize?: typeof sanitizeAiEventMetadata;
}

/**
 * Build a live recorder. Defaults wire the real service-role repository insert
 * and the shared metadata sanitizer; tests inject a mock `insert` to assert the
 * mapped shape or force the fail-open path.
 */
export function createReactAgentAuditRecorder(
  deps: ReactAgentAuditRecorderDeps = {},
): ReactAgentAuditRecorder {
  const insert = deps.insert ?? insertAuditEvent;
  const sanitize = deps.sanitize ?? sanitizeAiEventMetadata;
  return {
    async record(input: ReactAgentAuditRecorderInput): Promise<void> {
      try {
        await insert({
          accountId: input.accountId,
          actorUserId: input.actorUserId,
          workflowId: input.workflowId ?? null,
          conversationId: capString(input.conversationId, MAX_REF_LEN),
          capabilityId: input.capabilityId,
          intent: input.intent,
          mode: input.mode,
          creditFeature: input.creditFeature ?? null,
          auditKind: input.auditKind,
          outcome: input.outcome,
          reason: capString(input.reason, MAX_REASON_LEN),
          proposedPatchRef: capString(input.proposedPatchRef, MAX_REF_LEN),
          approvalId: capString(input.approvalId, MAX_REF_LEN),
          aiCostEventId: input.aiCostEventId ?? null,
          metadata: sanitize(toPlainObject(input.metadata)),
        });
      } catch {
        // Fail-open: an audit-write failure must NEVER break the agent/user path.
      }
    },
  };
}

/** The default live recorder (real repo + sanitizer). Injected by the route in CS-5d. */
export const reactAgentAuditRecorder: ReactAgentAuditRecorder =
  createReactAgentAuditRecorder();
