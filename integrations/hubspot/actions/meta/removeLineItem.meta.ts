import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `hubspot:remove_line_item`.
 *
 * Mirrors `removeLineItem.schema.ts` — 1 required field:
 * `lineItemId`. Handler issues `DELETE /crm/v3/objects/line_items/{id}`;
 * HubSpot returns 204 on success.
 *
 * **HIGH-RISK + DESTRUCTIVE + REQUIRES CONFIRMATION** — this is the
 * only HubSpot action that issues a DELETE against the CRM. Reverting
 * requires manually re-creating the line item with the same properties
 * (and re-associating to the parent deal). The schema's `.strict()`
 * also rejects V1's `confirmDelete` chrome at parse time — meta-level
 * `requiresConfirmation: true` is the authoritative confirmation gate.
 *
 * The destructive trio (`isDestructive`, `requiresConfirmation`,
 * `riskLevel: "high"`) drives:
 *   - the builder's typed-confirmation modal at design time;
 *   - the engine's test-mode short-circuit at run time (SEC-2);
 *   - the high-risk audit event in the executions log.
 *
 * Output is intentionally narrow — HubSpot's DELETE returns 204
 * with no body. `lineItemId` echoes the input; `deleted: true` is
 * a deterministic boolean for downstream branching. Neither carries
 * sensitive data.
 */
export const hubspotRemoveLineItemMeta: ActionMeta = {
  key: "hubspot:remove_line_item",
  provider: "hubspot",
  type: "remove_line_item",
  displayName: "Remove Line Item",
  description:
    "Permanently delete a HubSpot CRM line item via `DELETE /crm/v3/objects/line_items/{id}`. **DESTRUCTIVE** — there is no soft-delete or undo; reversing requires manually re-creating the line item with the same properties and re-associating it to the parent deal. Replaying a DELETE against an already-deleted line item returns 404 (the wrapper surfaces it as the canonical `NotFoundError`).",
  category: "crm",
  requiresIntegration: true,
  fields: [
    {
      name: "lineItemId",
      label: "Line item ID",
      description:
        "HubSpot line item id (numeric, returned by the API as a string). Usually wired from `{{hubspot:get_line_items.lineItems[0].id}}`. After deletion the id can no longer be used.",
      type: "text",
      required: true,
      placeholder: "12345",
    },
  ],
  outputs: [
    {
      name: "lineItemId",
      type: "string",
      description: "Echoed line item id — the id that was deleted.",
    },
    {
      name: "deleted",
      type: "boolean",
      description: "Always `true` when the action completes successfully. HubSpot's DELETE returns 204 with no body, so this is the deterministic success signal.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 260,
  isDestructive: true,
  requiresConfirmation: true,
  riskLevel: "high",
  riskDescription:
    "Permanently deletes a HubSpot CRM line item. No undo — reversing requires manually re-creating the line item with the same properties and re-associating it to the parent deal. Deal totals + sales reporting + quote / invoice generation downstream all drop the deleted line item.",
};
