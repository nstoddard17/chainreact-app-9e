/**
 * @jest-environment node
 *
 * Tests for integrations/native/actions/formatTransformer — Native-nodes
 * Slice 1 Commit 2 (docs/slices/parity/native-nodes-1-tier-a-plan.md §10.2).
 *
 * Pure-handler native action — no OAuth / no integration lookup / no
 * network. Schema is `.strict()` and rejects the V1 cosmetic flags
 * (`preserveVariables`) at parse time. HTML / Markdown / Plain /
 * Slack-Markdown transforms run through the in-tree converter (no
 * turndown dependency).
 */

import { ZodError } from "zod";
import {
  formatTransformer,
  detectSourceFormat,
  htmlToMarkdown,
  htmlToPlain,
  markdownToHtml,
  markdownToPlain,
  markdownToSlackMarkdown,
  plainToHtml,
  FormatTransformerOutputCapExceededError,
} from "@/integrations/native/actions/formatTransformer";
import { FormatTransformerConfigSchema } from "@/integrations/native/actions/formatTransformer.schema";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const triggerEvent: TriggerEvent = {
  provider: "native",
  eventType: "manual.run",
  eventId: "evt-1",
  occurredAt: "2026-05-15T00:00:00Z",
  accountId: "system",
  payload: {},
};

function makeInput(config: Record<string, unknown>): ActionHandlerInput {
  return {
    workflowId: "wf-1",
    userId: "user-1",
    runId: "run-1",
    nodeId: "n-fmt",
    config,
    triggerEvent,
  };
}

// ── Schema tests ────────────────────────────────────────────────────────────

describe("format_transformer schema", () => {
  it("accepts a minimal valid config with sourceFormat defaulting to auto", () => {
    const parsed = FormatTransformerConfigSchema.parse({
      content: "hello",
      targetFormat: "markdown",
    });
    expect(parsed.sourceFormat).toBe("auto");
    expect(parsed.targetFormat).toBe("markdown");
  });

  it("rejects missing targetFormat", () => {
    expect(() =>
      FormatTransformerConfigSchema.parse({ content: "hi" }),
    ).toThrow(ZodError);
  });

  it("rejects missing content", () => {
    expect(() =>
      FormatTransformerConfigSchema.parse({ targetFormat: "html" }),
    ).toThrow(ZodError);
  });

  it("rejects unknown targetFormat values", () => {
    expect(() =>
      FormatTransformerConfigSchema.parse({
        content: "x",
        targetFormat: "rich_text",
      }),
    ).toThrow(ZodError);
  });

  it("rejects unknown sourceFormat values", () => {
    expect(() =>
      FormatTransformerConfigSchema.parse({
        content: "x",
        sourceFormat: "rtf",
        targetFormat: "html",
      }),
    ).toThrow(ZodError);
  });

  it("rejects the V1 preserveVariables cosmetic flag (.strict)", () => {
    expect(() =>
      FormatTransformerConfigSchema.parse({
        content: "x",
        targetFormat: "markdown",
        preserveVariables: true,
      }),
    ).toThrow(ZodError);
  });

  it("rejects content larger than 1 MiB", () => {
    const oversized = "a".repeat(1_048_577);
    expect(() =>
      FormatTransformerConfigSchema.parse({
        content: oversized,
        targetFormat: "plain",
      }),
    ).toThrow(ZodError);
  });
});

// ── Source-format detection ─────────────────────────────────────────────────

describe("detectSourceFormat", () => {
  it("detects HTML by tag presence", () => {
    expect(detectSourceFormat("<p>hi</p>")).toBe("html");
    expect(detectSourceFormat("Click <a href='x'>here</a>")).toBe("html");
  });

  it("detects markdown via heading sigil", () => {
    expect(detectSourceFormat("# title\nbody")).toBe("markdown");
  });

  it("detects markdown via bold marker", () => {
    expect(detectSourceFormat("text **bold** more")).toBe("markdown");
  });

  it("detects markdown via inline link", () => {
    expect(detectSourceFormat("see [docs](https://example.com)")).toBe(
      "markdown",
    );
  });

  it("detects markdown via list marker", () => {
    expect(detectSourceFormat("- item one\n- item two")).toBe("markdown");
    expect(detectSourceFormat("1. first\n2. second")).toBe("markdown");
  });

  it("falls back to plain when no markers match", () => {
    expect(detectSourceFormat("just some plain words")).toBe("plain");
    expect(detectSourceFormat("")).toBe("plain");
  });
});

// ── HTML → Markdown ─────────────────────────────────────────────────────────

describe("htmlToMarkdown", () => {
  it("converts headings", () => {
    expect(htmlToMarkdown("<h1>Title</h1>")).toBe("# Title");
    expect(htmlToMarkdown("<h3>Sub</h3>")).toBe("### Sub");
  });

  it("converts strong and em to bold and italic", () => {
    expect(htmlToMarkdown("<strong>hi</strong>")).toBe("**hi**");
    expect(htmlToMarkdown("<em>hi</em>")).toBe("*hi*");
    expect(htmlToMarkdown("<b>bold</b> and <i>ital</i>")).toBe(
      "**bold** and *ital*",
    );
  });

  it("converts anchors to markdown links", () => {
    expect(htmlToMarkdown('<a href="https://x.com">click</a>')).toBe(
      "[click](https://x.com)",
    );
  });

  it("converts inline code", () => {
    expect(htmlToMarkdown("use <code>fetch()</code>")).toBe(
      "use `fetch()`",
    );
  });

  it("converts unordered lists", () => {
    const html = "<ul><li>one</li><li>two</li></ul>";
    expect(htmlToMarkdown(html)).toBe("- one\n- two");
  });

  it("converts ordered lists with numbering", () => {
    const html = "<ol><li>first</li><li>second</li><li>third</li></ol>";
    expect(htmlToMarkdown(html)).toBe("1. first\n2. second\n3. third");
  });

  it("converts paragraphs separated by blank lines", () => {
    expect(htmlToMarkdown("<p>one</p><p>two</p>")).toBe("one\n\ntwo");
  });

  it("converts <br> to a hard line break", () => {
    expect(htmlToMarkdown("line a<br>line b")).toBe("line a  \nline b");
  });

  it("converts <blockquote> to a quoted markdown block", () => {
    expect(htmlToMarkdown("<blockquote>cited</blockquote>")).toBe("> cited");
  });

  it("converts <pre> to a fenced code block", () => {
    expect(htmlToMarkdown("<pre>const x = 1;</pre>")).toBe(
      "```\nconst x = 1;\n```",
    );
  });

  it("strips <script> and <style> blocks entirely", () => {
    const html = "<p>ok</p><script>alert(1)</script><style>p{}</style>";
    expect(htmlToMarkdown(html)).toBe("ok");
  });

  it("strips HTML comments", () => {
    expect(htmlToMarkdown("<!-- secret --><p>visible</p>")).toBe("visible");
  });

  it("falls through unknown tags to their text content", () => {
    expect(htmlToMarkdown("<section>kept</section>")).toBe("kept");
  });
});

// ── HTML → Plain ────────────────────────────────────────────────────────────

describe("htmlToPlain", () => {
  it("strips tags and returns plain text", () => {
    expect(htmlToPlain("<p>Hello <strong>world</strong></p>")).toBe(
      "Hello world",
    );
  });

  it("preserves paragraph breaks as double newlines", () => {
    expect(htmlToPlain("<p>one</p><p>two</p>")).toBe("one\n\ntwo");
  });

  it("removes script content from the plain output", () => {
    expect(htmlToPlain("<p>ok</p><script>alert(1)</script>")).toBe("ok");
  });
});

// ── Markdown → HTML ─────────────────────────────────────────────────────────

describe("markdownToHtml", () => {
  it("converts a single heading", () => {
    expect(markdownToHtml("# Title")).toBe("<h1>Title</h1>");
  });

  it("converts bold", () => {
    expect(markdownToHtml("hi **there**")).toBe(
      "<p>hi <strong>there</strong></p>",
    );
  });

  it("converts italic with both * and _ syntax", () => {
    expect(markdownToHtml("a *one* b")).toBe("<p>a <em>one</em> b</p>");
    expect(markdownToHtml("a _two_ b")).toBe("<p>a <em>two</em> b</p>");
  });

  it("converts inline code", () => {
    expect(markdownToHtml("use `fetch`")).toBe(
      "<p>use <code>fetch</code></p>",
    );
  });

  it("converts links", () => {
    expect(markdownToHtml("see [docs](https://x.com)")).toBe(
      '<p>see <a href="https://x.com">docs</a></p>',
    );
  });

  it("wraps plain paragraphs in <p> and converts single newlines to <br>", () => {
    expect(markdownToHtml("alpha\nbeta")).toBe("<p>alpha<br>beta</p>");
  });

  it("preserves fenced code blocks and escapes HTML inside them", () => {
    const md = "```\n<script>alert(1)</script>\n```";
    expect(markdownToHtml(md)).toContain("<pre><code>");
    expect(markdownToHtml(md)).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});

// ── Markdown → Plain ────────────────────────────────────────────────────────

describe("markdownToPlain", () => {
  it("strips bold / italic / strikethrough / inline code", () => {
    expect(markdownToPlain("**a** *b* ~~c~~ `d`")).toBe("a b c d");
  });

  it("strips link syntax keeping only text", () => {
    expect(markdownToPlain("see [docs](https://x.com)")).toBe("see docs");
  });

  it("strips heading prefixes", () => {
    expect(markdownToPlain("# Title\nbody")).toBe("Title\nbody");
  });

  it("removes fenced code blocks entirely", () => {
    expect(markdownToPlain("before\n```\ncode\n```\nafter").trim()).toBe(
      "before\n\nafter",
    );
  });

  it("strips list markers and blockquotes", () => {
    expect(markdownToPlain("- item\n> quoted")).toBe("item\nquoted");
  });
});

// ── Markdown → Slack Markdown ───────────────────────────────────────────────

describe("markdownToSlackMarkdown", () => {
  it("converts ** bold to single-asterisk bold", () => {
    expect(markdownToSlackMarkdown("**hi**")).toBe("*hi*");
  });

  it("converts ~~ strikethrough to single tildes", () => {
    expect(markdownToSlackMarkdown("~~no~~")).toBe("~no~");
  });

  it("converts markdown links to Slack <url|text> form", () => {
    expect(markdownToSlackMarkdown("see [docs](https://x.com)")).toBe(
      "see <https://x.com|docs>",
    );
  });
});

// ── Plain → HTML ────────────────────────────────────────────────────────────

describe("plainToHtml", () => {
  it("wraps in <p> and escapes HTML entities", () => {
    expect(plainToHtml("a < b & c")).toBe("<p>a &lt; b &amp; c</p>");
  });

  it("converts blank lines to paragraph splits", () => {
    expect(plainToHtml("one\n\ntwo")).toBe("<p>one</p>\n<p>two</p>");
  });

  it("converts single newlines to <br>", () => {
    expect(plainToHtml("a\nb")).toBe("<p>a<br>b</p>");
  });

  it("returns empty string for empty input", () => {
    expect(plainToHtml("")).toBe("");
  });
});

// ── End-to-end handler tests ────────────────────────────────────────────────

describe("formatTransformer handler — happy paths", () => {
  it("HTML → markdown with auto-detect", async () => {
    const result = await formatTransformer(
      makeInput({
        content: "<p>Hello <strong>world</strong></p>",
        targetFormat: "markdown",
      }),
    );
    expect(result.output).toMatchObject({
      transformedContent: "Hello **world**",
      sourceFormat: "html",
      targetFormat: "markdown",
      inputLength: "<p>Hello <strong>world</strong></p>".length,
      outputLength: "Hello **world**".length,
    });
  });

  it("Markdown → HTML with explicit sourceFormat", async () => {
    const result = await formatTransformer(
      makeInput({
        content: "# Title\nbody **here**",
        sourceFormat: "markdown",
        targetFormat: "html",
      }),
    );
    const out = result.output as { transformedContent: string };
    expect(out.transformedContent).toContain("<h1>Title</h1>");
    expect(out.transformedContent).toContain("<strong>here</strong>");
  });

  it("Markdown → Slack markdown", async () => {
    const result = await formatTransformer(
      makeInput({
        content: "this is **bold** and [click](https://x.com)",
        sourceFormat: "markdown",
        targetFormat: "slack_markdown",
      }),
    );
    expect((result.output as { transformedContent: string }).transformedContent).toBe(
      "this is *bold* and <https://x.com|click>",
    );
  });

  it("Plain → Markdown (passthrough)", async () => {
    const result = await formatTransformer(
      makeInput({
        content: "no formatting here",
        sourceFormat: "plain",
        targetFormat: "markdown",
      }),
    );
    expect((result.output as { transformedContent: string }).transformedContent).toBe(
      "no formatting here",
    );
  });

  it("Same source and target → passthrough", async () => {
    const result = await formatTransformer(
      makeInput({
        content: "<p>echo</p>",
        sourceFormat: "html",
        targetFormat: "html",
      }),
    );
    expect((result.output as { transformedContent: string }).transformedContent).toBe(
      "<p>echo</p>",
    );
  });

  it("reports the resolved sourceFormat (never 'auto') in output", async () => {
    const result = await formatTransformer(
      makeInput({
        content: "<p>x</p>",
        targetFormat: "plain",
      }),
    );
    expect((result.output as { sourceFormat: string }).sourceFormat).toBe(
      "html",
    );
  });
});

// ── Safety / caps ───────────────────────────────────────────────────────────

describe("formatTransformer — safety + caps", () => {
  it("does not call eval or new Function (handler module is pure regex)", () => {
    // Surface the function bodies as strings and assert no dynamic exec.
    const src = formatTransformer.toString() + htmlToMarkdown.toString() + markdownToHtml.toString();
    expect(src).not.toContain("eval(");
    expect(src).not.toContain("new Function");
  });

  it("throws FormatTransformerOutputCapExceededError when output exceeds 2 MiB", async () => {
    // Plain input under 1 MiB explodes under the plainToHtml branch
    // because every char produces &lt; (4x). 600 KiB of '<' → ~2.4 MiB
    // of '&lt;' which trips the cap.
    const sneaky = "<".repeat(600_000);
    await expect(
      formatTransformer(
        makeInput({
          content: sneaky,
          sourceFormat: "plain",
          targetFormat: "html",
        }),
      ),
    ).rejects.toBeInstanceOf(FormatTransformerOutputCapExceededError);
  });

  it("does not log on any conversion path", async () => {
    const info = jest.spyOn(console, "info").mockImplementation(() => undefined);
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await formatTransformer(
        makeInput({
          content: "<p>hi</p>",
          targetFormat: "plain",
        }),
      );
      expect(info).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      info.mockRestore();
      log.mockRestore();
      warn.mockRestore();
      error.mockRestore();
    }
  });
});

// ── Registry wiring ─────────────────────────────────────────────────────────

describe("formatTransformer — registry wiring", () => {
  it("is registered under (native, format_transformer)", async () => {
    const { getActionHandler } = await import(
      "@/services/execution/handlers/_registry"
    );
    expect(getActionHandler("native", "format_transformer")).toBe(
      formatTransformer,
    );
  });
});
