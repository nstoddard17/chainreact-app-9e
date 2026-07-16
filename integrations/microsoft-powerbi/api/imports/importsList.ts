import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI `GET /v1.0/myorg/groups/{groupId}/imports`
 * (Get Imports In Group).
 *
 * Lists the imports in a workspace — backs the `microsoft-powerbi:imports`
 * options picker (label = name, description = importState). The endpoint
 * documents no server-side paging params; the full set is returned and
 * mapped onto fixed keys only.
 */

export interface ImportsListInput {
  accessToken: string;
  groupId: string;
}

export interface PowerBiImportSummary {
  id: string;
  name: string | null;
  importState: string | null;
}

interface ImportsListBody {
  value?: Array<{
    id?: string;
    name?: string;
    importState?: string;
  }>;
}

export async function importsList(
  input: ImportsListInput,
): Promise<PowerBiImportSummary[]> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "GET",
    path: `/groups/${encodeURIComponent(input.groupId)}/imports`,
    notFoundResource: `workspace ${input.groupId}`,
    operation: "imports GET",
  });

  const body = (await res.json()) as ImportsListBody;
  const imports: PowerBiImportSummary[] = [];
  for (const row of body.value ?? []) {
    if (typeof row.id !== "string" || row.id.length === 0) continue;
    imports.push({
      id: row.id,
      name: typeof row.name === "string" ? row.name : null,
      importState:
        typeof row.importState === "string" ? row.importState : null,
    });
  }
  return imports;
}
