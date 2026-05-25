import { crmPath, hubspotRequest } from "./_request";
import type { ContactsSearchFilter } from "./contacts";

/**
 * HubSpot CRM v3 `tickets` resource wrappers — Slice 13 Commit 4.
 *
 * Endpoints covered:
 *   - POST   /crm/v3/objects/tickets                    (create)
 *   - PATCH  /crm/v3/objects/tickets/{id}               (update)
 *   - GET    /crm/v3/objects/tickets/{id}               (read by id)
 *   - POST   /crm/v3/objects/tickets/search             (search)
 *
 * Required at the schema layer: `subject`, `hs_pipeline`,
 * `hs_pipeline_stage` — matches V1's createTicket enforcement.
 *
 * Reuses `ContactsSearchFilter` for search filter shape (identical
 * across CRM standard objects).
 *
 * NOTE: Ticket attachments (V1 ships file-upload + ticket_to_file
 * association) are explicitly deferred — they require a file-storage
 * abstraction that's out of scope for Slice 13.
 */

export interface HubSpotTicket {
  id: string;
  properties: Record<string, string | null>;
  createdAt?: string;
  updatedAt?: string;
  archived?: boolean;
}

export interface TicketsSearchResponse {
  total: number;
  results: HubSpotTicket[];
  paging?: { next?: { after?: string; link?: string } };
}

export interface TicketsCreateInput {
  accessToken: string;
  properties: Record<string, string>;
}

export async function ticketsCreate(
  input: TicketsCreateInput,
): Promise<HubSpotTicket> {
  return hubspotRequest<HubSpotTicket>({
    accessToken: input.accessToken,
    method: "POST",
    path: crmPath("objects/tickets"),
    body: { properties: input.properties },
    resourceForNotFound: "ticket (create)",
  });
}

export interface TicketsUpdateInput {
  accessToken: string;
  ticketId: string;
  properties: Record<string, string>;
}

export async function ticketsUpdate(
  input: TicketsUpdateInput,
): Promise<HubSpotTicket> {
  return hubspotRequest<HubSpotTicket>({
    accessToken: input.accessToken,
    method: "PATCH",
    path: crmPath(`objects/tickets/${encodeURIComponent(input.ticketId)}`),
    body: { properties: input.properties },
    resourceForNotFound: `ticket ${input.ticketId}`,
  });
}

export interface TicketsGetInput {
  accessToken: string;
  ticketId: string;
  properties?: readonly string[];
}

export async function ticketsGet(
  input: TicketsGetInput,
): Promise<HubSpotTicket> {
  const query =
    input.properties && input.properties.length > 0
      ? new URLSearchParams({ properties: input.properties.join(",") })
      : undefined;
  return hubspotRequest<HubSpotTicket>({
    accessToken: input.accessToken,
    method: "GET",
    path: crmPath(`objects/tickets/${encodeURIComponent(input.ticketId)}`),
    ...(query ? { query } : {}),
    resourceForNotFound: `ticket ${input.ticketId}`,
  });
}

export interface TicketsSearchInput {
  accessToken: string;
  limit?: number;
  after?: string;
  properties?: readonly string[];
  filters?: readonly ContactsSearchFilter[];
}

export async function ticketsSearch(
  input: TicketsSearchInput,
): Promise<TicketsSearchResponse> {
  const body: Record<string, unknown> = {
    limit: Math.min(input.limit ?? 100, 100),
  };
  if (input.properties && input.properties.length > 0) {
    body.properties = [...input.properties];
  }
  if (input.after) {
    body.after = input.after;
  }
  if (input.filters && input.filters.length > 0) {
    body.filterGroups = [{ filters: [...input.filters] }];
  }
  return hubspotRequest<TicketsSearchResponse>({
    accessToken: input.accessToken,
    method: "POST",
    path: crmPath("objects/tickets/search"),
    body,
    resourceForNotFound: "ticket (search)",
  });
}
