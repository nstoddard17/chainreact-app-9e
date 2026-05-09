import { sendEmail } from "@/integrations/gmail/actions/sendEmail";
import { addAttendees } from "@/integrations/google-calendar/actions/addAttendees";
import { createEvent } from "@/integrations/google-calendar/actions/createEvent";
import { deleteEvent } from "@/integrations/google-calendar/actions/deleteEvent";
import { listEvents } from "@/integrations/google-calendar/actions/listEvents";
import { updateEvent } from "@/integrations/google-calendar/actions/updateEvent";
import { createFolder } from "@/integrations/google-drive/actions/createFolder";
import { deleteFile } from "@/integrations/google-drive/actions/deleteFile";
import { listFiles } from "@/integrations/google-drive/actions/listFiles";
import { moveFile } from "@/integrations/google-drive/actions/moveFile";
import { uploadFile } from "@/integrations/google-drive/actions/uploadFile";
import { appendRow } from "@/integrations/google-sheets/actions/appendRow";
import { clearRange } from "@/integrations/google-sheets/actions/clearRange";
import { getSheetMetadata } from "@/integrations/google-sheets/actions/getSheetMetadata";
import { readRows } from "@/integrations/google-sheets/actions/readRows";
import { updateRow } from "@/integrations/google-sheets/actions/updateRow";
import { copyItem as copyOneDriveItem } from "@/integrations/microsoft-onedrive/actions/copyItem";
import { createFolder as createOneDriveFolder } from "@/integrations/microsoft-onedrive/actions/createFolder";
import { deleteItem as deleteOneDriveItem } from "@/integrations/microsoft-onedrive/actions/deleteItem";
import { getFile as getOneDriveFile } from "@/integrations/microsoft-onedrive/actions/getFile";
import { listItems as listOneDriveItems } from "@/integrations/microsoft-onedrive/actions/listItems";
import { moveItem as moveOneDriveItem } from "@/integrations/microsoft-onedrive/actions/moveItem";
import { uploadFile as uploadOneDriveFile } from "@/integrations/microsoft-onedrive/actions/uploadFile";
import { sendEmail as sendOutlookEmail } from "@/integrations/microsoft-outlook/actions/sendEmail";
import { addAttendees as addOutlookCalendarAttendees } from "@/integrations/microsoft-outlook-calendar/actions/addAttendees";
import { createEvent as createOutlookCalendarEvent } from "@/integrations/microsoft-outlook-calendar/actions/createEvent";
import { deleteEvent as deleteOutlookCalendarEvent } from "@/integrations/microsoft-outlook-calendar/actions/deleteEvent";
import { listEvents as listOutlookCalendarEvents } from "@/integrations/microsoft-outlook-calendar/actions/listEvents";
import { updateEvent as updateOutlookCalendarEvent } from "@/integrations/microsoft-outlook-calendar/actions/updateEvent";
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
  { provider: "google-drive", type: "upload_file", handler: uploadFile },
  { provider: "google-drive", type: "create_folder", handler: createFolder },
  { provider: "google-drive", type: "list_files", handler: listFiles },
  { provider: "google-drive", type: "move_file", handler: moveFile },
  { provider: "google-drive", type: "delete_file", handler: deleteFile },
  { provider: "google-sheets", type: "read_rows", handler: readRows },
  { provider: "google-sheets", type: "append_row", handler: appendRow },
  { provider: "google-sheets", type: "update_row", handler: updateRow },
  { provider: "google-sheets", type: "clear_range", handler: clearRange },
  { provider: "google-sheets", type: "get_sheet_metadata", handler: getSheetMetadata },
  { provider: "microsoft-outlook", type: "send_email", handler: sendOutlookEmail },
  { provider: "microsoft-outlook-calendar", type: "create_event", handler: createOutlookCalendarEvent },
  { provider: "microsoft-outlook-calendar", type: "list_events", handler: listOutlookCalendarEvents },
  { provider: "microsoft-outlook-calendar", type: "update_event", handler: updateOutlookCalendarEvent },
  { provider: "microsoft-outlook-calendar", type: "delete_event", handler: deleteOutlookCalendarEvent },
  { provider: "microsoft-outlook-calendar", type: "add_attendees", handler: addOutlookCalendarAttendees },
  { provider: "microsoft-onedrive", type: "upload_file", handler: uploadOneDriveFile },
  { provider: "microsoft-onedrive", type: "get_file", handler: getOneDriveFile },
  { provider: "microsoft-onedrive", type: "create_folder", handler: createOneDriveFolder },
  { provider: "microsoft-onedrive", type: "delete_item", handler: deleteOneDriveItem },
  { provider: "microsoft-onedrive", type: "move_item", handler: moveOneDriveItem },
  { provider: "microsoft-onedrive", type: "copy_item", handler: copyOneDriveItem },
  { provider: "microsoft-onedrive", type: "list_items", handler: listOneDriveItems },
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
