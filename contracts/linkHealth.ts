import { z } from "zod";

/**
 * Link-health status vocabulary (5.TRUCK-BRIDGE-1 CS-5).
 *
 * This union crosses the server→client boundary (`VehicleLinkHealthView` in
 * [`vehicleSuggestions.ts`](./vehicleSuggestions.ts)), so the canonical
 * definition lives in `contracts/` — the assessment logic that PRODUCES these
 * statuses stays in `core/resourceLinks/linkHealth.ts`, which imports the type
 * from here (core may import contracts; contracts must import nothing but zod
 * and siblings — pinned by `tests/structure/contracts-purity.test.ts`).
 *
 * Semantics (documented in full at the assessor):
 *   `ok`              — both sides visible.
 *   `source_missing`  — the source provider no longer lists this vehicle.
 *   `target_missing`  — the target provider no longer lists this vehicle.
 *   `target_archived` — the target lists it, explicitly archived.
 *   `source_unknown`  — the source list could not be loaded. NOT missing.
 *   `target_unknown`  — the target list could not be loaded. NOT missing.
 */
export const LINK_HEALTH_STATUSES = [
  "ok",
  "source_missing",
  "target_missing",
  "target_archived",
  "source_unknown",
  "target_unknown",
] as const;

export const LinkHealthStatusSchema = z.enum(LINK_HEALTH_STATUSES);
export type LinkHealthStatus = (typeof LINK_HEALTH_STATUSES)[number];
