import type { ActionMeta } from "@/contracts/actionMeta";
import { FLEETIO_FIND_LINKED_VEHICLE_OUTPUTS } from "./findLinkedVehicle.output";

/**
 * Builder metadata for `fleetio:find_linked_vehicle` (5.TRUCK-BRIDGE-1 CS-3).
 *
 * Two Setup fields, no Advanced section, no option resolver, no raw JSON.
 *
 * **`requiresIntegration: false` — deliberately, and honestly.** This action
 * reads ChainReact's own vehicle-link table and calls no provider API. So the
 * builder must NOT demand a Fleetio connection to configure or run it, and the
 * real `testModeGate` allows it in test mode (it blocks anything with
 * `requiresIntegration: true`, reads included). `riskLevel: "low"` — a
 * read of one row the account already owns, with no side effect.
 *
 * **Telematics system is a static one-option select, not a resolver.** There is
 * exactly one telematics provider in V2 today, and the option list is a fixed
 * V2 capability statement, not an account-aware provider resource — a resolver
 * would be a network round-trip to restate a constant. It is REQUIRED with NO
 * `defaultValue` (Q11): the field decides which id namespace is looked up, and
 * a hidden default would silently pick a namespace for the user the moment a
 * second telematics provider ships.
 *
 * **Vehicle is a mappable text field, not a picker.** The value it is designed
 * for arrives at RUNTIME from a trigger (`{{trigger.vehicleId}}`), so there is
 * no design-time list to choose from — a picker would imply the user must know
 * a vehicle in advance, which is exactly the per-truck-workflow problem this
 * action removes. Manual entry stays available for a one-off / test run.
 * (A "pick a linked vehicle" picker would need an account id on
 * `OptionsResolverContext`, which this slice deliberately does not add — plan
 * §4.3 / Q3.)
 *
 * Readiness gaps read "Telematics system" and "Vehicle"; both direct and mapped
 * `{{...}}` values satisfy readiness, since readiness is computed from config
 * alone and no resolver needs to load.
 */
export const fleetioFindLinkedVehicleMeta: ActionMeta = {
  key: "fleetio:find_linked_vehicle",
  provider: "fleetio",
  type: "find_linked_vehicle",
  displayName: "Find Linked Fleetio Vehicle",
  description:
    "Look up the Fleetio vehicle that your team linked to a telematics vehicle, so one workflow can cover the whole fleet instead of one workflow per truck. Reads your saved vehicle links — it does not call Fleetio.",
  category: "data",
  requiresIntegration: false,
  fields: [
    {
      name: "sourceProvider",
      label: "Telematics system",
      type: "select",
      required: true,
      options: [{ value: "motive", label: "Motive" }],
      description:
        "Which telematics system the vehicle id below comes from. Motive is the only one ChainReact supports today.",
    },
    {
      name: "sourceVehicleId",
      label: "Vehicle",
      type: "text",
      required: true,
      placeholder: "{{trigger.vehicleId}}",
      description:
        "The Motive vehicle id from an earlier step — normally mapped straight from the trigger (e.g. {{trigger.vehicleId}}). You can also type one in for a single vehicle. ChainReact looks this id up in your saved vehicle links and returns the matching Fleetio vehicle; if it isn't linked yet, link it in Apps → Vehicle Links.",
    },
  ],
  outputs: [...FLEETIO_FIND_LINKED_VEHICLE_OUTPUTS],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 40,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
  riskDescription:
    "Reads one of your account's saved vehicle links. No Fleetio or Motive data is read or changed.",
};
