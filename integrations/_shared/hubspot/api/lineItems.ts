import { crmPath, hubspotRequest } from "./_request";

/**
 * HubSpot CRM v3 `line_items` resource wrappers — Slice 13 Commit 4.
 *
 * Endpoints:
 *   - POST  /crm/v3/objects/line_items                   (create)
 *   - PATCH /crm/v3/objects/line_items/{id}              (update)
 *
 * Line items represent a quantity of a product associated with a deal.
 * Required property at the schema layer: either `hs_product_id` (link
 * to an existing product) OR `name` (free-form line item), plus
 * `quantity` (string).
 *
 * Association to a deal is handled by
 * `_shared/hubspot/api/associations.ts:attachAssociations` after the
 * line item is created (line_item→deal type id = 20).
 */

export interface HubSpotLineItem {
  id: string;
  properties: Record<string, string | null>;
  createdAt?: string;
  updatedAt?: string;
  archived?: boolean;
}

export interface LineItemsCreateInput {
  accessToken: string;
  properties: Record<string, string>;
}

export async function lineItemsCreate(
  input: LineItemsCreateInput,
): Promise<HubSpotLineItem> {
  return hubspotRequest<HubSpotLineItem>({
    accessToken: input.accessToken,
    method: "POST",
    path: crmPath("objects/line_items"),
    body: { properties: input.properties },
    resourceForNotFound: "line item (create)",
  });
}

export interface LineItemsUpdateInput {
  accessToken: string;
  lineItemId: string;
  properties: Record<string, string>;
}

export async function lineItemsUpdate(
  input: LineItemsUpdateInput,
): Promise<HubSpotLineItem> {
  return hubspotRequest<HubSpotLineItem>({
    accessToken: input.accessToken,
    method: "PATCH",
    path: crmPath(`objects/line_items/${encodeURIComponent(input.lineItemId)}`),
    body: { properties: input.properties },
    resourceForNotFound: `line item ${input.lineItemId}`,
  });
}
