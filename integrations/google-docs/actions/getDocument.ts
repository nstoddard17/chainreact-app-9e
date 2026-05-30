import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { documentsGet } from "@/integrations/_shared/google/api/docs/documentsGet";
import type { DocumentResource } from "@/integrations/_shared/google/api/docs/documentsCreate";
import { GetDocumentConfigSchema } from "./getDocument.schema";

/**
 * Google Docs `get_document` action handler — Slice 3.GDOCS-2.
 *
 * Pure read. Calls `documents.get`, flattens the body to a single text
 * string, returns `{documentId, title, content, revisionId, documentUrl}`.
 *
 * Content extraction walks `body.content[]` → `paragraph.elements[]`
 * → `textRun.content`. This is the V1 strategy (V1 reference:
 * `lib/workflows/actions/googleDocs.ts:getGoogleDocument`) — Docs'
 * API doesn't expose a plaintext endpoint; the StructuralElement
 * tree is the only way. Tables, inline objects, and section breaks
 * surface as their textRun children where present; other element
 * types contribute nothing to the flat string.
 *
 * Output:
 *   - `documentId`, `title`, `content` (full flattened text — marked
 *     sensitive in the meta layer), `revisionId`, `documentUrl`.
 */
export const getDocument: ActionHandler = async (input) => {
  const config = GetDocumentConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "google-docs"
      ? input.triggerEvent.providerAccountId
      : null;

  const document = await refreshAndRetry({
    accountId: input.accountId,
    provider: "google-docs",
    providerAccountId,
    apiCall: (accessToken) =>
      documentsGet({ accessToken, documentId: config.documentId }),
  });

  return {
    output: {
      documentId: config.documentId,
      title: document.title ?? null,
      content: extractDocumentText(document),
      revisionId: (document as { revisionId?: string }).revisionId ?? null,
      documentUrl: `https://docs.google.com/document/d/${config.documentId}/edit`,
    },
  };
};

/**
 * Flatten a Docs `Document` into plain text by walking the structural
 * tree. Mirrors V1's extraction strategy.
 *
 * Per Docs' Document resource: `body.content[]` contains
 * `StructuralElement` items (paragraph / table / sectionBreak / etc.).
 * For paragraphs, `paragraph.elements[]` contains
 * `ParagraphElement` items (textRun / inlineObjectElement /
 * personLearningTask / etc.). Only `textRun.content` carries text;
 * other element types render as glyphs that don't have a string
 * representation.
 */
function extractDocumentText(document: DocumentResource): string {
  const parts: string[] = [];
  const content = document.body?.content;
  if (!Array.isArray(content)) return "";
  for (const element of content) {
    const paragraph = (element as { paragraph?: { elements?: unknown[] } })
      .paragraph;
    if (!paragraph || !Array.isArray(paragraph.elements)) continue;
    for (const pe of paragraph.elements) {
      const textRun = (pe as { textRun?: { content?: string } }).textRun;
      if (textRun && typeof textRun.content === "string") {
        parts.push(textRun.content);
      }
    }
  }
  return parts.join("");
}
