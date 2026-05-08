import { sendEmail } from "@/integrations/gmail/actions/sendEmail";
import { addAttendees } from "@/integrations/google-calendar/actions/addAttendees";
import { createEvent } from "@/integrations/google-calendar/actions/createEvent";
import { deleteEvent } from "@/integrations/google-calendar/actions/deleteEvent";
import { listEvents } from "@/integrations/google-calendar/actions/listEvents";
import { updateEvent } from "@/integrations/google-calendar/actions/updateEvent";
import { sendChannelMessage } from "@/integrations/slack/actions/sendChannelMessage";
import type { ActionHandler } from "./types";

/**
 * Hand-maintained action handler registry.
 *
 * Per docs/rules/provider-registry.md (same convention as the integration
 * manifest registry): explicit imports surface in PRs. Each provider's
 * action slice appends an entry to ALL_HANDLERS below.
 */

interface HandlerEntry {
  provider: string;
  /** Provider-scoped type matching WorkflowNode.type. */
  type: string;
  handler: ActionHandler;
}

const ALL_HANDLERS: ReadonlyArray<HandlerEntry> = [
  { provider: "slack", type: "send_channel_message", handler: sendChannelMessage },
  { provider: "gmail", type: "send_email", handler: sendEmail },
  { provider: "google-calendar", type: "create_event", handler: createEvent },
  { provider: "google-calendar", type: "list_events", handler: listEvents },
  { provider: "google-calendar", type: "update_event", handler: updateEvent },
  { provider: "google-calendar", type: "delete_event", handler: deleteEvent },
  { provider: "google-calendar", type: "add_attendees", handler: addAttendees },
];

const byKey: ReadonlyMap<string, ActionHandler> = (() => {
  const m = new Map<string, ActionHandler>();
  for (const entry of ALL_HANDLERS) {
    const key = `${entry.provider}:${entry.type}`;
    if (m.has(key)) {
      throw new Error(`Duplicate action handler registered for ${key}.`);
    }
    m.set(key, entry.handler);
  }
  return m;
})();

export function getActionHandler(
  provider: string,
  type: string,
): ActionHandler | undefined {
  return byKey.get(`${provider}:${type}`);
}

export function listRegisteredHandlers(): ReadonlyArray<{
  provider: string;
  type: string;
}> {
  return ALL_HANDLERS.map(({ provider, type }) => ({ provider, type }));
}
