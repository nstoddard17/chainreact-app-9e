/**
 * Write smoke harness deps — Google + Outlook Calendar event read-backs.
 *
 * Extracted from writeHarnessDeps.ts (structure-only split; behavior unchanged).
 * Both serve create/update marker verify (summary/subject) AND delete absence
 * verify (exists==false). A typed NotFoundError (and, for Google, a 200 with
 * status "cancelled") maps to `exists:false`; ANY other error RE-THROWS. Each
 * provider read runs through `refreshAndRetry`.
 */
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { eventsGet as googleEventsGet } from "@/integrations/google-calendar/api/eventsGet";
import { NotFoundError as CalendarNotFoundError } from "@/integrations/google-calendar/api/errors";
import { eventsGet as outlookEventsGet } from "@/integrations/microsoft-outlook-calendar/api/eventsGet";
import { NotFoundError as GraphNotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import type { StepRunOutcome } from "../writeHarness";
import type { SmokeReaderContext, SmokeReaderInput } from "./context";

/**
 * Smoke read-back: `google-calendar:events_get` + `microsoft-outlook-calendar:events_get`.
 * Returns null for any other (provider, action).
 */
export async function calendarsSmokeReadBack(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome | null> {
  if (input.provider === "google-calendar" && input.action === "events_get") {
    const integration = await getActiveForExecution(ctx.accountId, "google-calendar", null, {
      connectedByUserId: ctx.userId,
    });
    if (!integration) return { ok: false, output: null, reason: "google-calendar not connected" };
    const eventId = input.config.eventId;
    const calendarId =
      typeof input.config.calendarId === "string" && input.config.calendarId
        ? input.config.calendarId
        : "primary";
    if (typeof eventId !== "string" || eventId.length === 0) {
      return { ok: false, output: null, reason: "events_get read-back: missing eventId" };
    }
    // Read-back for BOTH create/update marker verify (summary) AND delete
    // absence verify. A deleted single event surfaces EITHER as a typed 404
    // NotFoundError OR (briefly) as a 200 with status "cancelled" — both mean
    // gone, so `exists` is false for either. Any OTHER error re-throws to the
    // outer catch -> ok:false -> honest VERIFY_FAILED, never a false state.
    try {
      const event = await refreshAndRetry({
        accountId: ctx.accountId,
        provider: "google-calendar",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) => googleEventsGet({ accessToken, calendarId, eventId }),
      });
      const cancelled = event.status === "cancelled";
      // Bounded, sanitized: existence + the summary (for the marker) + status only.
      return {
        ok: true,
        output: { exists: !cancelled, summary: event.summary ?? null, status: event.status ?? null },
        reason: null,
      };
    } catch (err) {
      if (err instanceof CalendarNotFoundError) {
        return { ok: true, output: { exists: false }, reason: null };
      }
      throw err;
    }
  }

  if (input.provider === "microsoft-outlook-calendar" && input.action === "events_get") {
    const integration = await getActiveForExecution(ctx.accountId, "microsoft-outlook-calendar", null, {
      connectedByUserId: ctx.userId,
    });
    if (!integration) return { ok: false, output: null, reason: "microsoft-outlook-calendar not connected" };
    const eventId = input.config.eventId;
    if (typeof eventId !== "string" || eventId.length === 0) {
      return { ok: false, output: null, reason: "events_get read-back: missing eventId" };
    }
    // Read-back for BOTH create/update marker verify (subject) AND delete absence
    // verify. A deleted Outlook event is a TRUE delete -> Graph 404 -> typed
    // NotFoundError -> exists:false. Any OTHER error re-throws to the outer catch
    // -> ok:false -> honest VERIFY_FAILED (a permission/API failure never reads as
    // deleted). Bounded + sanitized: existence + the subject (for the marker) only.
    try {
      const event = await refreshAndRetry({
        accountId: ctx.accountId,
        provider: "microsoft-outlook-calendar",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) => outlookEventsGet({ accessToken, eventId }),
      });
      return { ok: true, output: { exists: true, subject: event.subject ?? null }, reason: null };
    } catch (err) {
      if (err instanceof GraphNotFoundError) {
        return { ok: true, output: { exists: false }, reason: null };
      }
      throw err;
    }
  }

  return null;
}
