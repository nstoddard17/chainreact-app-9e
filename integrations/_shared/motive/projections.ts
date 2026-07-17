/**
 * Bounded projections for Motive (gomotive.com) entities — MOTIVE-1.
 *
 * One narrow projection per entity, shared by the actions and the webhook /
 * polling trigger normalizers so a fuel purchase / vehicle / driver looks
 * identical whether it came from an action read or a trigger fire. NEVER a raw
 * spread: Motive records carry gateway internals, provider deep-link URLs, and
 * nested account blocks that are all deliberately dropped at this boundary.
 * Receipt files are exposed only as a URL reference — never bytes.
 *
 * PII / money sensitivity is declared in the action/trigger metas, not here —
 * projections stay pure data.
 */

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  // Motive returns some numeric fields (fuel, total_cost) as strings.
  if (typeof v === "string" && v.trim().length > 0) {
    const parsed = Number(v);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function idStr(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return str(v);
}

// ─── Raw wire shapes (narrow — only the fields we project) ─────────────────

export interface MotiveRawVehicleSummary {
  id?: number | string;
  number?: string | null;
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
  vin?: string | null;
}

export interface MotiveRawUserSummary {
  id?: number | string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  email?: string | null;
  role?: string | null;
  status?: string | null;
}

export interface MotiveRawFuelPurchase {
  id?: number | string;
  offline_id?: string | null;
  purchased_at?: string | null;
  jurisdiction?: string | null;
  fuel_type?: string | null;
  ref_no?: string | null;
  vendor?: string | null;
  total_cost?: number | string | null;
  currency?: string | null;
  fuel?: number | string | null;
  fuel_unit?: string | null;
  odometer?: number | string | null;
  odometer_unit?: string | null;
  receipt_upload_url?: string | null;
  receipt_filename?: string | null;
  location?: string | null;
  vehicle?: MotiveRawVehicleSummary | null;
  driver?: MotiveRawUserSummary | null;
}

export interface MotiveRawVehicle {
  id?: number | string;
  number?: string | null;
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
  vin?: string | null;
  license_plate_state?: string | null;
  license_plate_number?: string | null;
  status?: string | null;
  ifta?: boolean | null;
  metric_units?: boolean | null;
}

export interface MotiveRawUser {
  id?: number | string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  status?: string | null;
  driver_company_id?: string | null;
}

// ─── Projected shapes (what workflows see) ──────────────────────────────────

export interface ProjectedMotiveVehicleRef {
  vehicleId: string | null;
  number: string | null;
  year: string | null;
  make: string | null;
  model: string | null;
  vin: string | null;
}

export interface ProjectedMotiveDriverRef {
  driverId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  status: string | null;
}

export interface ProjectedMotiveFuelPurchase {
  fuelPurchaseId: string | null;
  purchasedAt: string | null;
  jurisdiction: string | null;
  fuelType: string | null;
  fuel: number | null;
  fuelUnit: string | null;
  totalCost: number | null;
  currency: string | null;
  vendor: string | null;
  refNo: string | null;
  odometer: number | null;
  odometerUnit: string | null;
  location: string | null;
  /** URL reference to the uploaded receipt — never bytes. Nullable. */
  receiptUrl: string | null;
  receiptFilename: string | null;
  vehicle: ProjectedMotiveVehicleRef | null;
  driver: ProjectedMotiveDriverRef | null;
}

export interface ProjectedMotiveVehicle {
  vehicleId: string | null;
  number: string | null;
  year: string | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  licensePlateState: string | null;
  licensePlateNumber: string | null;
  status: string | null;
  ifta: boolean | null;
}

export interface ProjectedMotiveDriver {
  driverId: string | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  status: string | null;
}

// ─── Projection functions ───────────────────────────────────────────────────

function projectVehicleRef(
  raw: MotiveRawVehicleSummary | null | undefined,
): ProjectedMotiveVehicleRef | null {
  if (!raw) return null;
  return {
    vehicleId: idStr(raw.id),
    number: str(raw.number),
    year: raw.year != null ? String(raw.year) : null,
    make: str(raw.make),
    model: str(raw.model),
    vin: str(raw.vin),
  };
}

function projectDriverRef(
  raw: MotiveRawUserSummary | null | undefined,
): ProjectedMotiveDriverRef | null {
  if (!raw) return null;
  return {
    driverId: idStr(raw.id),
    firstName: str(raw.first_name),
    lastName: str(raw.last_name),
    email: str(raw.email),
    status: str(raw.status),
  };
}

export function projectFuelPurchase(
  raw: MotiveRawFuelPurchase,
): ProjectedMotiveFuelPurchase {
  return {
    fuelPurchaseId: idStr(raw.id),
    purchasedAt: str(raw.purchased_at),
    jurisdiction: str(raw.jurisdiction),
    fuelType: str(raw.fuel_type),
    fuel: num(raw.fuel),
    fuelUnit: str(raw.fuel_unit),
    totalCost: num(raw.total_cost),
    currency: str(raw.currency),
    vendor: str(raw.vendor),
    refNo: str(raw.ref_no),
    odometer: num(raw.odometer),
    odometerUnit: str(raw.odometer_unit),
    location: str(raw.location),
    receiptUrl: str(raw.receipt_upload_url),
    receiptFilename: str(raw.receipt_filename),
    vehicle: projectVehicleRef(raw.vehicle),
    driver: projectDriverRef(raw.driver),
  };
}

export function projectVehicle(raw: MotiveRawVehicle): ProjectedMotiveVehicle {
  return {
    vehicleId: idStr(raw.id),
    number: str(raw.number),
    year: raw.year != null ? String(raw.year) : null,
    make: str(raw.make),
    model: str(raw.model),
    vin: str(raw.vin),
    licensePlateState: str(raw.license_plate_state),
    licensePlateNumber: str(raw.license_plate_number),
    status: str(raw.status),
    ifta: typeof raw.ifta === "boolean" ? raw.ifta : null,
  };
}

export function projectDriver(raw: MotiveRawUser): ProjectedMotiveDriver {
  return {
    driverId: idStr(raw.id),
    firstName: str(raw.first_name),
    lastName: str(raw.last_name),
    username: str(raw.username),
    email: str(raw.email),
    phone: str(raw.phone),
    role: str(raw.role),
    status: str(raw.status),
  };
}
