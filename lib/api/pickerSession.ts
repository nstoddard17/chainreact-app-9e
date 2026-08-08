/**
 * Typed client for the provider resource-picker session API
 * (GOOGLE-OAUTH-PRODUCTION-SCOPE-CLOSEOUT-2).
 *
 * Per project-structure-and-module-boundaries.md §5 + the workflow-builder-ui
 * rule: components and feature hooks call this module, never `fetch()` directly.
 *
 * The error union mirrors `services/integrations/pickerSession.ts`
 * `PickerSessionErrorCode` value-for-value. The duplication is intentional —
 * the structural boundary test forbids `lib/api/` from importing `services/`
 * (same contract as `lib/api/options.ts`).
 *
 * SECURITY: the returned `accessToken` is a short-lived provider credential for
 * the Google Picker widget ONLY. Callers must keep it in a local variable for
 * the open picker and MUST NOT persist it (no localStorage/sessionStorage, no
 * cookie, no URL, no logging). See the service docstring for the full boundary.
 */

/** KEEP IN SYNC with `services/integrations/pickerSession.ts`. */
export type PickerSessionErrorCode =
  | "PICKER_NOT_SUPPORTED"
  | "PICKER_NOT_CONFIGURED"
  | "INTEGRATION_NOT_CONNECTED"
  | "NOT_WORKFLOW_OWNER"
  | "PROVIDER_REAUTH_REQUIRED"
  | "SERVER_ERROR"
  | "UNAUTHENTICATED"
  | "UNKNOWN";

export interface PickerSessionSuccess {
  readonly ok: true;
  /** Short-lived provider access token — picker widget only, never persisted. */
  readonly accessToken: string;
  /** Google Cloud project number (`setAppId`) — a public identifier. */
  readonly appId: string;
  /** Browser API key (`setDeveloperKey`) — a public identifier. */
  readonly apiKey: string;
  /** Provider MIME type the picker view is filtered to. */
  readonly mimeType: string;
}

export interface PickerSessionFailure {
  readonly ok: false;
  readonly code: PickerSessionErrorCode;
  readonly message: string;
}

export type PickerSessionResponse = PickerSessionSuccess | PickerSessionFailure;

export interface FetchPickerSessionInput {
  /** Picker key from the field metadata (e.g. "google-sheets:spreadsheet"). */
  readonly picker: string;
  readonly workflowId?: string | null;
  readonly nodeId?: string | null;
  readonly signal?: AbortSignal;
}

export async function fetchPickerSession(
  input: FetchPickerSessionInput,
): Promise<PickerSessionResponse> {
  let res: Response;
  try {
    res = await fetch("/api/integrations/picker-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        picker: input.picker,
        workflowId: input.workflowId ?? null,
        nodeId: input.nodeId ?? null,
      }),
      signal: input.signal,
    });
  } catch {
    return { ok: false, code: "SERVER_ERROR", message: "Couldn't reach the server." };
  }

  if (res.status === 401) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Sign in to choose a file." };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, code: "UNKNOWN", message: "Unexpected response." };
  }

  const payload = (body ?? {}) as Record<string, unknown>;
  if (payload.ok === true && typeof payload.accessToken === "string") {
    return {
      ok: true,
      accessToken: payload.accessToken,
      appId: typeof payload.appId === "string" ? payload.appId : "",
      apiKey: typeof payload.apiKey === "string" ? payload.apiKey : "",
      mimeType: typeof payload.mimeType === "string" ? payload.mimeType : "",
    };
  }

  return {
    ok: false,
    code: (typeof payload.code === "string" ? payload.code : "UNKNOWN") as PickerSessionErrorCode,
    message:
      typeof payload.message === "string" ? payload.message : "Couldn't open the picker.",
  };
}
