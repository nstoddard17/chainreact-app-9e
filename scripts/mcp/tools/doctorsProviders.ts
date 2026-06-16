/**
 * Internal MCP server — provider/account composite doctor handlers (Phase C-2).
 *
 * Split from `tools/doctors.ts` for file-size hygiene. Same rules: COMPOSE the
 * static `providerStatics` brain + the gated `postDiagnostic` transport — no new
 * route, no new brain, no DB access. Output carries names/counts/enums only —
 * never tokens, raw scopes, credential identity, or private account data.
 */
import { postDiagnostic } from "./diagnoseTransport";
import {
  classifyProviderConsistency,
  countMetaFiles,
  isValidProviderId,
  listProviderIds,
  loadRegisteredOptionSources,
  loadRegistryProviderIds,
  manifestSummaryFor,
  providerCounts,
  referencedOptionSources,
} from "../lib/providerStatics";
import {
  aggregateOverall,
  CONNECTED,
  dedup,
  type DoctorOutcome,
  type IntegrationConnectionDTO,
  renderDoctor,
  type Section,
} from "../lib/doctorShared";

const INTEGRATION_CONNECTION_PATH = "/api/internal/diagnostics/integration-connection";

/**
 * Compute the composite provider doctor answer (no rendering). Shared by the
 * `doctor_provider` tool and `generate_diagnostic_report` so the report composes
 * the same diagnosis.
 */
export async function computeDoctorProvider(args: Record<string, unknown>): Promise<DoctorOutcome> {
  const provider = typeof args.provider === "string" ? args.provider.trim() : "";
  if (!provider) return { ok: false, message: "Error: 'provider' is required (e.g. 'slack')." };
  if (!isValidProviderId(provider)) return { ok: false, message: `Error: invalid provider id '${provider}'.` };
  if (!listProviderIds().includes(provider)) {
    return { ok: false, message: `Error: no manifest found for provider '${provider}'. Use list_provider_manifests.` };
  }

  const sections: Section[] = [];
  const sourceTools: string[] = [
    "provider_capability_matrix",
    "provider_action_trigger_counts",
    "provider_metadata_consistency_check",
    "option_source_coverage_check",
    "explain_provider_connection_requirements",
  ];
  const nextSteps: string[] = [];
  const unavailable: Array<{ section: string; reason: string }> = [];

  const summary = manifestSummaryFor(provider);
  const { sources: registered } = loadRegisteredOptionSources();
  const counts = providerCounts(provider, registered);

  // 1. Capability.
  if (summary) {
    const c = summary.capabilities;
    sections.push({
      name: "capability",
      status: summary.isEnabled === false ? "warning" : "ok",
      summary: `enabled=${summary.isEnabled} actions=${c.actions} webhookTrigger=${c.webhookTrigger} pollingTrigger=${c.pollingTrigger} authFlow=${summary.authFlow} refreshable=${summary.refreshable}`,
    });
    if (summary.isEnabled === false) nextSteps.push(`Enable provider '${provider}' in its manifest before it can be used.`);
  } else {
    unavailable.push({ section: "capability", reason: "manifest could not be read/parsed" });
  }

  // 2. Action/trigger + option-source counts.
  sections.push({
    name: "counts",
    status: "ok",
    summary: `actions=${counts.actionMetaCount} triggers=${counts.triggerMetaCount} optionSources=${counts.optionSourceCount} discoveryMeta=${counts.hasDiscoveryMeta ? "present" : "absent"}`,
  });

  // 3. Metadata consistency (reuse the pure classifier — same brain as the tool).
  const registryIds = loadRegistryProviderIds();
  const consistency = classifyProviderConsistency({
    manifestReadable: summary !== null,
    actionsCap: summary ? summary.capabilities.actions : null,
    webhookCap: summary ? summary.capabilities.webhookTrigger : null,
    pollingCap: summary ? summary.capabilities.pollingTrigger : null,
    actionMetaCount: countMetaFiles(provider, "actions"),
    triggerMetaCount: countMetaFiles(provider, "triggers"),
    inRegistry: registryIds ? registryIds.includes(provider) : null,
  });
  const consErr = consistency.filter((f) => f.severity === "error");
  sections.push({
    name: "consistency",
    status: consErr.length ? "blocked" : consistency.length ? "warning" : "ok",
    summary: consistency.length ? `${consErr.length} error, ${consistency.length - consErr.length} other` : "OK",
    findings: consistency.map((f) => `[${f.severity}] ${f.message}`),
  });
  for (const f of consErr) nextSteps.push(`Resolve consistency error: ${f.message}.`);

  // 4. Option-source coverage (referenced vs registered).
  const refs = referencedOptionSources([provider]);
  const registeredKeys = new Set(registered.filter((s) => s.provider === provider).map((s) => s.source));
  const referencedKeys = new Set([...refs.keys()].filter((k) => k.startsWith(`${provider}:`)));
  const missing = [...referencedKeys].filter((k) => !registeredKeys.has(k)).sort();
  const unused = [...registeredKeys].filter((k) => !referencedKeys.has(k)).sort();
  sections.push({
    name: "optionSources",
    status: missing.length ? "blocked" : unused.length ? "warning" : "ok",
    summary: `referenced=${referencedKeys.size} registered=${registeredKeys.size} missing=${missing.length} unused=${unused.length}`,
    findings: [
      ...missing.map((k) => `[error] referenced but NOT registered: ${k}`),
      ...unused.map((k) => `[warning] registered but no *.meta.ts reference: ${k}`),
    ],
  });
  for (const k of missing) nextSteps.push(`Register the option source '${k}' (a field references it but it is unregistered).`);

  // 5. Connection requirements (manifest scopes / auth — names only).
  if (summary) {
    sections.push({
      name: "connectionRequirements",
      status: "ok",
      summary: `authFlow=${summary.authFlow} requiredScopes=${summary.scopesRequired?.length ?? "unparsed"} refreshable=${summary.refreshable}`,
      findings: summary.scopesRequired && summary.scopesRequired.length ? [`required scopes: ${summary.scopesRequired.join(", ")}`] : undefined,
    });
  }

  // 6. Optional LIVE connection (only when account + user provided).
  const accountId = typeof args.accountId === "string" ? args.accountId.trim() : "";
  const userId = typeof args.userId === "string" ? args.userId.trim() : "";
  if (accountId && userId) {
    sourceTools.push("diagnose_integration_connection");
    const live = await postDiagnostic<IntegrationConnectionDTO>(INTEGRATION_CONNECTION_PATH, { provider, accountId, userId });
    if (!live.ok) {
      unavailable.push({ section: "liveConnection", reason: live.message });
    } else {
      const d = live.dto;
      const ready = d.status === CONNECTED;
      sections.push({
        name: "liveConnection",
        status: ready ? "ok" : "blocked",
        summary: `status=${d.status} providerEnabled=${d.providerEnabled} refreshable=${d.refreshable} scopesSatisfied=${d.scopesSatisfied} missingScopes=${d.missingScopeCount}`,
      });
      if (!ready) nextSteps.push(`Resolve the live connection for '${provider}' (status ${d.status}).`);
    }
  } else {
    unavailable.push({ section: "liveConnection", reason: "provide accountId + userId to include the live connection check" });
  }

  const overall = aggregateOverall(sections.map((s) => s.status));
  return {
    ok: true,
    title: `doctor_provider: ${provider}`,
    result: {
      overall,
      sections,
      nextSteps: dedup(nextSteps).slice(0, 10),
      sourceTools,
      unavailable,
    },
  };
}

/** `doctor_provider` tool handler — renders the computed outcome to text. */
export async function doctorProvider(args: Record<string, unknown>): Promise<string> {
  const outcome = await computeDoctorProvider(args);
  if (!outcome.ok) return outcome.message;
  return renderDoctor(outcome.title, outcome.result);
}

/**
 * Compute the composite account-integration doctor answer (no rendering). Shared
 * by the `doctor_account_integration` tool and `generate_diagnostic_report`.
 */
export async function computeDoctorAccountIntegration(args: Record<string, unknown>): Promise<DoctorOutcome> {
  const accountId = typeof args.accountId === "string" ? args.accountId.trim() : "";
  const userId = typeof args.userId === "string" ? args.userId.trim() : "";
  if (!accountId) return { ok: false, message: "Error: 'accountId' is required." };
  if (!userId)
    return { ok: false, message: "Error: 'userId' is required — the subject to diagnose under (member of the account)." };
  const provider = typeof args.provider === "string" ? args.provider.trim() : "";

  const sections: Section[] = [];
  const sourceTools: string[] = [];
  const nextSteps: string[] = [];
  const unavailable: Array<{ section: string; reason: string }> = [];

  if (!provider) {
    // Account-wide enumeration needs a list of the account's integration rows,
    // which would require new service-role DB access in the MCP boundary — out of
    // scope by design. Provider-scoped only for now.
    return {
      ok: true,
      title: "doctor_account_integration",
      result: {
        overall: "unknown",
        sections: [],
        nextSteps: ["Pass a 'provider' to check one integration; account-wide enumeration is deferred."],
        sourceTools: [],
        unavailable: [
          {
            section: "accountWideEnumeration",
            reason:
              "DEFERRED — listing all of an account's integrations needs a new gated route (no new service-role DB access is added to the MCP boundary). Provide a 'provider' for a scoped check.",
          },
        ],
      },
    };
  }

  if (!isValidProviderId(provider)) return { ok: false, message: `Error: invalid provider id '${provider}'.` };
  sourceTools.push("diagnose_integration_connection");
  const live = await postDiagnostic<IntegrationConnectionDTO>(INTEGRATION_CONNECTION_PATH, { provider, accountId, userId });
  if (!live.ok) {
    unavailable.push({ section: provider, reason: live.message });
    return {
      ok: true,
      title: "doctor_account_integration",
      result: { overall: "unknown", sections, nextSteps, sourceTools, unavailable },
    };
  }
  const d = live.dto;
  const ready = d.status === CONNECTED;
  const counts = { connected: ready ? 1 : 0, needsAttention: ready ? 0 : 1 };
  sections.push({
    name: provider,
    status: ready ? "ok" : "blocked",
    summary: `status=${d.status} providerEnabled=${d.providerEnabled} active=${d.activeConnectionCount} scopesSatisfied=${d.scopesSatisfied} missingScopes=${d.missingScopeCount}`,
  });
  if (!ready) nextSteps.push(`Resolve '${provider}' for this account (status ${d.status}).`);

  const overall = aggregateOverall(sections.map((s) => s.status));
  return {
    ok: true,
    title: "doctor_account_integration",
    result: {
      overall,
      sections: [...sections, { name: "counts", status: "ok", summary: `connected=${counts.connected} needsAttention=${counts.needsAttention} (provider-scoped)` }],
      nextSteps,
      sourceTools,
      unavailable,
    },
  };
}

/** `doctor_account_integration` tool handler — renders the computed outcome. */
export async function doctorAccountIntegration(args: Record<string, unknown>): Promise<string> {
  const outcome = await computeDoctorAccountIntegration(args);
  if (!outcome.ok) return outcome.message;
  return renderDoctor(outcome.title, outcome.result);
}
