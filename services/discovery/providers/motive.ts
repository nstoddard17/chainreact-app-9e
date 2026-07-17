import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Motive discovery sub-registry — MOTIVE-1.
 *
 * Fifth net-new V2 provider (no V1 code — see
 * docs/providers/motive/v2-pattern-audit.md). Actions AND triggers ship in the
 * first slice, so `motive` joins COVERED_PROVIDERS immediately and 1:1
 * handler↔meta drift is enforced from day one.
 *
 * **Coverage:** 10 bounded actions + 7 company-webhook triggers + 1 fuel-purchase
 * polling trigger.
 *
 * **Actions:** create / import-CSV / list / get / update / delete fuel purchase;
 * send message; create / update vehicle; update driver. Vehicle + driver fields
 * are account-aware pickers (motive:vehicles / motive:drivers).
 *
 * **Triggers:** new_inspection_report / new_hos_violation / new_safety_event /
 * new_speeding_event / new_fault_code / new_vehicle / new_driver — per-company
 * webhook (`POST /v1/company_webhooks`, HMAC-SHA1 verified). new_fuel_purchase
 * polls (Motive exposes no fuel webhook), baseline-first. Activation +
 * deactivation/polling registered in
 * `integrations/motive/triggers/<event>/index.ts`, satisfying the
 * trigger-meta-activation-invariant test without an exemption.
 */

import { motiveCreateFuelPurchaseMeta } from "@/integrations/motive/actions/createFuelPurchase.meta";
import { motiveImportFuelPurchasesCsvMeta } from "@/integrations/motive/actions/importFuelPurchasesCsv.meta";
import { motiveListFuelPurchasesMeta } from "@/integrations/motive/actions/listFuelPurchases.meta";
import { motiveGetFuelPurchaseMeta } from "@/integrations/motive/actions/getFuelPurchase.meta";
import { motiveUpdateFuelPurchaseMeta } from "@/integrations/motive/actions/updateFuelPurchase.meta";
import { motiveDeleteFuelPurchaseMeta } from "@/integrations/motive/actions/deleteFuelPurchase.meta";
import { motiveSendMessageMeta } from "@/integrations/motive/actions/sendMessage.meta";
import { motiveCreateVehicleMeta } from "@/integrations/motive/actions/createVehicle.meta";
import { motiveUpdateVehicleMeta } from "@/integrations/motive/actions/updateVehicle.meta";
import { motiveUpdateDriverMeta } from "@/integrations/motive/actions/updateDriver.meta";
import { motiveNewInspectionReportTriggerMeta } from "@/integrations/motive/triggers/newInspectionReport/newInspectionReport.meta";
import { motiveNewHosViolationTriggerMeta } from "@/integrations/motive/triggers/newHosViolation/newHosViolation.meta";
import { motiveNewSafetyEventTriggerMeta } from "@/integrations/motive/triggers/newSafetyEvent/newSafetyEvent.meta";
import { motiveNewSpeedingEventTriggerMeta } from "@/integrations/motive/triggers/newSpeedingEvent/newSpeedingEvent.meta";
import { motiveNewFaultCodeTriggerMeta } from "@/integrations/motive/triggers/newFaultCode/newFaultCode.meta";
import { motiveNewVehicleTriggerMeta } from "@/integrations/motive/triggers/newVehicle/newVehicle.meta";
import { motiveNewDriverTriggerMeta } from "@/integrations/motive/triggers/newDriver/newDriver.meta";
import { motiveNewFuelPurchaseTriggerMeta } from "@/integrations/motive/triggers/newFuelPurchase/newFuelPurchase.meta";

/** Motive action metas — displayOrder 10..90. */
export const MOTIVE_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  motiveCreateFuelPurchaseMeta,
  motiveImportFuelPurchasesCsvMeta,
  motiveListFuelPurchasesMeta,
  motiveGetFuelPurchaseMeta,
  motiveUpdateFuelPurchaseMeta,
  motiveDeleteFuelPurchaseMeta,
  motiveSendMessageMeta,
  motiveCreateVehicleMeta,
  motiveUpdateVehicleMeta,
  motiveUpdateDriverMeta,
];

/** Motive trigger metas — displayOrder 10..80. */
export const MOTIVE_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [
  motiveNewInspectionReportTriggerMeta,
  motiveNewHosViolationTriggerMeta,
  motiveNewSafetyEventTriggerMeta,
  motiveNewSpeedingEventTriggerMeta,
  motiveNewFaultCodeTriggerMeta,
  motiveNewVehicleTriggerMeta,
  motiveNewDriverTriggerMeta,
  motiveNewFuelPurchaseTriggerMeta,
];
