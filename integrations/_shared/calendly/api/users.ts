import { calendlyRequest } from "./_request";

/**
 * Typed Calendly current-user wrapper — Slice 5.CALENDLY-1.
 *
 * `GET /users/me` (scope `users:read`). Returns the `resource` envelope
 * unwrapped. Used at connect time (oauth.ts resolves display identity)
 * and as the fallback identity source for trigger activation and the
 * event-types option source when the integration row's account metadata
 * predates this slice or was persisted without the URIs.
 */

export interface CalendlyUser {
  uri?: string;
  name?: string | null;
  email?: string | null;
  slug?: string | null;
  current_organization?: string | null;
}

interface UsersMeEnvelope {
  resource?: CalendlyUser | null;
}

export async function usersMe(input: {
  accessToken: string;
}): Promise<CalendlyUser> {
  const envelope = await calendlyRequest<UsersMeEnvelope>({
    accessToken: input.accessToken,
    method: "GET",
    path: "/users/me",
    resourceForNotFound: "current user",
  });
  const resource = envelope.resource;
  if (!resource || typeof resource.uri !== "string" || resource.uri.length === 0) {
    throw new Error("Calendly /users/me response missing resource.uri.");
  }
  return resource;
}
