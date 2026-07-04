/**
 * Shared bounded projection of a Calendly invitee webhook payload —
 * Slice 5.CALENDLY-1. PURE (no I/O, no clock, no RNG) — consumed by both
 * per-trigger normalizers, which stay thin (Asana keeps normalizers
 * separate per trigger; the Calendly created/canceled payloads share one
 * invitee shape, so the projection is factored here instead of
 * duplicated).
 *
 * Wire shape (docs/providers/calendly/research.md "Webhook payload
 * shape"): envelope `{ event, created_at, created_by, payload }` where
 * `payload` is the invitee object with an EMBEDDED `scheduled_event`.
 * An older payload generation lacked the embedded `scheduled_event`, so
 * every field sourced from it is nullable and its absence never throws.
 *
 * Projection rules:
 *   - Raw API URIs are reduced to their UUID path segments (inviteeId,
 *     eventId, eventTypeId, oldInviteeId, newInviteeId) — provider URLs
 *     never become workflow variables.
 *   - `cancel_url` / `reschedule_url` ARE projected: they are
 *     invitee-facing action links whose entire downstream purpose is
 *     "send the reschedule link to Slack/email". They are CAPABILITY
 *     URLs (anyone holding one can cancel/rebook), so the trigger metas
 *     mark them `sensitive: true`.
 *   - Invitee PII (email, hosts, questions and answers) marked sensitive
 *     in the metas (Typeform answers/hidden precedent).
 *   - `payment`, `no_show`, `reconfirmation`, `text_reminder_number`,
 *     `routing_form_submission` are deliberately NOT projected (out of
 *     slice scope; never spread raw provider structure).
 */

export interface CalendlyLocation {
  type?: string | null;
  location?: string | null;
  join_url?: string | null;
}

export interface CalendlyEventMembership {
  user?: string | null;
  user_email?: string | null;
  user_name?: string | null;
}

export interface CalendlyScheduledEvent {
  uri?: string | null;
  name?: string | null;
  status?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  event_type?: string | null;
  location?: CalendlyLocation | null;
  event_memberships?: CalendlyEventMembership[] | null;
}

export interface CalendlyCancellation {
  canceled_by?: string | null;
  reason?: string | null;
  canceler_type?: string | null;
}

export interface CalendlyQuestionAndAnswer {
  question?: string | null;
  answer?: string | null;
  position?: number | null;
}

export interface CalendlyTracking {
  utm_campaign?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  salesforce_uuid?: string | null;
}

/** The invitee object under the delivery envelope's `payload`. */
export interface CalendlyInviteePayload {
  uri?: string | null;
  email?: string | null;
  name?: string | null;
  status?: string | null;
  timezone?: string | null;
  created_at?: string | null;
  rescheduled?: boolean | null;
  old_invitee?: string | null;
  new_invitee?: string | null;
  cancel_url?: string | null;
  reschedule_url?: string | null;
  questions_and_answers?: CalendlyQuestionAndAnswer[] | null;
  tracking?: CalendlyTracking | null;
  cancellation?: CalendlyCancellation | null;
  scheduled_event?: CalendlyScheduledEvent | null;
}

/** The delivery envelope. */
export interface CalendlyWebhookEnvelope {
  event?: string;
  created_at?: string | null;
  created_by?: string | null;
  payload?: CalendlyInviteePayload | null;
}

/** Last path segment of a Calendly resource URI, or null. */
export function uuidFromUri(uri: string | null | undefined): string | null {
  if (typeof uri !== "string" || uri.length === 0) return null;
  const trimmed = uri.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  if (idx === -1 || idx === trimmed.length - 1) return null;
  return trimmed.slice(idx + 1);
}

export interface ProjectedHost {
  name: string | null;
  email: string | null;
}

export interface ProjectedQuestionAndAnswer {
  question: string | null;
  answer: string | null;
  position: number | null;
}

/** The shared bounded projection both trigger payloads are built from. */
export interface ProjectedInvitee {
  inviteeId: string | null;
  eventId: string | null;
  eventTypeId: string | null;
  inviteeName: string | null;
  inviteeEmail: string | null;
  inviteeTimezone: string | null;
  inviteeStatus: string | null;
  meetingName: string | null;
  startTime: string | null;
  endTime: string | null;
  location: { type: string | null; location: string | null; joinUrl: string | null } | null;
  hosts: ProjectedHost[];
  questionsAndAnswers: ProjectedQuestionAndAnswer[];
  tracking: {
    utmCampaign: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmContent: string | null;
    utmTerm: string | null;
    salesforceUuid: string | null;
  } | null;
  rescheduled: boolean;
  oldInviteeId: string | null;
  newInviteeId: string | null;
  cancelUrl: string | null;
  rescheduleUrl: string | null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function projectInvitee(
  payload: CalendlyInviteePayload | null | undefined,
): ProjectedInvitee {
  const invitee = payload ?? {};
  const scheduledEvent = invitee.scheduled_event ?? null;

  const location = scheduledEvent?.location
    ? {
        type: str(scheduledEvent.location.type),
        location: str(scheduledEvent.location.location),
        joinUrl: str(scheduledEvent.location.join_url),
      }
    : null;

  const hosts: ProjectedHost[] = [];
  for (const membership of scheduledEvent?.event_memberships ?? []) {
    hosts.push({
      name: str(membership?.user_name),
      email: str(membership?.user_email),
    });
  }

  const questionsAndAnswers: ProjectedQuestionAndAnswer[] = [];
  for (const qa of invitee.questions_and_answers ?? []) {
    questionsAndAnswers.push({
      question: str(qa?.question),
      answer: str(qa?.answer),
      position: typeof qa?.position === "number" ? qa.position : null,
    });
  }

  const tracking = invitee.tracking
    ? {
        utmCampaign: str(invitee.tracking.utm_campaign),
        utmSource: str(invitee.tracking.utm_source),
        utmMedium: str(invitee.tracking.utm_medium),
        utmContent: str(invitee.tracking.utm_content),
        utmTerm: str(invitee.tracking.utm_term),
        salesforceUuid: str(invitee.tracking.salesforce_uuid),
      }
    : null;

  return {
    inviteeId: uuidFromUri(invitee.uri),
    eventId: uuidFromUri(scheduledEvent?.uri) ?? eventUuidFromInviteeUri(invitee.uri),
    eventTypeId: uuidFromUri(scheduledEvent?.event_type),
    inviteeName: str(invitee.name),
    inviteeEmail: str(invitee.email),
    inviteeTimezone: str(invitee.timezone),
    inviteeStatus: str(invitee.status),
    meetingName: str(scheduledEvent?.name),
    startTime: str(scheduledEvent?.start_time),
    endTime: str(scheduledEvent?.end_time),
    location,
    hosts,
    questionsAndAnswers,
    tracking,
    rescheduled: invitee.rescheduled === true,
    oldInviteeId: uuidFromUri(invitee.old_invitee),
    newInviteeId: uuidFromUri(invitee.new_invitee),
    cancelUrl: str(invitee.cancel_url),
    rescheduleUrl: str(invitee.reschedule_url),
  };
}

/**
 * The invitee URI embeds the scheduled-event UUID:
 * `…/scheduled_events/{event_uuid}/invitees/{invitee_uuid}` — used as
 * the eventId fallback when the embedded scheduled_event is absent
 * (older payload generation).
 */
export function eventUuidFromInviteeUri(
  inviteeUri: string | null | undefined,
): string | null {
  if (typeof inviteeUri !== "string") return null;
  const match = inviteeUri.match(/\/scheduled_events\/([^/]+)\/invitees\//);
  return match ? (match[1] ?? null) : null;
}
