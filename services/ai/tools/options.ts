/**
 * AI grounding tool for resolver-backed field options (Slice 4.AI-2).
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §5.
 *
 * Lets the future agent VALIDATE / discover values for fields whose
 * `optionsSource` is a server resolver (e.g. `slack:channels`) — the same
 * resolvers the builder UI uses, invoked through the same contract as
 * app/api/options/[source]/route.ts. Read-only; no model calls.
 *
 * Failures are typed + sanitized (the resolver layer guarantees no token /
 * raw-provider-body leakage in its messages). Items are capped so a single
 * call can't flood the model's context.
 */

import { getActiveForExecution } from "@/repositories/integrations";
import { ensurePersonalAccount } from "@/services/accounts/ensurePersonalAccount";
import { getOptionsResolver } from "@/services/options/_registry";
import { resolveWorkflowCreatorContext } from "@/services/options/workflowCreatorContext";
import {
  OptionsResolverError,
  type OptionItem,
  type WorkflowCreatorContext,
} from "@/services/options/types";
import {
  aiToolErr,
  aiToolOk,
  MAX_OPTIONS_ITEMS,
  MAX_OPTIONS_QUERY_LENGTH,
  type AiToolError,
  type AiToolResult,
} from "./types";

export interface ResolveOptionsInput {
  /** `<provider>:<resource>` resolver key, e.g. `slack:channels`. */
  readonly source: string;
  /** The caller whose active integration is used for provider-backed sources. */
  readonly userId: string;
  /** Parent `dependsOn` values for cascading resolvers. */
  readonly deps?: Readonly<Record<string, string>>;
  /** Optional search query (trimmed + length-capped). */
  readonly q?: string;
  /**
   * Optional workflow id (Slice 4.ACCOUNT-MODEL-22D-1). When present and
   * resolvable, the tool reads the workflow's `created_by_user_id` and threads
   * it to the resolver as `ctx.workflowCreator`. PLUMBING ONLY — provenance for
   * the later 22D-2 credential-policy slice. It does NOT change the integration
   * lookup (still the caller's personal account) or any tool output in this
   * slice.
   */
  readonly workflowId?: string;
}

export interface ResolveOptionsView {
  readonly source: string;
  readonly items: readonly OptionItem[];
  /** True when more items exist beyond this page (resolver-advertised OR cap-truncated). */
  readonly hasMore: boolean;
  /** True when this call clipped the resolver's items to `MAX_OPTIONS_ITEMS`. */
  readonly truncated: boolean;
}

/** Map an `OptionsResolverError` code to an `AiToolError`. */
function fromResolverError(source: string, err: OptionsResolverError): AiToolError {
  switch (err.code) {
    case "INTEGRATION_DISCONNECTED":
      return aiToolErr("INTEGRATION_DISCONNECTED", err.message);
    case "MISSING_DEPENDENCY":
      return aiToolErr("MISSING_DEPENDENCY", err.message);
    case "SOURCE_NOT_FOUND":
      return aiToolErr("NOT_FOUND", err.message);
    case "PROVIDER_ERROR":
    case "UNKNOWN":
    default:
      return aiToolErr("PROVIDER_ERROR", err.message);
  }
}

/**
 * Resolve a field's dynamic options for AI grounding. Mirrors the
 * options-source route: required-deps check → integration lookup (when the
 * resolver needs one) → resolver dispatch → cap + sanitize.
 */
export async function resolveOptionsSourceForAI(
  input: ResolveOptionsInput,
): Promise<AiToolResult<ResolveOptionsView>> {
  const { source, userId } = input;
  const deps = input.deps ?? {};

  const resolver = getOptionsResolver(source);
  if (!resolver) {
    return aiToolErr("NOT_FOUND", `Unknown options source '${source}'.`);
  }

  // Required-deps check BEFORE any integration lookup (mirrors the route).
  if (resolver.requiredDeps) {
    for (const required of resolver.requiredDeps) {
      const value = deps[required];
      if (value === undefined || value.trim().length === 0) {
        return aiToolErr(
          "MISSING_DEPENDENCY",
          `Required dependsOn field '${required}' is missing.`,
          { missingDependency: required },
        );
      }
    }
  }

  // Integration lookup only when the resolver declares it required.
  // Slice 4.ACCOUNT-MODEL-6: account-scoped. Resolve the user's
  // personal account here until the switcher slice ships.
  let integration = null;
  if (resolver.requiresIntegration) {
    try {
      const ownerAccount = await ensurePersonalAccount(userId);
      integration = await getActiveForExecution(ownerAccount.id, resolver.provider, null);
    } catch {
      return aiToolErr("SERVER_ERROR", "Couldn't look up integration. Try again.");
    }
    if (integration === null) {
      return aiToolErr(
        "INTEGRATION_DISCONNECTED",
        `No active ${resolver.provider} integration. Connect ${resolver.provider} first.`,
      );
    }
  }

  const q = (input.q ?? "").trim().slice(0, MAX_OPTIONS_QUERY_LENGTH);

  // Workflow-creator provenance (Slice 4.ACCOUNT-MODEL-22D-1). Best-effort,
  // never throws, never changes the integration lookup above — provenance
  // carry-through for the later 22D-2 credential-policy slice.
  let workflowCreator: WorkflowCreatorContext | null = null;
  if (input.workflowId !== undefined) {
    workflowCreator = await resolveWorkflowCreatorContext(input.workflowId);
  }

  try {
    const result = await resolver.resolve({
      userId,
      integration,
      q,
      deps,
      ...(workflowCreator !== null && { workflowCreator }),
    });
    const all = result.items;
    const truncated = all.length > MAX_OPTIONS_ITEMS;
    const items = truncated ? all.slice(0, MAX_OPTIONS_ITEMS) : all;
    return aiToolOk({
      source,
      items,
      hasMore: result.hasMore || truncated,
      truncated,
    });
  } catch (err) {
    if (err instanceof OptionsResolverError) {
      return fromResolverError(source, err);
    }
    return aiToolErr("SERVER_ERROR", "Couldn't load options. Try again.");
  }
}
