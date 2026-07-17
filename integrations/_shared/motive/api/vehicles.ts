import { motiveRequest } from "./_request";
import { NotFoundError } from "../errors";
import {
  projectVehicle,
  type MotiveRawVehicle,
  type ProjectedMotiveVehicle,
} from "../projections";

/**
 * Typed Vehicle API wrappers — MOTIVE-1.
 *
 * Wire format (docs/providers/motive/research.md §5). Single entity envelope
 * `{ vehicle: {...} }`; list envelope
 * `{ vehicles: [{ vehicle: {...} }], pagination }`. Bounded projections only.
 */

export interface VehicleFields {
  number: string;
  make?: string;
  model?: string;
  year?: string;
  vin?: string;
  licensePlateState?: string;
  licensePlateNumber?: string;
  status?: string;
}

interface VehicleEnvelope {
  vehicle?: MotiveRawVehicle;
}

interface VehicleListEnvelope {
  vehicles?: Array<{ vehicle?: MotiveRawVehicle }>;
  pagination?: { total?: number };
}

function toWireBody(fields: Partial<VehicleFields>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (fields.number !== undefined) body.number = fields.number;
  if (fields.make !== undefined) body.make = fields.make;
  if (fields.model !== undefined) body.model = fields.model;
  if (fields.year !== undefined) body.year = fields.year;
  if (fields.vin !== undefined) body.vin = fields.vin;
  if (fields.licensePlateState !== undefined)
    body.license_plate_state = fields.licensePlateState;
  if (fields.licensePlateNumber !== undefined)
    body.license_plate_number = fields.licensePlateNumber;
  if (fields.status !== undefined) body.status = fields.status;
  return body;
}

export async function vehicleCreate(input: {
  accessToken: string;
  fields: VehicleFields;
}): Promise<ProjectedMotiveVehicle> {
  const res = await motiveRequest<VehicleEnvelope>({
    accessToken: input.accessToken,
    method: "POST",
    path: "/v1/vehicles",
    data: { vehicle: toWireBody(input.fields) },
    resourceForNotFound: "vehicle create endpoint",
  });
  if (!res.vehicle) {
    throw new Error("Motive vehicle create returned no vehicle envelope.");
  }
  return projectVehicle(res.vehicle);
}

export async function vehicleUpdate(input: {
  accessToken: string;
  vehicleId: string;
  fields: Partial<VehicleFields>;
}): Promise<ProjectedMotiveVehicle> {
  const res = await motiveRequest<VehicleEnvelope>({
    accessToken: input.accessToken,
    method: "PUT",
    path: `/v1/vehicles/${encodeURIComponent(input.vehicleId)}`,
    data: { vehicle: toWireBody(input.fields) },
    resourceForNotFound: `vehicle ${input.vehicleId}`,
  });
  if (!res.vehicle) {
    throw new Error("Motive vehicle update returned no vehicle envelope.");
  }
  return projectVehicle(res.vehicle);
}

export async function vehicleGet(input: {
  accessToken: string;
  vehicleId: string;
}): Promise<ProjectedMotiveVehicle | null> {
  try {
    const res = await motiveRequest<VehicleEnvelope>({
      accessToken: input.accessToken,
      method: "GET",
      path: `/v1/vehicles/${encodeURIComponent(input.vehicleId)}`,
      resourceForNotFound: `vehicle ${input.vehicleId}`,
    });
    return res.vehicle ? projectVehicle(res.vehicle) : null;
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}

/** One bounded page of vehicles for the option source (id value, number label). */
export async function vehicleList(input: {
  accessToken: string;
  perPage: number;
}): Promise<ProjectedMotiveVehicle[]> {
  const query = new URLSearchParams({ per_page: String(Math.trunc(input.perPage)) });
  const res = await motiveRequest<VehicleListEnvelope>({
    accessToken: input.accessToken,
    method: "GET",
    path: "/v1/vehicles",
    query,
    resourceForNotFound: "vehicles",
  });
  return (res.vehicles ?? [])
    .map((wrapper) => wrapper.vehicle)
    .filter((v): v is MotiveRawVehicle => v != null)
    .map(projectVehicle);
}
