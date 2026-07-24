/**
 * Typed client API for the credential-paste connect flow (FLEETIO-1).
 *
 * Per project-structure-and-module-boundaries.md §5, this is the only bridge
 * the credential form uses to reach the server. The credential values live in
 * component state and this ONE fetch body — never in storage, never logged.
 */

export interface SubmitCredentialsResult {
  redirect: string;
}

/**
 * Thrown on a non-2xx response. `status` lets the form distinguish invalid
 * credentials (400) from a transient provider failure (502). `message` is the
 * route's already-safe `error` code/sentence — never a credential.
 */
export class CredentialPasteApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "CredentialPasteApiError";
    this.status = status;
  }
}

export async function submitProviderCredentials(
  provider: string,
  input: { state: string; credentials: Record<string, string> },
): Promise<SubmitCredentialsResult> {
  const res = await fetch(
    `/api/integrations/oauth/${encodeURIComponent(provider)}/credential-ingest`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    },
  );
  if (!res.ok) {
    let message = `Connection failed (HTTP ${res.status}).`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON response; keep the default message */
    }
    throw new CredentialPasteApiError(res.status, message);
  }
  return (await res.json()) as SubmitCredentialsResult;
}
