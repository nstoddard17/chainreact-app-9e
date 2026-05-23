import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { documentsGet } from "@/integrations/_shared/google/api/docs/documentsGet";
import { documentsBatchUpdate } from "@/integrations/_shared/google/api/docs/documentsBatchUpdate";
import type { DocumentResource } from "@/integrations/_shared/google/api/docs/documentsCreate";
import {
  UpdateDocumentConfigSchema,
  type UpdateDocumentConfig,
} from "./updateDocument.schema";

/**
 * Google Docs `update_document` action handler — Slice 3.GDOCS-2.
 *
 * Inserts content into an existing Google Doc using one of 5
 * `insertLocation` modes. V1 reference:
 * `lib/workflows/actions/googleDocs.ts:updateGoogleDocument`. All five
 * modes ported verbatim per GDOCS-1 §3.1.
 *
 * Mode behaviors:
 *   - `end` — fetch the doc to compute the last index, insert at
 *     `endIndex - 1` (Docs' end-of-body marker). A leading newline is
 *     prepended so the new content lands on its own paragraph (V1
 *     does the same — `'\n' + content` at the end).
 *   - `beginning` — insert at index 1 (Docs reserves index 0 for the
 *     BODY_START sentinel). A trailing newline is appended so the
 *     existing content keeps its paragraph break.
 *   - `replace` — two batchUpdate requests in a single call:
 *     `deleteContentRange { startIndex: 1, endIndex: <last - 1> }`
 *     followed by `insertText { location: { index: 1 }, text: content }`.
 *     Recoverable via Docs version history but high-impact — the meta
 *     layer in GDOCS-4 surfaces a description warning.
 *   - `after_text` / `before_text` — Docs has no native "find +
 *     insert" primitive; V2 mirrors V1's strategy: fetch the document,
 *     flatten body content to a single string (preserving the index
 *     mapping), regex-search for the searchText with `*` → `.*`
 *     wildcards, and issue an `insertText` at the resolved index
 *     boundary. Multiple matches: V1 uses the LAST match; V2 mirrors
 *     verbatim so the behavior is identical across the V1 → V2 cut.
 *
 * Wildcard semantics: V1 maps `*` to regex `.*` and otherwise
 * regex-escapes the search text. V2 ports that literally. Special
 * regex characters (`.`, `+`, `?`, `(`, etc.) in the search text are
 * escaped so they match literally; only `*` is treated as a wildcard.
 *
 * Each Docs round-trip wraps in `refreshAndRetry` (Q3).
 *
 * Output:
 *   - `documentId`, `documentUrl`, `title`, `updatedAt`, `revisionId`,
 *     `contentLength`, `insertionLocation` (echo).
 */

const DOCS_BODY_START_INDEX = 1;

export const updateDocument: ActionHandler = async (input) => {
  const config: UpdateDocumentConfig = UpdateDocumentConfigSchema.parse(
    input.config,
  );

  const accountId =
    input.triggerEvent.provider === "google-docs"
      ? input.triggerEvent.accountId
      : null;

  // For end / replace / after_text / before_text we need the current
  // document state. Beginning-only insert doesn't need a fetch — the
  // index is always 1 — so we skip the round-trip in that path.
  let document: DocumentResource | null = null;
  if (config.insertLocation !== "beginning") {
    document = await refreshAndRetry({
      userId: input.userId,
      provider: "google-docs",
      accountId,
      apiCall: (accessToken) =>
        documentsGet({ accessToken, documentId: config.documentId }),
    });
  }

  const requests = buildBatchUpdateRequests(config, document);

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "google-docs",
    accountId,
    apiCall: (accessToken) =>
      documentsBatchUpdate({
        accessToken,
        documentId: config.documentId,
        requests,
      }),
  });

  // batchUpdate doesn't return the document's title or full new
  // revisionId in V2's bounded wrapper shape. Surfaces what's
  // available; downstream nodes that need title call get_document
  // separately.
  return {
    output: {
      documentId: config.documentId,
      documentUrl: `https://docs.google.com/document/d/${config.documentId}/edit`,
      title: document?.title ?? null,
      updatedAt: new Date().toISOString(),
      revisionId:
        (result as { writeControl?: { requiredRevisionId?: string } })
          .writeControl?.requiredRevisionId ?? null,
      contentLength: config.content.length,
      insertionLocation: config.insertLocation,
    },
  };
};

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Compute the document's last writable index. Docs' body is an array
 * of structural elements; the last element's `endIndex` is the
 * end-of-body marker. We subtract 1 to land BEFORE that marker (Docs
 * rejects inserts past the marker).
 *
 * Returns `DOCS_BODY_START_INDEX` (1) when the document is empty.
 */
function computeDocumentEndIndex(document: DocumentResource): number {
  const content = document.body?.content;
  if (!Array.isArray(content) || content.length === 0) {
    return DOCS_BODY_START_INDEX;
  }
  let lastEndIndex = DOCS_BODY_START_INDEX;
  for (const element of content) {
    const ei = (element as { endIndex?: unknown }).endIndex;
    if (typeof ei === "number" && ei > lastEndIndex) {
      lastEndIndex = ei;
    }
  }
  // Drop 1 so we insert BEFORE the end-of-body marker rather than ON it.
  return Math.max(DOCS_BODY_START_INDEX, lastEndIndex - 1);
}

/**
 * Flatten the document body into a single string while preserving the
 * Docs index mapping. Returns the flat string plus a parallel array
 * mapping each character position in the string to its Docs index.
 *
 * Used by after_text / before_text modes to locate searchText matches
 * in the document and translate the match offset back into a Docs
 * insertion index.
 */
function flattenBody(document: DocumentResource): {
  text: string;
  docsIndexFor: number[];
} {
  const text: string[] = [];
  const docsIndexFor: number[] = [];
  const content = document.body?.content;
  if (!Array.isArray(content)) return { text: "", docsIndexFor: [] };
  for (const element of content) {
    const paragraph = (element as { paragraph?: { elements?: unknown[] } })
      .paragraph;
    if (!paragraph || !Array.isArray(paragraph.elements)) continue;
    for (const pe of paragraph.elements) {
      const tr = (pe as { textRun?: { content?: string }; startIndex?: number })
        .textRun;
      const startIndex = (pe as { startIndex?: number }).startIndex;
      if (
        tr === undefined ||
        typeof tr.content !== "string" ||
        typeof startIndex !== "number"
      ) {
        continue;
      }
      for (let i = 0; i < tr.content.length; i++) {
        text.push(tr.content[i]!);
        docsIndexFor.push(startIndex + i);
      }
    }
  }
  return { text: text.join(""), docsIndexFor };
}

/**
 * Escape regex metacharacters in `searchText` EXCEPT `*`, which V1
 * treats as a wildcard mapped to `.*`. Mirrors V1's literal mapping
 * at `lib/workflows/actions/googleDocs.ts:444 / :502`.
 */
function buildSearchPattern(searchText: string): RegExp {
  // First escape every regex metachar.
  const escaped = searchText.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  // Then replace literal `*` (which we DIDN'T escape because `*` is
  // not in the escape list above) with `.*`. We have to use a
  // post-escape replace because the escape step replaces a different
  // set of chars; the `*` survives untouched.
  const pattern = escaped.replace(/\*/g, ".*");
  return new RegExp(pattern);
}

/**
 * Find the LAST match of the search pattern in the flattened text.
 * V1 uses last-match semantics (`lastIndexOf` then regex re-search
 * from there); V2 mirrors. Returns null when no match.
 *
 * Returns `{ matchStartDocsIndex, matchEndDocsIndex }` — both are
 * Docs indices, not flat-string offsets.
 */
function findLastMatch(
  flat: { text: string; docsIndexFor: number[] },
  pattern: RegExp,
): { matchStartDocsIndex: number; matchEndDocsIndex: number } | null {
  // Use a global regex to enumerate all matches; pick the last.
  const globalPattern = new RegExp(pattern.source, "g");
  let lastMatch: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = globalPattern.exec(flat.text)) !== null) {
    lastMatch = m;
    // Defensive: avoid infinite loop on zero-width match.
    if (m.index === globalPattern.lastIndex) {
      globalPattern.lastIndex++;
    }
  }
  if (lastMatch === null) return null;
  const startOffset = lastMatch.index;
  const endOffset = lastMatch.index + lastMatch[0].length;
  // Endpoint translation: docsIndexFor is per-character; match ranges
  // are [start, end) so the end Docs index is the index of the char
  // AFTER the match, which is docsIndexFor[endOffset] when present,
  // else docsIndexFor[lastIndex] + 1.
  const matchStartDocsIndex = flat.docsIndexFor[startOffset]!;
  const matchEndDocsIndex =
    endOffset < flat.docsIndexFor.length
      ? flat.docsIndexFor[endOffset]!
      : (flat.docsIndexFor[flat.docsIndexFor.length - 1] ?? DOCS_BODY_START_INDEX) +
        1;
  return { matchStartDocsIndex, matchEndDocsIndex };
}

function buildBatchUpdateRequests(
  config: UpdateDocumentConfig,
  document: DocumentResource | null,
): ReadonlyArray<Record<string, unknown>> {
  switch (config.insertLocation) {
    case "beginning": {
      // V1 appends a trailing newline so the existing first paragraph
      // keeps its break. V2 mirrors.
      return [
        {
          insertText: {
            location: { index: DOCS_BODY_START_INDEX },
            text: `${config.content}\n`,
          },
        },
      ];
    }
    case "end": {
      if (document === null) {
        throw new Error(
          "update_document end-mode: document must be fetched before computing end index.",
        );
      }
      const endIndex = computeDocumentEndIndex(document);
      // V1 prepends a leading newline so the new content lands on its
      // own paragraph. V2 mirrors.
      return [
        {
          insertText: {
            location: { index: endIndex },
            text: `\n${config.content}`,
          },
        },
      ];
    }
    case "replace": {
      if (document === null) {
        throw new Error(
          "update_document replace-mode: document must be fetched before computing end index.",
        );
      }
      const endIndex = computeDocumentEndIndex(document);
      // Two requests, single batchUpdate: delete the entire body
      // range, then insert new content at index 1.
      if (endIndex <= DOCS_BODY_START_INDEX) {
        // Document is already empty; just insert.
        return [
          {
            insertText: {
              location: { index: DOCS_BODY_START_INDEX },
              text: config.content,
            },
          },
        ];
      }
      return [
        {
          deleteContentRange: {
            range: {
              startIndex: DOCS_BODY_START_INDEX,
              endIndex,
            },
          },
        },
        {
          insertText: {
            location: { index: DOCS_BODY_START_INDEX },
            text: config.content,
          },
        },
      ];
    }
    case "after_text":
    case "before_text": {
      if (document === null) {
        throw new Error(
          `update_document ${config.insertLocation}-mode: document must be fetched.`,
        );
      }
      if (config.searchText === undefined || config.searchText.length === 0) {
        throw new Error(
          `update_document ${config.insertLocation}-mode: searchText is required (schema should have caught this).`,
        );
      }
      const flat = flattenBody(document);
      const pattern = buildSearchPattern(config.searchText);
      const match = findLastMatch(flat, pattern);
      if (match === null) {
        throw new Error(
          `update_document ${config.insertLocation}-mode: searchText '${config.searchText}' not found in document.`,
        );
      }
      const insertIndex =
        config.insertLocation === "after_text"
          ? match.matchEndDocsIndex
          : match.matchStartDocsIndex;
      return [
        {
          insertText: {
            location: { index: insertIndex },
            text: config.content,
          },
        },
      ];
    }
  }
};
