/**
 * RESPONSIVE-FOUNDATION-1 — Templates responsive regression coverage.
 *
 * jsdom has no layout engine, so the PIXEL claims live in the harness sweep
 * (`scripts/trash/responsive-foundation/screenshot-templates.mjs`, 780
 * measurements from 360→1600). What is asserted here is the set of structural
 * decisions those pixels depend on — the ones a future edit could silently undo:
 * the fixed widths that must stay gone, the `min-w-0`/`shrink-0` pairs that
 * decide WHICH element yields, and the wrap/reflow rules.
 *
 * Assertions check for the PRESENCE or ABSENCE of individual class tokens, never
 * a whole generated class string or its ordering.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/templates",
}));

import { TemplatesDashboard } from "@/features/templates/TemplatesDashboard";
import { TemplateCard } from "@/features/templates/TemplateCard";
import { TemplateDetailsDialog } from "@/features/templates/TemplateDetailsDialog";
import type { MarketplaceTemplateSummary, MyTemplateItem } from "@/features/templates/types";
import type { TemplateCardMeta } from "@/contracts/workflowTemplate";

const LONG_UNBROKEN =
  "Supercalifragilisticexpialidocious_automation_template_for_enterprise_revenue_operations_2026";
const LONG_MULTIWORD =
  "Quarterly revenue reconciliation, Slack digest, and finance operations follow-up for the enterprise accounts team";

const cardMeta = {
  category: "sales-crm",
  triggerKind: "provider-event",
  providers: ["hubspot", "slack", "google-sheets", "mailchimp", "stripe"],
  stepCount: 5,
  steps: [
    { kind: "trigger", provider: "hubspot", type: "new_contact" },
    { kind: "action", provider: "slack", type: "send_channel_message" },
  ],
} as unknown as TemplateCardMeta;

function marketplaceItem(over: Partial<MarketplaceTemplateSummary> & { id: string; name: string }) {
  return {
    description: "Route new leads automatically.",
    isOfficial: true,
    creatorDisplayName: null,
    usageCount: 12,
    forkCount: 3,
    card: cardMeta,
    ...over,
  } as MarketplaceTemplateSummary;
}

const marketplace: readonly MarketplaceTemplateSummary[] = [
  marketplaceItem({ id: "t1", name: "Google Review Test" }),
  marketplaceItem({ id: "t2", name: LONG_MULTIWORD }),
  marketplaceItem({ id: "t3", name: LONG_UNBROKEN }),
];

const mine: readonly MyTemplateItem[] = [
  {
    id: "m1",
    name: LONG_UNBROKEN,
    description: "A private copy.",
    source: "user",
    visibility: "private",
    usageCount: 2,
    forkCount: 0,
    publishedAt: null,
    canManage: true,
  },
];

function renderDashboard() {
  return render(
    <TemplatesDashboard accountId="acc-1" initialMarketplace={marketplace} initialMine={mine} />,
  );
}

describe("§3 filter and sort cluster", () => {
  it("no longer pins the selects to a fixed narrow-width w-44 wrapper", () => {
    renderDashboard();
    // The exact failure this batch fixes: two 176px triggers plus Clear filters
    // in a non-wrapping row, ~400px that could not shrink. `w-44` may survive
    // ONLY behind an `lg:` prefix, where there is provably room for it.
    for (const testId of ["templates-provider-filter", "templates-sort"]) {
      const trigger = screen.getByTestId(testId);
      expect(trigger.className).toContain("min-w-0");
      expect(trigger.className).toContain("w-full");
      expect(trigger.className).not.toMatch(/(^|\s)w-44(\s|$)/);
    }
  });

  it("gives the control group a reflowing grid instead of a rigid row", () => {
    renderDashboard();
    const controls = screen.getByTestId("templates-controls");
    expect(controls.className).toContain("min-w-0");
    // one column narrow → two columns → inline at lg
    expect(controls.className).toContain("grid-cols-1");
    expect(controls.className).toMatch(/min-\[480px\]:grid-cols-2/);
    expect(controls.className).toMatch(/lg:flex/);
  });

  it("keeps Clear filters visible and full-width at narrow rather than dropping it", () => {
    renderDashboard();
    fireEvent.change(screen.getByTestId("templates-search"), { target: { value: "review" } });
    const clear = screen.getByTestId("templates-clear-filters");
    expect(clear).toBeVisible();
    expect(clear.className).toContain("w-full");
    expect(clear.className).toMatch(/lg:w-auto/);
  });

  it("lets the search row wrap and the input shrink to nothing before overflowing", () => {
    renderDashboard();
    expect(screen.getByTestId("templates-controls-row").className).toContain("flex-wrap");
    const search = screen.getByTestId("templates-search");
    expect(search.className).toContain("min-w-0");
    expect(search.className).toContain("flex-1");
  });
});

describe("§4 category navigation", () => {
  it("declares WRAP as its narrow behaviour and keeps labels at full size", () => {
    renderDashboard();
    const chips = screen.getByTestId("templates-category-chips");
    expect(chips).toHaveAttribute("data-narrow-behavior", "wrap");
    expect(chips.className).toContain("flex-wrap");
    // Labels must not compress into unreadable text.
    expect(screen.getByTestId("templates-category-all").className).toContain("shrink-0");
  });

  it("keeps the active category rendered and marked, never scrolled out of existence", () => {
    renderDashboard();
    const all = screen.getByTestId("templates-category-all");
    expect(all).toHaveAttribute("aria-pressed", "true");
    expect(all).toBeVisible();
  });
});

describe("§5 template grid", () => {
  it("reflows with auto-fit/minmax instead of stacked grid-cols breakpoints", () => {
    renderDashboard();
    const grid = screen.getByTestId("templates-grid");
    expect(grid.className).toContain("auto-fit");
    // `min(300px,100%)` is what stops a 300px track overflowing a 360px screen.
    expect(grid.className).toContain("minmax(min(300px,100%),1fr)");
    expect(grid.className).not.toMatch(/sm:grid-cols-2/);
    expect(grid.className).not.toMatch(/xl:grid-cols-3/);
  });
});

describe("§6 card title row", () => {
  it("lets the title shrink and pins the visibility chip so it cannot be pushed out", () => {
    render(
      <TemplateCard
        templateId="m1"
        name={LONG_UNBROKEN}
        description="x"
        attribution={{ kind: "mine" }}
        visibility="private"
        usageCount={1}
        forkCount={0}
        busy={false}
        onUse={() => {}}
        onFork={() => {}}
      />,
    );
    const chip = screen.getByTestId("visibility-chip");
    expect(chip.parentElement?.className).toContain("shrink-0");
    const title = screen.getByRole("heading", { level: 3 });
    expect(title.className).toContain("min-w-0");
    expect(title.className).toContain("break-words");
    // Titles WRAP — they are not all truncated to one line to satisfy one fixture.
    expect(title.className).not.toContain("truncate");
  });

  it("keeps a normal title fully readable and the details action working", () => {
    const onDetails = jest.fn();
    render(
      <TemplateCard
        templateId="t1"
        name="Google Review Test"
        description="Watch for new Google reviews."
        attribution={{ kind: "official" }}
        usageCount={5}
        forkCount={1}
        busy={false}
        onUse={() => {}}
        onFork={() => {}}
        onDetails={onDetails}
      />,
    );
    const title = screen.getByTestId("template-title");
    expect(title).toHaveTextContent("Google Review Test");
    fireEvent.click(title);
    expect(onDetails).toHaveBeenCalledTimes(1);
  });
});

describe("§7-8 card chips and actions", () => {
  it("wraps chip clusters and never lets one long provider name widen the card", () => {
    render(
      <TemplateCard
        templateId="t1"
        name="Chips"
        description={null}
        attribution={{ kind: "official" }}
        card={cardMeta}
        usageCount={0}
        forkCount={0}
        busy={false}
        onUse={() => {}}
        onFork={() => {}}
      />,
    );
    expect(screen.getByTestId("template-providers").className).toContain("flex-wrap");
    expect(screen.getByTestId("template-card").className).toContain("min-w-0");
    // Chips keep their shape but cap at the card width.
    expect(screen.getByTestId("template-category").className).toContain("max-w-full");
  });

  it("wraps the action row and keeps every action reachable", () => {
    const onUse = jest.fn();
    const onFork = jest.fn();
    render(
      <TemplateCard
        templateId="t1"
        name="Actions"
        description={null}
        attribution={{ kind: "official" }}
        usageCount={0}
        forkCount={0}
        busy={false}
        onUse={onUse}
        onFork={onFork}
        onDetails={() => {}}
      />,
    );
    const use = screen.getByTestId("template-use");
    const fork = screen.getByTestId("template-fork");
    expect(use.parentElement?.className).toContain("flex-wrap");
    // Buttons keep their labels; the ROW wraps instead of the button squashing.
    expect(use.className).toContain("shrink-0");
    expect(fork.className).toContain("shrink-0");
    fireEvent.click(use);
    fireEvent.click(fork);
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(onFork).toHaveBeenCalledTimes(1);
  });

  it("still exposes manage actions for the viewer's own templates", () => {
    const onTogglePublish = jest.fn();
    const onDelete = jest.fn();
    render(
      <TemplateCard
        templateId="m1"
        name="Mine"
        description={null}
        attribution={{ kind: "mine" }}
        visibility="private"
        usageCount={0}
        forkCount={0}
        busy={false}
        onUse={() => {}}
        onFork={() => {}}
        manage={{ visibility: "private", onTogglePublish, onDelete }}
      />,
    );
    fireEvent.click(screen.getByTestId("template-toggle-publish"));
    fireEvent.click(screen.getByTestId("template-delete"));
    expect(onTogglePublish).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

describe("§10 toast", () => {
  it("is bounded to the viewport with safe margins and wraps unbroken text", async () => {
    renderDashboard();
    // Drive a real toast through the existing failure path (no network mock →
    // the fork call rejects → the error toast renders).
    fireEvent.click(within(screen.getAllByTestId("template-card")[0]!).getByTestId("template-fork"));
    const toast = await screen.findByTestId("templates-toast");
    expect(toast.style.maxWidth).toBe("calc(100vw - 2rem)");
    // `w-max` === width: max-content. Asserted as a class because jsdom's CSS
    // parser drops the `max-content` keyword from an inline style.
    expect(toast.className).toContain("w-max");
    expect(toast.className).toContain("break-words");
  });
});

describe("§11 details dialog", () => {
  it("stays inside the viewport with safe margins and scrolls its body", () => {
    render(
      <TemplateDetailsDialog
        template={marketplace[2]!}
        busy={false}
        onUse={() => {}}
        onFork={() => {}}
        onClose={() => {}}
      />,
    );
    const dialog = screen.getByTestId("template-details-dialog");
    // `w-full max-w-lg` inside the overlay's p-4 is what guarantees the 1rem
    // gutter at 360px; min-w-0 lets the header/body shrink inside it.
    expect(dialog.className).toContain("w-full");
    expect(dialog.className).toContain("max-w-lg");
    expect(dialog.className).toContain("min-w-0");
    expect(dialog.className).toContain("max-h-[85vh]");
    expect(screen.getByTestId("template-details-close").className).toContain("shrink-0");
  });

  it("wraps a long unbroken title instead of colliding with the close control", () => {
    render(
      <TemplateDetailsDialog
        template={marketplace[2]!}
        busy={false}
        onUse={() => {}}
        onFork={() => {}}
        onClose={() => {}}
      />,
    );
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.className).toContain("break-words");
    expect(heading.parentElement?.className).toContain("min-w-0");
  });

  it("keeps Use and Save a copy working", () => {
    const onUse = jest.fn();
    const onFork = jest.fn();
    render(
      <TemplateDetailsDialog
        template={marketplace[0]!}
        busy={false}
        onUse={onUse}
        onFork={onFork}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("template-details-use"));
    fireEvent.click(screen.getByTestId("template-details-fork"));
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(onFork).toHaveBeenCalledTimes(1);
  });
});

describe("existing behaviour is unchanged", () => {
  it("still filters, counts, and switches tabs", () => {
    renderDashboard();
    expect(screen.getByTestId("templates-count")).toHaveTextContent("3");
    fireEvent.change(screen.getByTestId("templates-search"), { target: { value: "Google Review" } });
    expect(screen.getByTestId("templates-count")).toHaveTextContent("1");
    fireEvent.click(screen.getByTestId("templates-tab-mine"));
    expect(screen.getByTestId("templates-tab-mine")).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the empty state inside the same bounded region as the grid", () => {
    render(<TemplatesDashboard accountId="acc-1" initialMarketplace={[]} initialMine={[]} />);
    const empty = screen.getByTestId("templates-empty");
    expect(empty.className).toContain("min-w-0");
  });
});
