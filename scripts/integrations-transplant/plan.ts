/**
 * DEV-CONNECTION-TRANSPLANT-UTILITY-1 — the shared PLAN stage: resolve and
 * validate the selection, classify providers, and detect destination
 * conflicts. Used identically by dry-run and apply (the fingerprint binds
 * the two). Read-only: no decryption, no provider calls, no writes.
 */
import { redactLabel } from "./redact";
import { computePlanFingerprint, type FingerprintItem } from "./report";
import {
  TransplantRefusalError,
  type DestIntegrationRecord,
  type OrchestratorDeps,
  type ProviderTransplantClassification,
  type SourceIntegrationRow,
  type TransplantConfig,
  type TransplantItemReason,
  type TransplantItemReport,
  type TransplantItemStatus,
} from "./types";

export interface PlanItem {
  row: SourceIntegrationRow;
  classification: ProviderTransplantClassification | null;
  intendedAction: "insert" | "update-existing" | "skip" | "refuse";
  conflict: TransplantItemReport["conflict"];
  verificationSupport: TransplantItemReport["verificationSupport"];
  status: TransplantItemStatus;
  reason: TransplantItemReason;
  existingDest: DestIntegrationRecord | null;
}

export interface PlanResult {
  items: PlanItem[];
  fingerprint: string;
}

export function isExpired(expiresAtIso: string | null, nowMs: number): boolean {
  if (!expiresAtIso) return false;
  const t = Date.parse(expiresAtIso);
  return Number.isFinite(t) && t <= nowMs;
}

export function toReportItem(item: PlanItem): TransplantItemReport {
  return {
    sourceIntegrationId: item.row.id,
    provider: item.row.provider,
    classification: item.classification?.category ?? "D",
    externalAccountLabel: redactLabel(item.row.display_name),
    providerAccountId: redactLabel(item.row.provider_account_id),
    intendedAction: item.intendedAction,
    conflict: item.conflict,
    verificationSupport: item.verificationSupport,
    status: item.status,
    reason: item.reason,
  };
}

export function countStatuses(
  items: readonly TransplantItemReport[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
  }
  return counts;
}

function tupleKey(row: { provider: string; provider_account_id: string }): string {
  return `${row.provider} ${row.provider_account_id}`;
}

async function resolveSelection(
  deps: OrchestratorDeps,
  config: TransplantConfig,
): Promise<SourceIntegrationRow[]> {
  const allowset = new Set(config.providerAllowlist);
  if (config.sourceIntegrationIds && config.sourceIntegrationIds.length > 0) {
    const rows = await deps.source.getIntegrationsByIds(config.sourceIntegrationIds);
    const foundIds = new Set(rows.map((r) => r.id));
    for (const id of config.sourceIntegrationIds) {
      if (!foundIds.has(id)) {
        throw new TransplantRefusalError(
          "source_integration_not_found",
          `selected source integration was not found in the source project.`,
        );
      }
    }
    for (const row of rows) {
      if (row.account_id !== config.sourceAccountId) {
        throw new TransplantRefusalError(
          "source_integration_not_owned_by_source_account",
          `selected source integration belongs to a different account; refusing the whole run.`,
        );
      }
      if (row.disconnected_at !== null) {
        throw new TransplantRefusalError(
          "source_integration_not_active",
          `selected source integration is disconnected; deselect it or choose an active row.`,
        );
      }
      if (!allowset.has(row.provider)) {
        throw new TransplantRefusalError(
          "provider_not_allowlisted",
          `selected source integration's provider '${row.provider}' is not on the allowlist.`,
        );
      }
    }
    return rows;
  }
  return deps.source.listActiveIntegrationsByAccountAndProviders(
    config.sourceAccountId,
    config.providerAllowlist,
  );
}

export async function buildPlan(
  deps: OrchestratorDeps,
  config: TransplantConfig,
): Promise<PlanResult> {
  const rows = await resolveSelection(deps, config);
  if (rows.length === 0) {
    throw new TransplantRefusalError(
      "no_integrations_selected",
      "selection matched zero active source integrations.",
    );
  }

  // Duplicate-tuple detection inside the selection itself.
  const tupleCounts = new Map<string, number>();
  for (const row of rows) {
    const key = tupleKey(row);
    tupleCounts.set(key, (tupleCounts.get(key) ?? 0) + 1);
  }

  const items: PlanItem[] = [];
  for (const row of rows) {
    const info = deps.providerInfo(row.provider);
    if (!info.registered) {
      throw new TransplantRefusalError(
        "provider_not_registered",
        `provider '${row.provider}' is not registered in the V2 provider registry.`,
      );
    }

    const classification = deps.classify(row.provider);
    const base = {
      row,
      classification,
      existingDest: null as DestIntegrationRecord | null,
    };

    const probe = deps.getProbe(row.provider);
    const verificationSupport: TransplantItemReport["verificationSupport"] =
      classification?.verificationSupported && probe
        ? classification.probeIdentityLimited
          ? "token_only"
          : "identity"
        : "none";

    const refuse = (
      status: TransplantItemStatus,
      reason: TransplantItemReason,
      conflict: TransplantItemReport["conflict"] = "none",
    ): PlanItem => ({
      ...base,
      intendedAction: "refuse",
      conflict,
      verificationSupport,
      status,
      reason,
    });

    if (!classification) {
      items.push(refuse("unsupported", "unknown_provider"));
      continue;
    }
    if (classification.category === "D") {
      items.push(refuse("unsupported", "provider_not_transplantable"));
      continue;
    }
    if (!info.enabled) {
      items.push(refuse("unsupported", "provider_disabled"));
      continue;
    }
    if (
      classification.rotatingRefresh &&
      row.refresh_token_encrypted !== null &&
      !(config.acknowledgeRotationRiskProviders ?? []).includes(row.provider)
    ) {
      items.push(refuse("refused", "rotating_refresh_shared_with_production"));
      continue;
    }
    if ((tupleCounts.get(tupleKey(row)) ?? 0) > 1) {
      items.push(refuse("conflict", "existing_destination_rows_ambiguous", "ambiguous"));
      continue;
    }

    // Static credential viability (plaintext-free checks).
    const missingScopes = info.requiredScopes.filter((s) => !row.scopes.includes(s));
    if (missingScopes.length > 0) {
      items.push(refuse("reconnect_required", "missing_required_scopes"));
      continue;
    }
    if (isExpired(row.access_token_expires_at, deps.now()) && !row.refresh_token_encrypted) {
      items.push(refuse("reconnect_required", "access_token_expired_no_refresh"));
      continue;
    }
    if (config.verificationMode === "strict" && verificationSupport === "none") {
      items.push(refuse("verification_unsupported", "no_probe_for_provider"));
      continue;
    }

    // Destination conflict detection.
    const sameTuple = await deps.dest.findActiveIntegration(
      config.destAccountId,
      row.provider,
      row.provider_account_id,
    );
    const providerRows = await deps.dest.listActiveIntegrationsByProvider(
      config.destAccountId,
      row.provider,
    );
    const otherRows = providerRows.filter(
      (r) => r.providerAccountId !== row.provider_account_id,
    );

    if (classification.multiAccountRisk && otherRows.length > 0) {
      items.push(
        refuse(
          "conflict",
          "existing_destination_rows_ambiguous",
          "single_account_provider_occupied",
        ),
      );
      continue;
    }

    if (sameTuple) {
      if (config.conflictStrategy === "fail") {
        items.push(
          refuse("conflict", "existing_destination_row_same_connection", "same_connection_exists"),
        );
        continue;
      }
      if (config.conflictStrategy === "skip") {
        items.push({
          ...base,
          existingDest: sameTuple,
          intendedAction: "skip",
          conflict: "same_connection_exists",
          verificationSupport,
          status: "skipped",
          reason: "skipped_by_strategy",
        });
        continue;
      }
      items.push({
        ...base,
        existingDest: sameTuple,
        intendedAction: "update-existing",
        conflict: "same_connection_exists",
        verificationSupport,
        status: "planned",
        reason: "existing_destination_row_same_connection",
      });
      continue;
    }

    items.push({
      ...base,
      intendedAction: "insert",
      conflict: "none",
      verificationSupport,
      status: "planned",
      reason: "ok",
    });
  }

  const fingerprintItems: FingerprintItem[] = items.map((i) => ({
    sourceIntegrationId: i.row.id,
    provider: i.row.provider,
    intendedAction: i.intendedAction,
    conflict: i.conflict,
  }));

  return { items, fingerprint: computePlanFingerprint(config, fingerprintItems) };
}
