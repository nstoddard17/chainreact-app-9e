import type { ActionMeta } from "@/contracts/actionMeta";
import { FLEETIO_CREATE_METER_ENTRY_OUTPUTS } from "./createMeterEntry.output";

/**
 * Builder metadata for `fleetio:create_meter_entry` (FLEETIO-4).
 *
 * Setup-first, four required fields and NO Advanced section — Fleetio's
 * `POST /meter_entries` needs exactly `vehicle_id`, `value` and `date`, plus the
 * primary/secondary meter choice. The endpoint's remaining optional field
 * (`void`) is deliberately NOT surfaced: recording a meter entry as void is not
 * a fleet-manager setup decision, and rule 4 says don't expose provider fields
 * merely because they exist.
 *
 * **No meter-unit picker (and no `fleetio:meter_units` resolver).** The plan
 * anticipated one; the 2025-05-05 schema disproved it. `POST /meter_entries`
 * accepts NO unit — Fleetio derives it from the Account's setting, optionally
 * overridden per Vehicle (`Vehicle.meter_unit` / `secondary_meter_unit`, enum
 * km|hr|mi). Adding a unit field would let a user "choose" something the write
 * cannot carry. There is likewise no vehicle-meters endpoint to resolve against:
 * a Fleetio vehicle has at most two meters, and they are addressed by the fixed
 * `meter_type` enum, not by id — so a static two-option select is the honest
 * widget, not an account-aware resolver.
 *
 * **Meter type is required with no default (Q11).** Writing an engine-hours
 * reading onto the primary (odometer) meter — or vice versa — silently corrupts
 * preventive-maintenance scheduling, so the choice is behaviour-switching and
 * must be explicit. Fleetio's own wire default (omitted ⇒ primary) is NOT
 * inherited as a hidden ChainReact default.
 *
 * **Reading date is required.** Fleetio lists `date` in the endpoint's required
 * set and does not default it server-side, so there is no provider default to
 * defer to and none is silently generated in the handler.
 *
 * Risk: creates a maintenance record that feeds PM scheduling. Recoverable —
 * Fleetio exposes `DELETE /meter_entries/{id}` and a void flag — so
 * `riskLevel: "medium"`, not destructive, no confirmation step (same posture as
 * Update Vehicle Status).
 */
export const fleetioCreateMeterEntryMeta: ActionMeta = {
  key: "fleetio:create_meter_entry",
  provider: "fleetio",
  type: "create_meter_entry",
  displayName: "Create Meter Entry",
  description:
    "Record an odometer, mileage, kilometer, or engine-hours reading for a Fleetio vehicle so preventive maintenance stays on schedule.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "vehicleId",
      label: "Vehicle",
      type: "combobox",
      optionsSource: "fleetio:vehicles",
      allowManualEntry: true,
      required: true,
      placeholder: "Search your Fleetio vehicles",
      description:
        "Choose a vehicle from your Fleetio account, or map a Fleetio vehicle id from an earlier step (e.g. {{trigger.vehicleId}}). This must be a Fleetio vehicle id — a Motive vehicle id is a different identifier and will not match.",
    },
    {
      name: "value",
      label: "Meter reading",
      type: "number",
      required: true,
      placeholder: "152340",
      description:
        "Select a value or map the current odometer/engine-hours reading from an earlier Motive step. Fleetio uses the unit already configured for this vehicle (miles, kilometers, or hours). Readings must move forward in time — an out-of-sequence value is rejected by Fleetio.",
    },
    {
      name: "meterType",
      label: "Meter",
      type: "select",
      required: true,
      options: [
        { value: "primary", label: "Primary meter (odometer / mileage)" },
        { value: "secondary", label: "Secondary meter (engine hours)" },
      ],
      description:
        "Which of the vehicle's meters this reading belongs to. Choose deliberately — recording hours against the odometer (or the reverse) throws off preventive-maintenance scheduling.",
    },
    {
      name: "readingDate",
      label: "Reading date",
      type: "datetime-utc",
      required: true,
      description:
        "When the reading was taken. Fleetio requires this and does not fill it in for you — pick a time, or map the timestamp from the upstream telematics step so the reading lands in the right position in the vehicle's meter history.",
    },
  ],
  outputs: [...FLEETIO_CREATE_METER_ENTRY_OUTPUTS],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 30,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Adds a meter reading to the company's Fleetio account, which feeds preventive-maintenance scheduling. Recoverable — the entry can be voided or deleted in Fleetio. Running it twice creates two entries.",
};
