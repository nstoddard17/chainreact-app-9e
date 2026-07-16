import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI `POST /v1.0/myorg/pipelines` (Create Pipeline).
 *
 * Creates a deployment pipeline (`displayName` ≤256 required,
 * `description` ≤1024 optional — omitted from the body when unset).
 * Deployment pipelines require a Premium / Fabric capacity to be usable;
 * the create itself succeeds without one, so capacity errors surface at
 * assign/deploy time. 201 Created returns `{id, displayName, description}`.
 */

export interface PipelineCreateInput {
  accessToken: string;
  displayName: string;
  description?: string;
}

export interface PipelineCreateResult {
  pipelineId: string;
  displayName: string;
}

interface PipelineCreateBody {
  id?: string;
  displayName?: string;
}

export async function pipelineCreate(
  input: PipelineCreateInput,
): Promise<PipelineCreateResult> {
  const body: Record<string, unknown> = { displayName: input.displayName };
  if (input.description !== undefined) body.description = input.description;

  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "POST",
    path: "/pipelines",
    body,
    operation: "pipeline create POST",
  });

  const parsed = (await res.json()) as PipelineCreateBody;
  if (typeof parsed.id !== "string" || parsed.id.length === 0) {
    throw new Error("Power BI pipeline create POST returned no pipeline id");
  }
  return {
    pipelineId: parsed.id,
    displayName:
      typeof parsed.displayName === "string"
        ? parsed.displayName
        : input.displayName,
  };
}
