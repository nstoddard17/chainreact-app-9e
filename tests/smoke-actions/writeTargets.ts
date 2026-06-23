/**
 * Write smoke harness — connection-vs-target classification + smoke-safe target
 * discovery (PURE).
 *
 * Two distinct facts the harness MUST NOT conflate (the SMOKE-WRITE-2 bug was
 * calling a connected provider "not connected" because no smoke-target env was
 * set):
 *
 *   - CONNECTION: is the provider connected on the smoke account, and is that
 *     credential usable for execution under the smoke user? (For PERSONAL-class
 *     providers like Trello, execution resolves to the workflow creator, so a row
 *     connected by a co-member is connected-but-not-executable.)
 *   - TARGET: is there a safe, smoke-OWNED place to write (a board/list/page
 *     explicitly marked for smoke/test use)? A missing target is BLOCKED_ENV /
 *     SANDBOX_REQUIRED — NOT "not connected".
 */

export type ConnectionClass =
  | "NOT_CONNECTED" // no active integration row on the account
  | "CONNECTED_NOT_EXECUTABLE" // connected, but not usable under the smoke user (personal cred provenance)
  | "BLOCKED_NO_TARGET" // connected + executable, but no safe smoke target (set the target env)
  | "READY"; // connected + executable + a safe smoke target exists

export interface ClassifyConnectionInput {
  readonly dbConnected: boolean;
  /** Usable for execution under the smoke user (personal-cred provenance match). */
  readonly execUsable: boolean;
  /** A safe smoke target (board/list/page marked for smoke use) is available. */
  readonly hasTarget: boolean;
}

/** Classify a write provider into the 4 distinct states. Pure. */
export function classifyWriteTarget(input: ClassifyConnectionInput): ConnectionClass {
  if (!input.dbConnected) return "NOT_CONNECTED";
  if (!input.execUsable) return "CONNECTED_NOT_EXECUTABLE";
  if (!input.hasTarget) return "BLOCKED_NO_TARGET";
  return "READY";
}

/** Default name pattern for an EXPLICITLY smoke-safe target (board/list/page). */
export const SMOKE_TARGET_NAME_RE = /smoke|test|chainreact/i;

/** A discovered (board, list) candidate from the Trello option resolvers. */
export interface TrelloListCandidate {
  readonly boardId: string;
  readonly boardLabel: string;
  readonly listId: string;
  readonly listLabel: string;
}

export interface ChosenTrelloTarget {
  readonly boardId: string;
  readonly listId: string;
  readonly boardLabel: string;
  readonly listLabel: string;
}

/**
 * A list on the source smoke board, considered as a MOVE destination. Just the
 * (id, label) pair the list resolver returns — board membership is established by
 * the caller (it only passes lists from the source board).
 */
export interface TrelloMoveListCandidate {
  readonly listId: string;
  readonly listLabel: string;
}

export interface ChosenTrelloSecondList {
  readonly listId: string;
  readonly listLabel: string;
}

/**
 * Acceptable NAMES for a `move_card` DESTINATION list. Broader than the source
 * pattern: a smoke board's second list is commonly "Done" / "Doing" / a
 * "moved"/"target" lane. Still a strict allow-list — a card is NEVER moved onto an
 * arbitrarily-named list, even on a smoke board. No match -> BLOCKED_ENV.
 */
export const SMOKE_MOVE_TARGET_NAME_RE = /smoke|test|done|moved|target/i;

/**
 * Pick a safe SECOND smoke list to move a card INTO, from the lists already known
 * to live on the (explicitly smoke/test-named) SOURCE board. Rules:
 *   - never the source list itself (a no-op move proves nothing);
 *   - the list name must match the destination allow-list (`pattern`);
 *   - deterministic: sorted by listLabel so the same board resolves the same
 *     destination every run.
 * Returns null when no distinct safe destination exists -> the caller reports
 * BLOCKED_ENV and asks for SMOKE_TRELLO_TARGET_LIST_ID. Pure.
 */
export function pickSecondSmokeList(
  candidates: readonly TrelloMoveListCandidate[],
  sourceListId: string,
  pattern: RegExp = SMOKE_MOVE_TARGET_NAME_RE,
): ChosenTrelloSecondList | null {
  const safe = candidates
    .filter((c) => c.listId !== sourceListId && pattern.test(c.listLabel))
    .sort((a, b) => a.listLabel.localeCompare(b.listLabel));
  const chosen = safe[0];
  if (!chosen) return null;
  return { listId: chosen.listId, listLabel: chosen.listLabel };
}

/**
 * Pick a safe smoke list: a candidate whose BOTH board AND list names match the
 * smoke pattern (the strongest "explicitly marked for smoke use" signal — never
 * an arbitrary first board/list). Deterministic: sorted by (boardLabel, listLabel)
 * so the same account always resolves the same target. Returns null when no
 * candidate is explicitly smoke-safe (-> BLOCKED_ENV, set the target env).
 */
export function pickSmokeSafeTarget(
  candidates: readonly TrelloListCandidate[],
  pattern: RegExp = SMOKE_TARGET_NAME_RE,
): ChosenTrelloTarget | null {
  const safe = candidates
    .filter((c) => pattern.test(c.boardLabel) && pattern.test(c.listLabel))
    .sort((a, b) => a.boardLabel.localeCompare(b.boardLabel) || a.listLabel.localeCompare(b.listLabel));
  const chosen = safe[0];
  if (!chosen) return null;
  return {
    boardId: chosen.boardId,
    listId: chosen.listId,
    boardLabel: chosen.boardLabel,
    listLabel: chosen.listLabel,
  };
}

// ─── Airtable: primary text field discovery (for record writes) ───────────────

/** Airtable field types we can safely stamp a smoke marker string into. */
export const AIRTABLE_TEXT_FIELD_TYPES: readonly string[] = [
  "singleLineText",
  "multilineText",
  "richText",
];

export interface AirtableFieldLite {
  readonly id: string;
  readonly name: string;
  readonly type: string;
}

export interface AirtableTableLite {
  readonly id: string;
  readonly primaryFieldId: string;
  readonly fields: readonly AirtableFieldLite[];
}

/**
 * Pick the field NAME a smoke marker can be written into on a table: prefer the
 * PRIMARY field when it is text-typed (always present, always writable), else the
 * first text-typed field. Returns null when the table exposes no writable text
 * field -> the caller reports BLOCKED_ENV (set SMOKE_AIRTABLE_TEXT_FIELD). Pure.
 */
export function pickAirtablePrimaryTextField(
  table: AirtableTableLite,
  textTypes: readonly string[] = AIRTABLE_TEXT_FIELD_TYPES,
): string | null {
  const primary = table.fields.find((f) => f.id === table.primaryFieldId);
  if (primary && textTypes.includes(primary.type)) return primary.name;
  const firstText = table.fields.find((f) => textTypes.includes(f.type));
  return firstText ? firstText.name : null;
}

/** Airtable attachment field type (for `add_attachment`). */
export const AIRTABLE_ATTACHMENT_FIELD_TYPE = "multipleAttachments";

/**
 * Pick the NAME of an attachment field on the smoke table (for `add_attachment`).
 * Returns the first `multipleAttachments` field, or null when the table has none
 * -> caller reports BLOCKED_ENV (set SMOKE_AIRTABLE_ATTACHMENT_FIELD). NEVER picks
 * a non-attachment field. Pure.
 */
export function pickAirtableAttachmentField(table: AirtableTableLite): string | null {
  const att = table.fields.find((f) => f.type === AIRTABLE_ATTACHMENT_FIELD_TYPE);
  return att ? att.name : null;
}

// ─── Notion: smoke database discovery (for create_database_entry) ─────────────

export interface NotionDatabaseHitLite {
  readonly id: string;
  /** Database title (plain text), for safe logging + smoke-name preference. */
  readonly title: string;
  /** Title-type property NAME (the key Notion requires on a new entry), or null. */
  readonly titleFieldName: string | null;
}

export interface ChosenNotionDatabase {
  readonly databaseId: string;
  readonly title: string;
  readonly titleFieldName: string;
}

/**
 * Pick a safe smoke DATABASE to create an entry in, from `object=database` search
 * hits. When `pinnedId` is set (SMOKE_NOTION_DATABASE_ID), that exact database is
 * used; otherwise prefer a smoke/test-named database, else the first accessible one
 * (harmless on a throwaway account). A database with no title-type property is
 * unusable (Notion requires the title key on a new entry) -> skipped/null. Returns
 * the database id + its title-property NAME, or null -> BLOCKED_ENV. Pure.
 */
export function pickNotionSmokeDatabase(
  hits: readonly NotionDatabaseHitLite[],
  pinnedId?: string | null,
  pattern: RegExp = SMOKE_TARGET_NAME_RE,
): ChosenNotionDatabase | null {
  const usable = hits.filter((h) => h.titleFieldName !== null);
  let chosen: NotionDatabaseHitLite | undefined;
  if (pinnedId) {
    chosen = usable.find((h) => h.id === pinnedId);
  } else {
    chosen = usable.find((h) => pattern.test(h.title)) ?? usable[0];
  }
  if (!chosen || chosen.titleFieldName === null) return null;
  return { databaseId: chosen.id, title: chosen.title, titleFieldName: chosen.titleFieldName };
}
