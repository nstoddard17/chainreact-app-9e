import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `POST /v1.0/myorg/groups/{groupId}/datasets/{datasetId}/executeQueries`
 * (Execute Queries In Group).
 *
 * Documented limits: ONE query per call, one table request per query,
 * ≤100,000 rows / ≤1,000,000 values / ≤15 MB per query, 120 requests per
 * minute per user; DAX only; needs dataset Read + Build permission and
 * the "Dataset Execute Queries REST API" tenant setting. This wrapper
 * sends exactly one query and returns the FIRST table's rows.
 *
 * DAX syntax errors come back as HTTP 400 (thrown by powerbiFetch).
 * Over-limit queries return HTTP 200 with truncated data plus a result-
 * level error — surfaced here as a thrown Error (error CODE only, never
 * the raw provider body).
 */

export interface ExecuteQueriesInput {
  accessToken: string;
  groupId: string;
  datasetId: string;
  daxQuery: string;
  /** serializerSettings.includeNulls — sent only when set. */
  includeNulls?: boolean;
  /** RLS impersonation UPN — sent only when set. */
  impersonatedUserName?: string;
}

export interface ExecuteQueriesResult {
  /** First result table's rows, keyed `Table[Column]`. Untruncated — the action caps rows. */
  rows: Array<Record<string, unknown>>;
}

interface ExecuteQueriesBody {
  results?: Array<{
    tables?: Array<{ rows?: Array<Record<string, unknown>> }>;
    error?: { code?: string };
  }>;
  error?: { code?: string };
}

export async function executeQueries(
  input: ExecuteQueriesInput,
): Promise<ExecuteQueriesResult> {
  const body: Record<string, unknown> = {
    queries: [{ query: input.daxQuery }],
  };
  if (input.includeNulls !== undefined) {
    body.serializerSettings = { includeNulls: input.includeNulls };
  }
  if (input.impersonatedUserName !== undefined) {
    body.impersonatedUserName = input.impersonatedUserName;
  }

  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "POST",
    path: `/groups/${encodeURIComponent(input.groupId)}/datasets/${encodeURIComponent(
      input.datasetId,
    )}/executeQueries`,
    body,
    notFoundResource: `semantic model ${input.datasetId}`,
    operation: "dataset executeQueries POST",
  });

  const parsed = (await res.json()) as ExecuteQueriesBody;
  if (parsed.error) {
    throw new Error(
      `Power BI dataset executeQueries POST returned an error: ${
        typeof parsed.error.code === "string" ? parsed.error.code : "unknown"
      }`,
    );
  }
  const first = parsed.results?.[0];
  if (first?.error) {
    // HTTP 200 + result error = truncated/over-limit query. Fail loud
    // rather than silently returning partial data.
    throw new Error(
      `Power BI DAX query returned an error: ${
        typeof first.error.code === "string" ? first.error.code : "unknown"
      }`,
    );
  }

  const rows = first?.tables?.[0]?.rows ?? [];
  return { rows };
}
