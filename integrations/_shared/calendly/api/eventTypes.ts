import { calendlyRequest } from "./_request";

/**
 * Typed Calendly event-types wrapper — Slice 5.CALENDLY-1.
 *
 * `GET /event_types?user=<user_uri>&active=true` (scope
 * `event_types:read`). One page per call with Calendly's cursor
 * pagination (`count` max 100, `pagination.next_page_token`) — the
 * bounded-page rule; no server-side name search is documented, so the
 * option resolver filters locally.
 */

export interface CalendlyEventType {
  uri?: string;
  name?: string | null;
  active?: boolean;
  slug?: string | null;
  duration?: number | null;
}

interface EventTypesEnvelope {
  collection?: CalendlyEventType[] | null;
  pagination?: {
    next_page_token?: string | null;
  } | null;
}

export interface EventTypesListInput {
  accessToken: string;
  /** The connected user's URI — event types are listed user-scoped. */
  userUri: string;
  /** Max 100 per Calendly's API conventions. */
  count?: number;
  pageToken?: string;
}

export interface EventTypesPage {
  items: CalendlyEventType[];
  hasMore: boolean;
  nextPageToken: string | null;
}

export async function eventTypesList(
  input: EventTypesListInput,
): Promise<EventTypesPage> {
  const query = new URLSearchParams({
    user: input.userUri,
    active: "true",
    count: String(Math.min(input.count ?? 100, 100)),
  });
  if (input.pageToken) query.set("page_token", input.pageToken);

  const envelope = await calendlyRequest<EventTypesEnvelope>({
    accessToken: input.accessToken,
    method: "GET",
    path: "/event_types",
    query,
    resourceForNotFound: "event types",
  });

  const items = Array.isArray(envelope.collection) ? envelope.collection : [];
  const nextPageToken =
    typeof envelope.pagination?.next_page_token === "string" &&
    envelope.pagination.next_page_token.length > 0
      ? envelope.pagination.next_page_token
      : null;
  return { items, hasMore: nextPageToken !== null, nextPageToken };
}
