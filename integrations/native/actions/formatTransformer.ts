import type { ActionHandler } from "@/services/execution/handlers/types";
import {
  FormatTransformerConfigSchema,
  type FormatTransformerSourceFormat,
  type FormatTransformerTargetFormat,
} from "./formatTransformer.schema";

/**
 * Native `format_transformer` action — Native-nodes Slice 1 Commit 2.
 *
 * Pure-handler port from V1's
 * `lib/workflows/actions/utility/formatTransformer.ts` per the accepted
 * audit (docs/slices/parity/parity-native-nodes.md §7 Tier A) +
 * implementation plan
 * (docs/slices/parity/native-nodes-1-tier-a-plan.md §5).
 *
 * Behavioural contracts locked at plan time:
 *   - Strict schema (`.strict()`). `targetFormat` required (Q11 — no
 *     silent default). `sourceFormat` defaults to "auto"; "auto" runs
 *     the detector and never reaches the output (the resolved value is
 *     reported instead).
 *   - Deterministic transforms only. No LLM, no network, no filesystem,
 *     no `eval` / `Function` constructor.
 *   - Bounded input (1 MiB at schema) + bounded output (2 MiB; overflow
 *     throws `FormatTransformerOutputCapExceededError`). No silent
 *     truncation.
 *   - HTML → Markdown / HTML → Plain conversion is performed by a
 *     minimal in-tree converter (the V2 dep tree is deliberately lean;
 *     V1's `turndown` runtime dep is NOT introduced — accepted product
 *     decision per Slice 1 Commit 2 conversation). The converter
 *     handles the common workflow surface (headings, bold / italic /
 *     code, links, ordered + unordered lists, paragraphs + line breaks,
 *     block quotes) and falls through to plain-text content extraction
 *     for any unknown tag.
 *   - No log lines. Engine-layer logging owns the run lifecycle.
 *
 * Intentional V1 drift on port (lib/workflows/actions/utility/formatTransformer.ts):
 *   - `preserveVariables` flag dropped — engine has already resolved
 *     `{{...}}` references before the handler runs (variable-resolver
 *     rule §"Engine pre-resolution").
 *   - `testMode` branch dropped — V2's `ActionHandlerInput` has no
 *     testMode flag; tests stub the converter inputs directly.
 *   - `findUpstreamAttachments` walker dropped — attachments are a
 *     P-S3 FileRef concern; format_transformer is text-only.
 *   - `formatRichTextForTarget` Slack helper dropped — the
 *     Markdown → Slack-Markdown transform is in-tree here.
 *   - `{success: false, output: {}, message: ...}` shape dropped —
 *     V2 contract is throw on failure; engine converts to step failure.
 */

const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

export class FormatTransformerOutputCapExceededError extends Error {
  constructor(public readonly bytes: number) {
    super(
      `format_transformer output exceeded the 2 MiB cap (${bytes} bytes).`,
    );
    this.name = "FormatTransformerOutputCapExceededError";
  }
}

export const formatTransformer: ActionHandler = async (input) => {
  const config = FormatTransformerConfigSchema.parse(input.config);

  const detected: Exclude<FormatTransformerSourceFormat, "auto"> =
    config.sourceFormat === "auto"
      ? detectSourceFormat(config.content)
      : config.sourceFormat;

  const transformed = transformContent(
    config.content,
    detected,
    config.targetFormat,
  );

  const outputBytes = Buffer.byteLength(transformed, "utf8");
  if (outputBytes > MAX_OUTPUT_BYTES) {
    throw new FormatTransformerOutputCapExceededError(outputBytes);
  }

  return {
    output: {
      transformedContent: transformed,
      sourceFormat: detected,
      targetFormat: config.targetFormat,
      inputLength: config.content.length,
      outputLength: transformed.length,
    },
  };
};

/**
 * Lightweight heuristic detector. Mirrors V1 but is regex-only and
 * cannot reach into network / DOM. Returns "html" on any HTML-tag
 * pattern; "markdown" on any of the common markdown sigils; otherwise
 * "plain".
 */
export function detectSourceFormat(
  content: string,
): Exclude<FormatTransformerSourceFormat, "auto"> {
  if (HTML_TAG_PATTERN.test(content)) return "html";
  if (
    MD_HEADING_PATTERN.test(content) ||
    MD_BOLD_PATTERN.test(content) ||
    MD_LINK_PATTERN.test(content) ||
    MD_LIST_PATTERN.test(content) ||
    MD_FENCE_PATTERN.test(content)
  ) {
    return "markdown";
  }
  return "plain";
}

const HTML_TAG_PATTERN = /<\/?[a-zA-Z][\s\S]*?>/;
const MD_HEADING_PATTERN = /^#{1,6}\s/m;
const MD_BOLD_PATTERN = /\*\*[^*\n]+\*\*/;
const MD_LINK_PATTERN = /\[[^\]]+\]\([^)]+\)/;
const MD_LIST_PATTERN = /^(?:[-*+]\s|\d+\.\s)/m;
const MD_FENCE_PATTERN = /```/;

function transformContent(
  content: string,
  source: Exclude<FormatTransformerSourceFormat, "auto">,
  target: FormatTransformerTargetFormat,
): string {
  if (source === target) return content;
  if (source === "html") {
    if (target === "markdown") return htmlToMarkdown(content);
    if (target === "plain") return htmlToPlain(content);
    // target === "slack_markdown"
    return markdownToSlackMarkdown(htmlToMarkdown(content));
  }
  if (source === "markdown") {
    if (target === "html") return markdownToHtml(content);
    if (target === "plain") return markdownToPlain(content);
    // target === "slack_markdown"
    return markdownToSlackMarkdown(content);
  }
  // source === "plain"
  if (target === "html") return plainToHtml(content);
  // plain → markdown / plain → slack_markdown: passthrough (plain text
  // is valid markdown / Slack markdown).
  return content;
}

// ── HTML → Markdown ─────────────────────────────────────────────────────────
//
// Minimal in-tree converter. Handles the tags we care about for workflow
// content (headings, inline emphasis, anchors, lists, paragraphs, line
// breaks, code, blockquote). Unknown tags are stripped to their text
// content. Stays well under 2 KiB of regex. NOT a full HTML5 parser —
// nested tables, complex attribute escaping, and CDATA are intentionally
// out of scope.

export function htmlToMarkdown(html: string): string {
  let s = html;

  // Drop scripts and styles entirely.
  s = s.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style\b[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");

  // Block-level conversions (order matters: outermost / longest first).
  s = s.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level, body) => {
    const hashes = "#".repeat(Number(level));
    return `\n\n${hashes} ${stripInlineHtml(body).trim()}\n\n`;
  });

  s = s.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m, body) => {
    const inner = stripInlineHtml(body).trim();
    const quoted = inner
      .split("\n")
      .map((line) => (line.length > 0 ? `> ${line}` : ">"))
      .join("\n");
    return `\n\n${quoted}\n\n`;
  });

  s = s.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_m, body) => {
    // Preserve content inside <pre> as a code fence; strip inner tags.
    return `\n\n\`\`\`\n${stripTags(body)}\n\`\`\`\n\n`;
  });

  s = s.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_m, body) =>
    convertList(body, "ol"),
  );
  s = s.replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi, (_m, body) =>
    convertList(body, "ul"),
  );

  s = s.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (_m, body) => {
    return `\n\n${stripInlineHtml(body).trim()}\n\n`;
  });

  s = s.replace(/<br\s*\/?>/gi, "  \n");
  s = s.replace(/<hr\s*\/?>/gi, "\n\n---\n\n");

  // Inline conversions.
  s = stripInlineHtml(s);

  // Collapse runs of more than two newlines.
  s = s.replace(/\n{3,}/g, "\n\n");

  return s.trim();
}

function convertList(body: string, type: "ol" | "ul"): string {
  const items: string[] = [];
  const itemRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let match: RegExpExecArray | null;
  let i = 1;
  while ((match = itemRe.exec(body)) !== null) {
    const text = stripInlineHtml(match[1] ?? "").trim();
    const prefix = type === "ol" ? `${i}. ` : "- ";
    items.push(`${prefix}${text}`);
    i++;
  }
  return `\n\n${items.join("\n")}\n\n`;
}

function stripInlineHtml(html: string): string {
  let s = html;

  // Anchors with href → markdown links.
  s = s.replace(
    /<a\b[^>]*href=("([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi,
    (_m, _wrap, doubleQ, singleQ, body) => {
      const href = doubleQ ?? singleQ ?? "";
      const text = stripTags(body).trim();
      return `[${text}](${href})`;
    },
  );

  // Strong / b.
  s = s.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**");
  // Emphasis / i.
  s = s.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*");
  // Inline code.
  s = s.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, "`$1`");
  // Strikethrough.
  s = s.replace(/<(del|s|strike)\b[^>]*>([\s\S]*?)<\/\1>/gi, "~~$2~~");

  // Everything else → strip the tag, keep the inner text.
  s = stripTags(s);

  return s;
}

function stripTags(html: string): string {
  return html.replace(/<\/?[a-zA-Z][^>]*>/g, "");
}

export function htmlToPlain(html: string): string {
  const markdown = htmlToMarkdown(html);
  return markdownToPlain(markdown);
}

// ── Markdown → HTML ─────────────────────────────────────────────────────────

export function markdownToHtml(markdown: string): string {
  let s = markdown;

  // Fenced code blocks (preserve verbatim, escape).
  const fenceParts: string[] = [];
  s = s.replace(/```([\s\S]*?)```/g, (_m, body) => {
    const idx = fenceParts.length;
    fenceParts.push(`<pre><code>${escapeHtml(body)}</code></pre>`);
    return `__FENCE_${idx}__`;
  });

  // Headings.
  for (let level = 6; level >= 1; level--) {
    const re = new RegExp(`^${"#".repeat(level)}\\s+(.+)$`, "gm");
    s = s.replace(re, `<h${level}>$1</h${level}>`);
  }

  // Bold + italic.
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
  s = s.replace(/(?<![\w_])_([^_\n]+)_(?![\w_])/g, "<em>$1</em>");

  // Inline code (after fenced are out).
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  // Links.
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Paragraph splitting on blank lines.
  const paragraphs = s
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => {
      // Don't double-wrap pre-formed block-level html.
      if (/^<(h[1-6]|pre|ul|ol|blockquote)\b/.test(p)) return p;
      if (p.startsWith("__FENCE_")) return p;
      return `<p>${p.replace(/\n/g, "<br>")}</p>`;
    });

  let out = paragraphs.join("\n");

  // Restore fenced code blocks.
  out = out.replace(/__FENCE_(\d+)__/g, (_m, idx) => {
    return fenceParts[Number(idx)] ?? "";
  });

  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── Markdown → Plain ────────────────────────────────────────────────────────

export function markdownToPlain(markdown: string): string {
  let s = markdown;
  // Remove fenced code blocks entirely.
  s = s.replace(/```[\s\S]*?```/g, "");
  // Links: keep the text only.
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // Headings.
  s = s.replace(/^#{1,6}\s+/gm, "");
  // Bold / italic / strikethrough / inline code.
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "$1");
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1");
  s = s.replace(/(?<![\w_])_([^_\n]+)_(?![\w_])/g, "$1");
  s = s.replace(/~~([^~\n]+)~~/g, "$1");
  s = s.replace(/`([^`\n]+)`/g, "$1");
  // Blockquotes.
  s = s.replace(/^>\s?/gm, "");
  // List markers.
  s = s.replace(/^(?:[-*+]|\d+\.)\s+/gm, "");
  return s.trim();
}

// ── Markdown → Slack Markdown ───────────────────────────────────────────────

export function markdownToSlackMarkdown(markdown: string): string {
  let s = markdown;
  // Slack's bold is single asterisks; convert ** to *.
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "*$1*");
  // Slack's strikethrough uses single tildes.
  s = s.replace(/~~([^~\n]+)~~/g, "~$1~");
  // Slack links: `<url|text>`. Translate inline markdown links.
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<$2|$1>");
  return s;
}

// ── Plain → HTML ────────────────────────────────────────────────────────────

export function plainToHtml(plain: string): string {
  const escaped = escapeHtml(plain);
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`);
  if (paragraphs.length === 0) return "";
  return paragraphs.join("\n");
}
