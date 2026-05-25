import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Typed client for the discovery API.
 *
 * Per project-structure-and-module-boundaries.md §5 and the workflow-
 * builder-ui rule: components and feature hooks call this module, never
 * `fetch()` directly. Errors carry a stable `code` so UIs can branch.
 *
 * Mirrors the conventions of `lib/api/workflows.ts` — same error class
 * shape, same content-type handling, same URL-encoding strategy.
 */

export type DiscoveryApiErrorCode =
  | "UNAUTHENTICATED"
  | "PROVIDER_NOT_FOUND"
  | "SERVER_ERROR"
  | "UNKNOWN";

export class DiscoveryApiError extends Error {
  readonly code: DiscoveryApiErrorCode;
  readonly status: number;
  constructor(message: string, code: DiscoveryApiErrorCode, status: number) {
    super(message);
    this.name = "DiscoveryApiError";
    this.code = code;
    this.status = status;
  }
}

interface ServerErrorBody {
  error?: string;
  code?: string;
}

async function parseError(res: Response): Promise<DiscoveryApiError> {
  let body: ServerErrorBody = {};
  try {
    body = (await res.json()) as ServerErrorBody;
  } catch {
    /* not json */
  }
  const message =
    body.error ?? `Discovery request failed (HTTP ${res.status}).`;
  const code = pickCode(body.code, res.status);
  return new DiscoveryApiError(message, code, res.status);
}

function pickCode(
  serverCode: string | undefined,
  status: number,
): DiscoveryApiErrorCode {
  if (serverCode === "PROVIDER_NOT_FOUND") return "PROVIDER_NOT_FOUND";
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 404) return "PROVIDER_NOT_FOUND";
  if (status >= 500) return "SERVER_ERROR";
  return "UNKNOWN";
}

// ─── Shapes the server returns ──────────────────────────────────────────────

export interface ProviderSummary {
  id: string;
  displayName: string;
  capabilities: {
    oauth: boolean;
    webhookTrigger: boolean;
    pollingTrigger: boolean;
    actions: boolean;
  };
  isEnabled: boolean;
  isExperimental: boolean;
  hasMetadata: boolean;
}

// ─── Operations ─────────────────────────────────────────────────────────────

export async function listProviders(): Promise<readonly ProviderSummary[]> {
  const res = await fetch("/api/providers");
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { providers: ProviderSummary[] };
  return body.providers;
}

export async function listProviderActions(
  provider: string,
): Promise<readonly ActionMeta[]> {
  const res = await fetch(
    `/api/providers/${encodeURIComponent(provider)}/actions`,
  );
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { actions: ActionMeta[] };
  return body.actions;
}

export async function listProviderTriggers(
  provider: string,
): Promise<readonly TriggerMeta[]> {
  const res = await fetch(
    `/api/providers/${encodeURIComponent(provider)}/triggers`,
  );
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { triggers: TriggerMeta[] };
  return body.triggers;
}

export async function listNativeActions(): Promise<readonly ActionMeta[]> {
  const res = await fetch("/api/native/actions");
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { actions: ActionMeta[] };
  return body.actions;
}

export async function listNativeTriggers(): Promise<readonly TriggerMeta[]> {
  const res = await fetch("/api/native/triggers");
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { triggers: TriggerMeta[] };
  return body.triggers;
}
