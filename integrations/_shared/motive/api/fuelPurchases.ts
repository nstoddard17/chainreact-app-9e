import { motiveRequest } from "./_request";
import { NotFoundError } from "../errors";
import {
  projectFuelPurchase,
  type MotiveRawFuelPurchase,
  type ProjectedMotiveFuelPurchase,
} from "../projections";

/**
 * Typed Fuel Purchase API wrappers — MOTIVE-1.
 *
 * Wire format (docs/providers/motive/research.md §4). Motive wraps single
 * entities in an entity envelope (`{ fuel_purchase: {...} }`) and list items in
 * a nested envelope (`{ fuel_purchases: [{ fuel_purchase: {...} }], pagination }`)
 * — the legacy KeepTruckin convention. Create/update send the same envelope.
 * All wrappers return bounded projections — never raw records.
 *
 * Endpoints:
 *   - List:   `GET  /v1/fuel_purchases`
 *   - Get:    `GET  /v1/fuel_purchases/{id}`
 *   - Create: `POST /v1/fuel_purchases`
 *   - Update: `PUT  /v1/fuel_purchases/{id}`
 *   - Delete: `DELETE /v1/fuel_purchases/{id}`
 *   - Import: `POST /v1/fuel_purchases/imports` (bulk CSV — path/body UNVERIFIED,
 *     overridable via MOTIVE_FUEL_IMPORT_PATH; confirmed at live cert / Phase 13).
 */

export interface FuelPurchaseFields {
  vehicleId: number | string;
  driverId: number | string;
  purchasedAt: string;
  jurisdiction: string;
  fuelType: string;
  fuel: number;
  fuelUnit: string;
  totalCost?: number;
  currency?: string;
  refNo?: string;
  vendor?: string;
  odometer?: number;
  odometerUnit?: string;
  location?: string;
}

interface FuelPurchaseEnvelope {
  fuel_purchase?: MotiveRawFuelPurchase;
}

interface FuelPurchaseListEnvelope {
  fuel_purchases?: Array<{ fuel_purchase?: MotiveRawFuelPurchase }>;
  pagination?: { per_page?: number; page_no?: number; total?: number };
}

/** Build the Motive wire body from V2-shaped fields (only set fields are sent). */
function toWireBody(fields: Partial<FuelPurchaseFields>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (fields.vehicleId !== undefined) body.vehicle_id = fields.vehicleId;
  if (fields.driverId !== undefined) body.driver_id = fields.driverId;
  if (fields.purchasedAt !== undefined) body.purchased_at = fields.purchasedAt;
  if (fields.jurisdiction !== undefined) body.jurisdiction = fields.jurisdiction;
  if (fields.fuelType !== undefined) body.fuel_type = fields.fuelType;
  if (fields.fuel !== undefined) body.fuel = fields.fuel;
  if (fields.fuelUnit !== undefined) body.fuel_unit = fields.fuelUnit;
  if (fields.totalCost !== undefined) body.total_cost = fields.totalCost;
  if (fields.currency !== undefined) body.currency = fields.currency;
  if (fields.refNo !== undefined) body.ref_no = fields.refNo;
  if (fields.vendor !== undefined) body.vendor = fields.vendor;
  if (fields.odometer !== undefined) body.odometer = fields.odometer;
  if (fields.odometerUnit !== undefined) body.odometer_unit = fields.odometerUnit;
  if (fields.location !== undefined) body.location = fields.location;
  return body;
}

export async function fuelPurchaseCreate(input: {
  accessToken: string;
  fields: FuelPurchaseFields;
}): Promise<ProjectedMotiveFuelPurchase> {
  const res = await motiveRequest<FuelPurchaseEnvelope>({
    accessToken: input.accessToken,
    method: "POST",
    path: "/v1/fuel_purchases",
    data: { fuel_purchase: toWireBody(input.fields) },
    resourceForNotFound: "fuel purchase create endpoint",
  });
  if (!res.fuel_purchase) {
    throw new Error("Motive fuel purchase create returned no fuel_purchase envelope.");
  }
  return projectFuelPurchase(res.fuel_purchase);
}

export async function fuelPurchaseUpdate(input: {
  accessToken: string;
  fuelPurchaseId: string;
  fields: Partial<FuelPurchaseFields>;
}): Promise<ProjectedMotiveFuelPurchase> {
  const res = await motiveRequest<FuelPurchaseEnvelope>({
    accessToken: input.accessToken,
    method: "PUT",
    path: `/v1/fuel_purchases/${encodeURIComponent(input.fuelPurchaseId)}`,
    data: { fuel_purchase: toWireBody(input.fields) },
    resourceForNotFound: `fuel purchase ${input.fuelPurchaseId}`,
  });
  if (!res.fuel_purchase) {
    throw new Error("Motive fuel purchase update returned no fuel_purchase envelope.");
  }
  return projectFuelPurchase(res.fuel_purchase);
}

/** Read one fuel purchase by id. Returns `null` on 404 (friendly lookup). */
export async function fuelPurchaseGet(input: {
  accessToken: string;
  fuelPurchaseId: string;
}): Promise<ProjectedMotiveFuelPurchase | null> {
  try {
    const res = await motiveRequest<FuelPurchaseEnvelope>({
      accessToken: input.accessToken,
      method: "GET",
      path: `/v1/fuel_purchases/${encodeURIComponent(input.fuelPurchaseId)}`,
      resourceForNotFound: `fuel purchase ${input.fuelPurchaseId}`,
    });
    return res.fuel_purchase ? projectFuelPurchase(res.fuel_purchase) : null;
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}

export async function fuelPurchaseDelete(input: {
  accessToken: string;
  fuelPurchaseId: string;
}): Promise<void> {
  await motiveRequest<Record<string, never>>({
    accessToken: input.accessToken,
    method: "DELETE",
    path: `/v1/fuel_purchases/${encodeURIComponent(input.fuelPurchaseId)}`,
    resourceForNotFound: `fuel purchase ${input.fuelPurchaseId}`,
  });
}

export interface FuelPurchaseListInput {
  accessToken: string;
  startDate?: string;
  endDate?: string;
  fuelType?: string;
  vehicleIds?: string;
  perPage: number;
  pageNo: number;
}

export interface FuelPurchaseListResult {
  items: ProjectedMotiveFuelPurchase[];
  total: number | null;
}

export async function fuelPurchaseList(
  input: FuelPurchaseListInput,
): Promise<FuelPurchaseListResult> {
  const query = new URLSearchParams();
  if (input.startDate) query.set("start_date", input.startDate);
  if (input.endDate) query.set("end_date", input.endDate);
  if (input.fuelType) query.set("fuel_type", input.fuelType);
  if (input.vehicleIds) query.set("vehicle_ids", input.vehicleIds);
  query.set("per_page", String(Math.trunc(input.perPage)));
  query.set("page_no", String(Math.trunc(input.pageNo)));

  const res = await motiveRequest<FuelPurchaseListEnvelope>({
    accessToken: input.accessToken,
    method: "GET",
    path: "/v1/fuel_purchases",
    query,
    resourceForNotFound: "fuel purchases",
  });

  const items = (res.fuel_purchases ?? [])
    .map((wrapper) => wrapper.fuel_purchase)
    .filter((fp): fp is MotiveRawFuelPurchase => fp != null)
    .map(projectFuelPurchase);

  return {
    items,
    total: typeof res.pagination?.total === "number" ? res.pagination.total : null,
  };
}

export interface FuelImportResult {
  /** Motive accepted the import request. */
  accepted: boolean;
  /** Async import job id, when Motive returns one. */
  jobId: string | null;
  /** Rows Motive reports queued/accepted, when returned. */
  acceptedCount: number | null;
  /** Sanitized status/message, when returned. */
  message: string | null;
}

/**
 * Bulk CSV fuel-purchase import — MOTIVE-1 (**live-cert-gated**).
 *
 * The exact endpoint path + request body + async-job contract are NOT in
 * Motive's public docs (partner-portal-gated). This wrapper POSTs the CSV to a
 * tentative path (`MOTIVE_FUEL_IMPORT_PATH` override) as a JSON body carrying
 * the CSV text; the response is parsed defensively into a bounded summary.
 * Confirmed / corrected during live certification (Phase 13). The Setup UX is
 * complete regardless — this is an external-API verification gate, not a
 * usability deferral.
 */
export async function fuelPurchaseImportCsv(input: {
  accessToken: string;
  csv: string;
  dryRun: boolean;
}): Promise<FuelImportResult> {
  const path = process.env.MOTIVE_FUEL_IMPORT_PATH ?? "/v1/fuel_purchases/imports";
  const res = await motiveRequest<{
    id?: number | string;
    job_id?: number | string;
    accepted?: number;
    imported_count?: number;
    status?: string;
    message?: string;
  }>({
    accessToken: input.accessToken,
    method: "POST",
    path,
    data: { format: "csv", dry_run: input.dryRun, csv: input.csv },
    resourceForNotFound: "fuel purchase import endpoint",
  });
  const jobId =
    res.job_id != null ? String(res.job_id) : res.id != null ? String(res.id) : null;
  const acceptedCount =
    typeof res.accepted === "number"
      ? res.accepted
      : typeof res.imported_count === "number"
        ? res.imported_count
        : null;
  return {
    accepted: true,
    jobId,
    acceptedCount,
    message:
      typeof res.message === "string"
        ? res.message
        : typeof res.status === "string"
          ? res.status
          : null,
  };
}
