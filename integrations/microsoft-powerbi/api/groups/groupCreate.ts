import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI `POST /v1.0/myorg/groups?workspaceV2=true`
 * (Create Group).
 *
 * Creates a new (V2) workspace. `workspaceV2=true` is the only supported
 * value per the docs ("(Preview feature) Whether to create a workspace.
 * The only supported value is true") — always sent. Scope:
 * `Workspace.ReadWrite.All`.
 *
 * 200 returns the Group; only `id` + `name` are surfaced (fixed key set).
 */

export interface GroupCreateInput {
  accessToken: string;
  name: string;
}

export interface GroupCreateResult {
  id: string;
  name: string;
}

interface GroupCreateBody {
  id?: string;
  name?: string;
}

export async function groupCreate(
  input: GroupCreateInput,
): Promise<GroupCreateResult> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "POST",
    path: "/groups",
    query: { workspaceV2: "true" },
    body: { name: input.name },
    operation: "group create POST",
  });

  const body = (await res.json()) as GroupCreateBody;
  if (typeof body.id !== "string" || body.id.length === 0) {
    // Documented 200 always carries the new group's id; a missing id means
    // an undocumented response shape — fail loudly rather than emit nulls.
    throw new Error(
      "Power BI group create POST returned an unexpected response (missing group id).",
    );
  }
  return {
    id: body.id,
    name: typeof body.name === "string" ? body.name : input.name,
  };
}
