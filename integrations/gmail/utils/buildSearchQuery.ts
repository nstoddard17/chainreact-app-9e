/**
 * Pure helper: translates `search_emails` filter-mode config into a
 * Gmail q-syntax string.
 *
 * Gmail 2.2 Commit 3: this is the "filters" branch of the
 * `searchMode` discriminated union. The `query` branch passes the
 * raw user-supplied string straight through to
 * `users.messages.list`; this branch composes the q syntax
 * deterministically from named fields so workflow authors don't
 * need to learn Gmail's mini-DSL.
 *
 * Fields ported from V1 per parity-gmail.md decision 1 (advancedSearch
 * folded as searchMode="filters"):
 *   - `from`               → `from:<value>` (quoted if contains space)
 *   - `to`                 → `to:<value>` (quoted if contains space)
 *   - `subject`            → `subject:<value>` (quoted if contains space)
 *   - `hasAttachment`      → `has:attachment` (yes) / `-has:attachment` (no)
 *   - `dateAfter`          → `after:YYYY/MM/DD` (schema enforces format)
 *   - `dateBefore`         → `before:YYYY/MM/DD`
 *   - `largerThan` (bytes) → `larger:<bytes>`
 *   - `smallerThan` (bytes)→ `smaller:<bytes>`
 *   - `labelIds[]`         → `label:<id>` for each; all ANDed together
 *   - `hasWords`           → forwarded verbatim (Gmail's "must include")
 *   - `doesntHaveWords`    → `-(<value>)` (Gmail's "must NOT include")
 *
 * V1 fields intentionally NOT ported in this commit (out of brief
 * scope; can land in a later expand-slice):
 *   - `isRead` / `isStarred` enum filters
 *   - `attachmentName` (filename: operator)
 *   - `dateRange` preset ("today" / "last_7_days" / …) — workflow
 *     authors compute dates upstream and pass `dateAfter`.
 *   - V1's `threadId` filter (Gmail's q syntax doesn't actually
 *     support `threadId:` at the API boundary — V1's was broken).
 *
 * Quoting rule: values containing whitespace are wrapped in `"…"`.
 * The schema rejects values containing literal `"` so we don't have
 * to escape inner quotes — the call site can't supply input that
 * would need it.
 *
 * Spacing rule: filter terms are joined with single spaces. Gmail
 * treats adjacent terms as an implicit AND; documenting that here
 * makes the output query human-readable.
 */

import type { FiltersModeConfig } from "../actions/searchEmails.schema";

export function buildSearchQuery(config: FiltersModeConfig): string {
  const parts: string[] = [];

  if (config.from !== undefined && config.from.length > 0) {
    parts.push(`from:${quoteIfNeeded(config.from)}`);
  }
  if (config.to !== undefined && config.to.length > 0) {
    parts.push(`to:${quoteIfNeeded(config.to)}`);
  }
  if (config.subject !== undefined && config.subject.length > 0) {
    parts.push(`subject:${quoteIfNeeded(config.subject)}`);
  }

  if (config.hasAttachment === "yes") {
    parts.push("has:attachment");
  } else if (config.hasAttachment === "no") {
    parts.push("-has:attachment");
  }

  if (config.dateAfter !== undefined) {
    parts.push(`after:${config.dateAfter}`);
  }
  if (config.dateBefore !== undefined) {
    parts.push(`before:${config.dateBefore}`);
  }

  if (config.largerThan !== undefined) {
    parts.push(`larger:${config.largerThan}`);
  }
  if (config.smallerThan !== undefined) {
    parts.push(`smaller:${config.smallerThan}`);
  }

  if (config.labelIds !== undefined && config.labelIds.length > 0) {
    for (const labelId of config.labelIds) {
      parts.push(`label:${labelId}`);
    }
  }

  if (config.hasWords !== undefined && config.hasWords.length > 0) {
    parts.push(config.hasWords);
  }

  if (
    config.doesntHaveWords !== undefined &&
    config.doesntHaveWords.length > 0
  ) {
    parts.push(`-(${config.doesntHaveWords})`);
  }

  return parts.join(" ");
}

function quoteIfNeeded(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value;
}
