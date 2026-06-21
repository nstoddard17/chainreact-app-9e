/**
 * AI guidance context / memory SCOPE GUARD (HERMES-AGENT-MEMORY-SCOPE-GUARD).
 *
 * The deterministic policy that decides EXACTLY what request-scoped context ChainReact may include
 * when it asks the Hermes Agent for workflow guidance. It exists to enforce one team-safety rule:
 *
 *   A team/shared account can share workflows + explicitly account-safe context, but it MUST NOT
 *   blend one member's PRIVATE context (AI memory, personal preferences, private provider
 *   connections/credentials, other members' prompts) into another member's guidance.
 *
 * Context SCOPES (documented; widening any of these is a deliberate future slice):
 *   - `user`    — private to the signed-in user (e.g. their OWN connection availability).
 *   - `account` — shared ONLY when explicitly account-safe (account type/role; account-shared
 *                 connection availability).
 *   - `workflow`— only for a workflow the caller is already authorized to access (route-enforced).
 *   - `global`  — generic product / workflow-building patterns. No customer data.
 *
 * This module is a PURE, deterministic SELECTOR. Given server-resolved raw inputs it returns a
 * prompt-safe object that, BY CONSTRUCTION, can never carry the excluded data below. It performs no
 * IO, reads no secret, and is the single place tests pin the exclusion contract.
 *
 * EXPLICITLY EXCLUDED (never representable in the output): other users' private AI memories /
 * preferences / connections / credentials; OAuth/refresh tokens, secrets, sensitive provider account
 * ids; raw emails/messages/files; workflow data the caller can't access; raw Supabase rows;
 * service-role data; full audit payloads; other members' prior prompts/guidance; the caller's own
 * userId / account id / email / name (identity stays server-side for auth+audit, not prompt
 * personalization).
 *
 * MEMORY POLICY: there is NO durable Hermes/ChainReact AI memory store in V2. ALL guidance is
 * REQUEST-SCOPED — only the context built here is sent, and nothing here reads prior sessions, audit
 * rows, or other members' history. Existing guidance/session/audit tables are NOT a memory source.
 */

import type { AccountType } from "@/contracts/accounts";
import type { GeneralizedWorkflow } from "@/contracts/aiGuidance";
import {
  isAccountCredentialProvider,
  isPersonalCredentialProvider,
} from "@/core/integrations/credentialSharing";

export type AiGuidanceContextScope = "user" | "account" | "workflow" | "global";

/** Safe placeholder shown to guidance (and surfaceable to the user) instead of another member's
 *  private-connection details. Names NO owner, exposes NO credential. */
export const FOREIGN_PRIVATE_CONNECTION_NOTICE =
  "This workflow contains a private connection owned by another member; connect your own account or ask the owner to share or reconfigure it.";

/** Raw, SERVER-RESOLVED inputs. The caller (route/runner) gathers these under existing authorization;
 *  the client never supplies them. Everything optional except identity + account is omitted when not
 *  safely available — the selector simply leaves it out (never guesses). */
export interface GuidanceContextInput {
  /** Acting user id — used ONLY to compare ownership; never copied into the output. */
  readonly viewerUserId: string;
  /** Account scope summary (already authorized). Role optional. */
  readonly account: { readonly type: AccountType; readonly role?: string };
  /** Workflow scope — present ONLY when the caller is authorized for this workflow. */
  readonly workflow?: {
    /** Creator (for own-vs-foreign comparison only; never copied to output). */
    readonly createdByUserId: string;
    /** Already de-identified shape (from sanitizeWorkflowForGuidance). */
    readonly generalized: GeneralizedWorkflow;
  };
  /** Account-SHARED connection providers known available (safe, account scope). Filtered defensively. */
  readonly sharedCredentialProviders?: readonly string[];
  /** The VIEWER'S OWN connection providers (safe for them, user scope). */
  readonly ownConnectionProviders?: readonly string[];
}

/** Prompt-safe context. Contains ONLY allow-listed, scope-checked fields. */
export interface SafeGuidanceContext {
  readonly schemaVersion: 1;
  readonly account: { readonly type: AccountType; readonly role?: string };
  readonly sharedCredentialProviders?: readonly string[];
  readonly ownConnectionProviders?: readonly string[];
  /** Set when the workflow uses a personal connection owned by a DIFFERENT member (no owner identity). */
  readonly privateConnectionNotice?: string;
  /** Which scopes contributed — safe enums only (good for audit metadata). */
  readonly scopesIncluded: readonly AiGuidanceContextScope[];
}

function dedupeSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((v) => typeof v === "string" && v.length > 0))).sort();
}

/**
 * Build the prompt-safe context for a guidance request. Deterministic; never throws; never includes
 * excluded private/team-member data. See module header for the full exclusion contract.
 */
export function buildSafeGuidanceContext(input: GuidanceContextInput): SafeGuidanceContext {
  const scopes = new Set<AiGuidanceContextScope>(["account", "global"]);

  // Account-SHARED availability: defensively keep ONLY account-class providers. A personal provider
  // must NEVER appear as "shared" even if a caller mistakenly passes it in.
  const shared = input.sharedCredentialProviders
    ? dedupeSorted(input.sharedCredentialProviders.filter((p) => isAccountCredentialProvider(p)))
    : [];

  // The VIEWER'S OWN connections — safe to summarize for them (user scope).
  const own = input.ownConnectionProviders ? dedupeSorted(input.ownConnectionProviders) : [];
  if (own.length > 0) scopes.add("user");

  let privateConnectionNotice: string | undefined;
  if (input.workflow) {
    scopes.add("workflow");
    const foreignPrivateConnection =
      input.account.type !== "personal" &&
      input.workflow.createdByUserId !== input.viewerUserId &&
      input.workflow.generalized.nodes.some((n) => isPersonalCredentialProvider(n.provider));
    if (foreignPrivateConnection) {
      privateConnectionNotice = FOREIGN_PRIVATE_CONNECTION_NOTICE;
    }
  }

  return {
    schemaVersion: 1,
    account: {
      type: input.account.type,
      ...(input.account.role ? { role: input.account.role } : {}),
    },
    ...(shared.length > 0 ? { sharedCredentialProviders: shared } : {}),
    ...(own.length > 0 ? { ownConnectionProviders: own } : {}),
    ...(privateConnectionNotice ? { privateConnectionNotice } : {}),
    scopesIncluded: Array.from(scopes).sort(),
  };
}
