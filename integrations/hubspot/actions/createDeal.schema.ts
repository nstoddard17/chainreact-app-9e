import { z } from "zod";

/**
 * `create_deal` action schema — Slice 13 Batch 1.
 *
 * Required: `dealname`, `dealstage`. V1's createHubSpotDeal enforces
 * both [hubspot.ts:806-812](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot.ts#L806).
 *
 * `pipeline` is optional — HubSpot defaults to the portal's "default"
 * pipeline when omitted. `amount` accepts a string per HubSpot's wire
 * format (server-side coercion handles numerics).
 *
 * NO duplicate handling on deals: HubSpot deals don't have a natural
 * unique-by-property contract (dealname can repeat). Create-with-409
 * isn't a documented behavior for deals; if HubSpot ever returns 409
 * the handler surfaces it as an error.
 */
export const CreateDealConfigSchema = z
  .object({
    dealname: z.string().min(1),
    dealstage: z.string().min(1),
    pipeline: z.string().min(1).optional(),
    amount: z.string().min(1).optional(),
    closedate: z.string().min(1).optional(),
    dealtype: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    hubspot_owner_id: z.string().min(1).optional(),
  })
  .strict();

export type CreateDealConfig = z.infer<typeof CreateDealConfigSchema>;
