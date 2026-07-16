import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI `GET /v1.0/myorg/groups/{groupId}/imports/{importId}`
 * (Get Import In Group).
 *
 * Returns the import's state (`Publishing` | `Succeeded` | `Failed`) plus
 * the datasets/reports it produced — the poll target for import
 * completion after `importPost`. Fixed-key mapping only; the raw
 * `error {code, details[]}` failure object is never spread through.
 */

export interface ImportGetInput {
  accessToken: string;
  groupId: string;
  importId: string;
}

export interface ImportedArtifact {
  id: string;
  name: string | null;
}

export interface ImportGetResult {
  importState: string | null;
  name: string | null;
  createdDateTime: string | null;
  updatedDateTime: string | null;
  reports: ImportedArtifact[];
  datasets: ImportedArtifact[];
}

interface ImportGetBody {
  importState?: string;
  name?: string;
  createdDateTime?: string;
  updatedDateTime?: string;
  reports?: Array<{ id?: string; name?: string }>;
  datasets?: Array<{ id?: string; name?: string }>;
}

function mapArtifacts(
  rows: Array<{ id?: string; name?: string }> | undefined,
): ImportedArtifact[] {
  const artifacts: ImportedArtifact[] = [];
  for (const row of rows ?? []) {
    if (typeof row.id !== "string" || row.id.length === 0) continue;
    artifacts.push({
      id: row.id,
      name: typeof row.name === "string" ? row.name : null,
    });
  }
  return artifacts;
}

export async function importGet(
  input: ImportGetInput,
): Promise<ImportGetResult> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "GET",
    path: `/groups/${encodeURIComponent(input.groupId)}/imports/${encodeURIComponent(
      input.importId,
    )}`,
    notFoundResource: `import ${input.importId}`,
    operation: "import GET",
  });

  const body = (await res.json()) as ImportGetBody;
  return {
    importState:
      typeof body.importState === "string" ? body.importState : null,
    name: typeof body.name === "string" ? body.name : null,
    createdDateTime:
      typeof body.createdDateTime === "string" ? body.createdDateTime : null,
    updatedDateTime:
      typeof body.updatedDateTime === "string" ? body.updatedDateTime : null,
    reports: mapArtifacts(body.reports),
    datasets: mapArtifacts(body.datasets),
  };
}
