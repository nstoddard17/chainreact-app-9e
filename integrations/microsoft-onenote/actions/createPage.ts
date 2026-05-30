import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { pagesCreate } from "../api/pagesCreate";
import { CreatePageConfigSchema } from "./createPage.schema";

/**
 * Microsoft OneNote `create_page` action handler — Slice 3.ONENOTE-2.
 *
 * Wraps Graph `POST /me/onenote/sections/{sectionId}/pages` with an
 * HTML body built from `title` + `content`. Body construction:
 *   - `text/html` / `application/xhtml+xml` (V2 default `text/html`):
 *     `<html><head><title>...</title></head><body>{content}</body></html>`.
 *   - `text/plain`: content is wrapped in `<p>` tags split on
 *     newlines, then placed inside the same HTML scaffolding (Graph
 *     doesn't accept `text/plain` directly for OneNote pages —
 *     V1-derived workaround).
 *
 * Output (downstream variable refs):
 *   {id, title, contentUrl, webUrl, createdDateTime,
 *    lastModifiedDateTime, level, order}
 *
 * `webUrl` constructed from `links.oneNoteWebUrl.href` (Graph's
 * canonical link). Falls back to null when Graph omits it
 * (defensive — mocks may not return links).
 *
 * accountId resolution mirrors every other Microsoft handler: read
 * from the trigger event when the run was kicked off by a
 * microsoft-onenote trigger; otherwise null (the `getActiveForExecution`
 * call resolves the single connected integration).
 */

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtmlBody(
  title: string,
  content: string,
  contentType: "text/html" | "text/plain" | "application/xhtml+xml",
): string {
  const escapedTitle = escapeHtml(title);
  if (contentType === "text/plain") {
    // Graph doesn't accept text/plain directly — V1 wraps plain text
    // in <p> tags split on newlines and serves it through the HTML
    // endpoint. Escape the body so authored "<", "&" don't smuggle
    // raw HTML.
    const escaped = escapeHtml(content)
      .split("\n")
      .map((line) => `<p>${line}</p>`)
      .join("");
    return `<!DOCTYPE html><html><head><title>${escapedTitle}</title></head><body>${escaped}</body></html>`;
  }
  // text/html or application/xhtml+xml — content passed through
  // verbatim (workflow author owns the markup).
  return `<!DOCTYPE html><html><head><title>${escapedTitle}</title></head><body>${content}</body></html>`;
}

export const createPage: ActionHandler = async (input) => {
  const config = CreatePageConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-onenote"
      ? input.triggerEvent.providerAccountId
      : null;

  const htmlBody = buildHtmlBody(config.title, config.content, config.contentType);
  // text/plain bodies still ship through Graph's HTML parser — only
  // text/html and application/xhtml+xml are wire-valid Content-Type
  // values for /pages POST.
  const wireContentType =
    config.contentType === "application/xhtml+xml"
      ? "application/xhtml+xml"
      : "text/html";

  const page = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-onenote",
    providerAccountId,
    apiCall: (accessToken) =>
      pagesCreate({
        accessToken,
        sectionId: config.sectionId,
        htmlBody,
        contentType: wireContentType,
      }),
  });

  return {
    output: {
      id: page.id,
      title: page.title ?? config.title,
      contentUrl: page.contentUrl ?? null,
      webUrl: page.links?.oneNoteWebUrl?.href ?? null,
      createdDateTime: page.createdDateTime ?? null,
      lastModifiedDateTime: page.lastModifiedDateTime ?? null,
      level: page.level ?? null,
      order: page.order ?? null,
    },
  };
};
