import { motiveRequest } from "./_request";
import { NotFoundError } from "../errors";
import {
  projectDriver,
  type MotiveRawUser,
  type ProjectedMotiveDriver,
} from "../projections";

/**
 * Typed Driver/User API wrappers — MOTIVE-1.
 *
 * Motive models drivers as users with `role=driver`. Wire format
 * (docs/providers/motive/research.md §5): single envelope `{ user: {...} }`;
 * list envelope `{ users: [{ user: {...} }], pagination }`. Bounded
 * projections only.
 */

export interface DriverUpdateFields {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  status?: string;
}

interface UserEnvelope {
  user?: MotiveRawUser;
}

interface UserListEnvelope {
  users?: Array<{ user?: MotiveRawUser }>;
  pagination?: { total?: number };
}

export async function driverUpdate(input: {
  accessToken: string;
  driverId: string;
  fields: DriverUpdateFields;
}): Promise<ProjectedMotiveDriver> {
  const body: Record<string, unknown> = {};
  if (input.fields.firstName !== undefined) body.first_name = input.fields.firstName;
  if (input.fields.lastName !== undefined) body.last_name = input.fields.lastName;
  if (input.fields.phone !== undefined) body.phone = input.fields.phone;
  if (input.fields.email !== undefined) body.email = input.fields.email;
  if (input.fields.status !== undefined) body.status = input.fields.status;

  const res = await motiveRequest<UserEnvelope>({
    accessToken: input.accessToken,
    method: "PUT",
    path: `/v1/users/${encodeURIComponent(input.driverId)}`,
    data: { user: body },
    resourceForNotFound: `driver ${input.driverId}`,
  });
  if (!res.user) {
    throw new Error("Motive driver update returned no user envelope.");
  }
  return projectDriver(res.user);
}

export async function driverGet(input: {
  accessToken: string;
  driverId: string;
}): Promise<ProjectedMotiveDriver | null> {
  try {
    const res = await motiveRequest<UserEnvelope>({
      accessToken: input.accessToken,
      method: "GET",
      path: `/v1/users/${encodeURIComponent(input.driverId)}`,
      resourceForNotFound: `driver ${input.driverId}`,
    });
    return res.user ? projectDriver(res.user) : null;
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}

/** One bounded page of drivers for the option source (id value, name/email label). */
export async function driverList(input: {
  accessToken: string;
  perPage: number;
}): Promise<ProjectedMotiveDriver[]> {
  const query = new URLSearchParams({
    per_page: String(Math.trunc(input.perPage)),
    role: "driver",
  });
  const res = await motiveRequest<UserListEnvelope>({
    accessToken: input.accessToken,
    method: "GET",
    path: "/v1/users",
    query,
    resourceForNotFound: "drivers",
  });
  return (res.users ?? [])
    .map((wrapper) => wrapper.user)
    .filter((u): u is MotiveRawUser => u != null)
    .map(projectDriver);
}
