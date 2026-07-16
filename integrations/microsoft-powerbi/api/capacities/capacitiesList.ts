import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI `GET /v1.0/myorg/capacities` (Get Capacities).
 *
 * Lists the capacities the connected user can access. No server-side
 * paging is documented for this endpoint — capacity counts are small in
 * practice. Fixed-key mapping only; `admins[]` is deliberately NOT
 * surfaced (PII the pickers don't need).
 *
 * `capacityUserAccessRight` (None | Assign | Admin) is surfaced so the
 * capacities option source can offer only capacities the user can
 * actually assign workspaces to.
 */

export interface CapacitiesListInput {
  accessToken: string;
}

export interface PowerBiCapacity {
  id: string;
  displayName: string;
  sku: string | null;
  /** Active | Suspended | Provisioning | … */
  state: string | null;
  /** None | Assign | Admin — the connected user's right on the capacity. */
  capacityUserAccessRight: string | null;
}

interface CapacitiesListBody {
  value?: Array<{
    id?: string;
    displayName?: string;
    sku?: string;
    state?: string;
    capacityUserAccessRight?: string;
  }>;
}

export async function capacitiesList(
  input: CapacitiesListInput,
): Promise<PowerBiCapacity[]> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "GET",
    path: "/capacities",
    operation: "capacities GET",
  });

  const body = (await res.json()) as CapacitiesListBody;
  const rows = body.value ?? [];
  const capacities: PowerBiCapacity[] = [];
  for (const row of rows) {
    if (typeof row.id !== "string" || typeof row.displayName !== "string")
      continue;
    capacities.push({
      id: row.id,
      displayName: row.displayName,
      sku: typeof row.sku === "string" ? row.sku : null,
      state: typeof row.state === "string" ? row.state : null,
      capacityUserAccessRight:
        typeof row.capacityUserAccessRight === "string"
          ? row.capacityUserAccessRight
          : null,
    });
  }
  return capacities;
}
