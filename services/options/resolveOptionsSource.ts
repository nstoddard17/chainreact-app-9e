import {
  getActiveForExecution,
  markNeedsReconnect,
  clearNeedsReconnect,
} from "@/repositories/integrations";
import { notifyReconnectNeeded } from "@/services/integrations/reconnectNotification";
import { ensurePersonalAccount } from "@/services/accounts/ensurePersonalAccount";
import { credentialSharingForProvider } from "@/core/integrations/credentialSharing";
import { resolveEffectiveNodeOwner } from "@/services/teamCredentials/nodeCredentialOwners";
import { runWithCredentialResolutionContext } from "@/services/oauth/credentialResolutionContext";
import { getOptionsResolver } from "./_registry";
import { resolveWorkflowCreatorContext } from "./workflowCreatorContext";
import {
  decideOptionsCredential,
  type OptionsCredentialDecision,
} from "./credentialPolicy";
import {
  OptionsResolverError,
  type OptionsSourceErrorCode,
  type OptionsSourceResponse,
  type WorkflowCreatorContext,
} from "./types";

/**
 * Shared live option-source resolution (Slice 4.MCP-STAGE-2B-1).
 *
 * This is the single authoritative implementation of "resolve options for this
 * source under this subject, applying the V2 credential-sharing policy." It was
 * extracted verbatim from `app/api/options/[source]/route.ts` so that BOTH:
 *   - the live builder route (`GET /api/options/[source]`), and
 *   - the internal diagnostic route (`POST /api/internal/diagnostics/option-source`)
 * run the EXACT same code path — diagnosis can never diverge from production
 * behavior (the parity guarantee in the Stage-2B plan).
 *
 * Identity is a precondition, not a concern of this function: the caller passes
 * an already-resolved `userId` (the live route from `requireUser()`, the
 * diagnostic route as the explicit machine-authorized subject). This function
 * never authenticates and never returns `UNAUTHENTICATED` — that arm belongs to
 * the route's auth gate.
 *
 * Security: the returned `response` carries the same sanitized, closed
 * `OptionsSourceErrorCode` + caller-friendly message the live route already
 * shipped. The extra `diagnostics` fields are derived booleans/enums only — the
 * diagnostic route surfaces them; the live route ignores them. No token, no
 * scope, no `connectedByUserId`, no provider body is ever placed here.
 */

/** Max accepted `q` length — clamped here so every caller clamps identically. */
export const MAX_QUERY_LENGTH = 256;

export interface ResolveOptionsSourceInput {
  /** `<provider>:<resource>` source key. */
  readonly source: string;
  /** Authenticated subject. The live route's session user, or the diagnostic subject. */
  readonly userId: string;
  /** Raw search query (trimmed + length-capped inside). */
  readonly q: string;
  /** dependsOn parent values, already parsed + empty-dropped by the caller. */
  readonly deps: Readonly<Record<string, string>>;
  /** Optional workflow provenance (drives the credential-sharing decision). */
  readonly workflowId: string | null;
  /** Optional node id (drives accepted per-node owner resolution). */
  readonly nodeId: string | null;
}

/** Non-secret diagnostics about how the resolution was scoped. */
export interface ResolveOptionsSourceDiagnostics {
  /** Whether the resolver declares it needs an active integration. */
  readonly requiresIntegration: boolean;
  /** Whether an active integration row was found (false when not required / not found). */
  readonly integrationConnected: boolean;
  /**
   * The credential-sharing decision kind, when one was made
   * (`legacy | account | personal-creator | not-owner`). `null` when the source
   * was unknown, a required dep was missing, or the resolver needs no
   * integration — i.e. when `decideOptionsCredential` was never consulted.
   */
  readonly credentialDecision: OptionsCredentialDecision["kind"] | null;
}

export interface ResolveOptionsSourceResult {
  /** The same body the live route returns (success arm includes `items`). */
  readonly response: OptionsSourceResponse;
  readonly diagnostics: ResolveOptionsSourceDiagnostics;
}

function err(
  source: string,
  code: OptionsSourceErrorCode,
  message: string,
  diagnostics: ResolveOptionsSourceDiagnostics,
  missingDependency?: string,
): ResolveOptionsSourceResult {
  return {
    response: {
      ok: false,
      source,
      code,
      message,
      ...(missingDependency !== undefined && { missingDependency }),
    },
    diagnostics,
  };
}

const NO_INTEGRATION: ResolveOptionsSourceDiagnostics = {
  requiresIntegration: false,
  integrationConnected: false,
  credentialDecision: null,
};

/**
 * Resolve an option source end-to-end. Mirrors `route.ts` lines 127-305 exactly;
 * see that file's header for the per-arm rationale.
 */
export async function resolveOptionsSource(
  input: ResolveOptionsSourceInput,
): Promise<ResolveOptionsSourceResult> {
  const { source, userId, deps, workflowId, nodeId } = input;
  const q = input.q.trim().slice(0, MAX_QUERY_LENGTH);

  const resolver = getOptionsResolver(source);
  if (!resolver) {
    return err(
      source,
      "SOURCE_NOT_FOUND",
      `Unknown options source '${source}'.`,
      NO_INTEGRATION,
    );
  }

  const requiresIntegration = resolver.requiresIntegration;

  // Required-deps check BEFORE any integration lookup.
  if (resolver.requiredDeps) {
    for (const required of resolver.requiredDeps) {
      if (deps[required] === undefined) {
        return err(
          source,
          "MISSING_DEPENDENCY",
          `Required dependsOn field '${required}' is missing.`,
          { requiresIntegration, integrationConnected: false, credentialDecision: null },
          required,
        );
      }
    }
  }

  // Workflow-creator provenance (best-effort, never throws).
  let workflowCreator: WorkflowCreatorContext | null = null;
  if (workflowId !== null) {
    workflowCreator = await resolveWorkflowCreatorContext(workflowId);
  }

  let integration = null;
  let pinUserId: string | null = null;
  let credentialDecision: OptionsCredentialDecision["kind"] | null = null;

  if (requiresIntegration) {
    // Accepted per-node credential owner (personal providers on a team workflow).
    let effectiveOwnerUserId: string | null = null;
    if (
      workflowCreator !== null &&
      nodeId !== null &&
      credentialSharingForProvider(resolver.provider) === "personal"
    ) {
      effectiveOwnerUserId = await resolveEffectiveNodeOwner(
        workflowCreator.workflowId,
        nodeId,
      );
    }

    const decision = decideOptionsCredential(
      resolver.provider,
      userId,
      workflowCreator,
      effectiveOwnerUserId,
    );
    credentialDecision = decision.kind;

    if (decision.kind === "not-owner") {
      // No resolver call, no getActiveForExecution call — the owner's personal
      // credential / resource labels are never fetched.
      return err(
        source,
        "NOT_WORKFLOW_OWNER",
        `This step runs under the workflow owner's ${resolver.provider} connection. Ask the owner to set it up.`,
        { requiresIntegration, integrationConnected: false, credentialDecision },
      );
    }

    try {
      if (decision.kind === "legacy") {
        const ownerAccount = await ensurePersonalAccount(userId);
        integration = await getActiveForExecution(
          ownerAccount.id,
          resolver.provider,
          null,
        );
      } else if (decision.kind === "account") {
        integration = await getActiveForExecution(
          decision.accountId,
          resolver.provider,
          null,
        );
      } else {
        pinUserId = decision.connectedByUserId;
        integration = await getActiveForExecution(
          decision.accountId,
          resolver.provider,
          null,
          { connectedByUserId: pinUserId },
        );
      }
    } catch {
      return err(source, "SERVER_ERROR", "Couldn't look up integration. Try again.", {
        requiresIntegration,
        integrationConnected: false,
        credentialDecision,
      });
    }

    if (integration === null) {
      if (decision.kind === "personal-creator") {
        return err(
          source,
          "OWNER_MUST_CONNECT",
          `Connect ${resolver.provider} to configure and run this workflow.`,
          { requiresIntegration, integrationConnected: false, credentialDecision },
        );
      }
      return err(
        source,
        "INTEGRATION_DISCONNECTED",
        `No active ${resolver.provider} integration. Connect ${resolver.provider} first.`,
        { requiresIntegration, integrationConnected: false, credentialDecision },
      );
    }
  }

  const integrationConnected = integration !== null;
  const diagnostics: ResolveOptionsSourceDiagnostics = {
    requiresIntegration,
    integrationConnected,
    credentialDecision,
  };

  const dispatch = () =>
    resolver.resolve({
      userId,
      integration,
      q,
      deps,
      ...(workflowCreator !== null && { workflowCreator }),
    });

  try {
    const result =
      pinUserId !== null
        ? await runWithCredentialResolutionContext(
            { createdByUserId: pinUserId },
            dispatch,
          )
        : await dispatch();
    // V2-READY-28: a successful auth-sensitive load proves the credential works —
    // clear any stale reconnect-needed signal (only when one is set, to avoid a
    // write on every successful options load). Best-effort; never affects the
    // response.
    if (integration !== null && integration.needsReconnectAt != null) {
      void clearNeedsReconnect(integration.id).catch(() => {});
    }
    return {
      response: {
        ok: true,
        source,
        items: result.items,
        hasMore: result.hasMore,
      },
      diagnostics,
    };
  } catch (e) {
    if (e instanceof OptionsResolverError) {
      // V2-READY-28: a TRUE provider auth/reconnect failure (PROVIDER_REAUTH_REQUIRED)
      // with a known integration row → persist the reconnect-needed signal so the
      // Apps page stops implying the credential is healthy. NOT set for generic
      // PROVIDER_ERROR / 429 / 5xx / network / missing-dependency / disconnected
      // arms. Best-effort; never changes the returned response.
      if (e.code === "PROVIDER_REAUTH_REQUIRED" && integration !== null) {
        // V2-READY-28B: persist the signal, and on a TRUE first-mark transition
        // (NULL → non-null) send ONE in-app reconnect notification to the
        // connector. markNeedsReconnect's conditional UPDATE gives the atomic
        // transition signal, so repeated option failures never re-notify. All
        // best-effort — never changes the returned response.
        const failedIntegration = integration;
        void markNeedsReconnect(failedIntegration.id)
          .then((firstMark) =>
            firstMark ? notifyReconnectNeeded(failedIntegration) : undefined,
          )
          .catch(() => {});
      }
      return err(source, e.code, e.message, diagnostics);
    }
    return err(source, "SERVER_ERROR", "Couldn't load options. Try again.", diagnostics);
  }
}
