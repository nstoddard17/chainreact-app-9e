import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `POST /v1.0/myorg/groups/{groupId}/reports/{reportId}/Clone`
 * (Clone Report In Group).
 *
 * `targetWorkspaceId` / `targetModelId` are sent ONLY when set —
 * omitted, the clone lands in the same workspace bound to the same
 * semantic model. Requires the `Content.Create` delegated scope plus
 * Write on the report (and Build on the target model when rebinding).
 *
 * Returns the new report's identity from a fixed key set. The response
 * `Report` object does not reliably carry a workspace id — surfaced as
 * `workspaceId: null` when absent.
 */

export interface ReportCloneInput {
  accessToken: string;
  groupId: string;
  reportId: string;
  name: string;
  targetWorkspaceId?: string;
  targetModelId?: string;
}

export interface ReportCloneResult {
  id: string;
  name: string;
  workspaceId: string | null;
}

interface ReportCloneBody {
  id?: string;
  name?: string;
  workspaceId?: string;
}

export async function reportClone(
  input: ReportCloneInput,
): Promise<ReportCloneResult> {
  const body: Record<string, unknown> = { name: input.name };
  if (input.targetWorkspaceId !== undefined)
    body.targetWorkspaceId = input.targetWorkspaceId;
  if (input.targetModelId !== undefined)
    body.targetModelId = input.targetModelId;

  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "POST",
    path: `/groups/${encodeURIComponent(input.groupId)}/reports/${encodeURIComponent(
      input.reportId,
    )}/Clone`,
    body,
    notFoundResource: `report ${input.reportId}`,
    operation: "report Clone POST",
  });

  const parsed = (await res.json()) as ReportCloneBody;
  if (typeof parsed.id !== "string" || parsed.id.length === 0) {
    throw new Error(
      "Power BI report Clone POST returned no report id in the response.",
    );
  }
  return {
    id: parsed.id,
    name: typeof parsed.name === "string" ? parsed.name : input.name,
    workspaceId:
      typeof parsed.workspaceId === "string" ? parsed.workspaceId : null,
  };
}
