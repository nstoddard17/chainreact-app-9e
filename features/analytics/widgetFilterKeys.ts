import type { ConnectedAppFilterKind } from "./connectedAppSources";

/**
 * Mapping from a UI connected-app filter KIND to the server-side
 * `dataSource.filters` KEY (extracted from WidgetConfigPanel.tsx to keep that file
 * under the leaf line-count cap). Most kinds use their own name as the data key; the
 * few historical exceptions live in {@link FILTER_KEY_MAP}.
 */
export type FilterDataKey =
  | "repo" | "channel" | "keyword" | "calendar" | "label" | "folder" | "outlook_calendar" | "board"
  | "airtable_base" | "airtable_table" | "monday_board" | "hubspot_pipeline" | "mailchimp_audience"
  | "dropbox_folder" | "onedrive_folder" | "gdrive_folder" | "discord_guild" | "discord_channel";

// Kinds not listed use their own name as the data key (repo / keyword / airtable_* /
// monday_board / hubspot_pipeline / discord_* — kind === data key).
const FILTER_KEY_MAP: Partial<Record<ConnectedAppFilterKind, FilterDataKey>> = {
  slack_channel: "channel", gcal_calendar: "calendar", gmail_label: "label",
  outlook_folder: "folder", outlookcal_calendar: "outlook_calendar", trello_board: "board",
};

export function filterDataKey(kind: ConnectedAppFilterKind): FilterDataKey {
  return FILTER_KEY_MAP[kind] ?? (kind as FilterDataKey);
}
