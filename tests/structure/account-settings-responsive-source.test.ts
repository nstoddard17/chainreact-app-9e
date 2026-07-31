/**
 * Structure guard: Account Settings fixes overflow at its causes and owns its
 * page bounds through the shared container (RESPONSIVE-SETTINGS-3).
 *
 * Two failure modes this exists to prevent, both of which turn a green harness
 * into a lie:
 *
 *  1. **Blanket overflow masking.** `overflow-x-hidden` / `overflow-x-clip` on a
 *     page or section makes `document.scrollWidth <= clientWidth` true while the
 *     content underneath is still bursting — the sweep goes green because the
 *     evidence was hidden, not because the layout was fixed. Card-level
 *     `overflow-hidden` (rounded corners on `Panel`) is a different thing and is
 *     allowed; the axis-specific variants are the ones used to hide bugs.
 *
 *  2. **Two width systems layered.** The point of `AppPageContainer` is that one
 *     component owns the page's max-width, fluid gutter and `min-width: 0`. A page
 *     that adopts it AND keeps its old `p-6 sm:p-8` gutter ends up double-padded,
 *     and the next person cannot tell which one is load-bearing.
 */
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const ACCOUNT_PAGE = join(ROOT, "app", "account", "page.tsx");
const ACCOUNT_FEATURE = join(ROOT, "features", "account");
/** Shared settings primitives the Account page renders through. */
const SHARED_SETTINGS = [
  join(ROOT, "features", "team", "SettingRow.tsx"),
  join(ROOT, "features", "team", "Panel.tsx"),
  join(ROOT, "features", "team", "SectionHeading.tsx"),
];

function collect(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collect(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Strip comments so the guard never fires on prose that discusses the pattern. */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const SOURCES = [ACCOUNT_PAGE, ...collect(ACCOUNT_FEATURE), ...SHARED_SETTINGS];

describe("Account Settings does not mask horizontal overflow", () => {
  it("uses no overflow-x-hidden / overflow-x-clip anywhere in the settings surface", () => {
    const offenders = SOURCES.filter((f) => /overflow-x-(hidden|clip)/.test(code(f))).map((f) =>
      relative(ROOT, f).split("\\").join("/"),
    );
    expect(offenders).toEqual([]);
  });

  it("allows a LOCAL overflow-x-auto scroller only where content is genuinely wide", () => {
    // A pre-formatted code block and a client-config block are the two places
    // where content is legitimately wider than a phone and cannot be reflowed.
    // Each must also be capped so the scroller itself cannot widen its card.
    const scrollers = SOURCES.filter((f) => /overflow-x-auto/.test(code(f)));
    for (const f of scrollers) {
      const body = code(f);
      for (const match of body.match(/className="[^"]*overflow-x-auto[^"]*"/g) ?? []) {
        expect(match).toContain("max-w-full");
      }
    }
    expect(scrollers.map((f) => relative(ROOT, f).split("\\").join("/")).sort()).toEqual([
      "features/account/ApiDocsPanel.tsx",
      "features/account/mcp/McpTokenConfigBlock.tsx",
    ]);
  });
});

describe("Account Settings owns its page bounds through AppPageContainer", () => {
  const page = code(ACCOUNT_PAGE);

  it("renders the shared container rather than a hand-rolled <main>", () => {
    expect(page).toContain("AppPageContainer");
    expect(page).not.toMatch(/<main\b/);
  });

  it("does not layer a second gutter on top of the container's fluid padding", () => {
    // The container already applies `padding-inline: clamp(1rem, 2.5vw, 2rem)`.
    // Horizontal padding here would double it; vertical padding is the page's own.
    const containerTag = /<AppPageContainer[\s\S]*?>/.exec(page)?.[0] ?? "";
    expect(containerTag).not.toMatch(/\bp-\d/);
    expect(containerTag).not.toMatch(/\bpx-\d/);
    expect(containerTag).not.toMatch(/\bsm:p-\d/);
    expect(containerTag).not.toMatch(/\bmax-w-/);
  });

  it("asks for a named width variant rather than a one-off numeric width", () => {
    expect(page).toMatch(/width="(app|content|reading)"/);
  });
});

describe("the settings row keeps its responsive contract", () => {
  const row = code(join(ROOT, "features", "team", "SettingRow.tsx"));

  it("never pins the control slot with shrink-0 again", () => {
    // This single class is what made a long email the row's minimum width and
    // pushed ~300px of content under the card's `overflow-hidden`.
    expect(row).not.toContain("shrink-0");
  });

  it("stacks before it sits side-by-side", () => {
    expect(row).toContain("sm:flex-row");
    expect(row).toContain("min-w-0");
  });
});
