/**
 * Help Center landing page (HELP-CENTER-1).
 *
 * Protects user-visible behavior: the page renders its primary sections in
 * the marketing surface, search actually finds articles (title / keyword)
 * and shows a useful no-results state, keyboard navigation opens a result,
 * category selection shows that category's articles, provider entries come
 * from props (server-derived from the registry) and are hidden when empty,
 * and the support callout is a real mailto — never a dead control.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelpCenterPage } from "@/features/marketing/HelpCenterPage";
import { HelpSupportCallout } from "@/features/marketing/help/HelpSupportCallout";
import { helpArticleCount } from "@/features/marketing/help/helpCatalog";
import type { HelpProviderEntry } from "@/features/marketing/help/helpTypes";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => "/help",
}));

const PROVIDERS: HelpProviderEntry[] = [
  {
    id: "slack",
    name: "Slack",
    description: "Post messages, DMs, and reactions.",
    iconUrl: "/integrations/slack.svg",
    articleSlug: "connect-slack",
  },
  {
    id: "fleetio",
    name: "Fleetio",
    description: "Track fleet maintenance, inspections, and service costs.",
    iconUrl: "/integrations/fleetio.svg",
    articleSlug: "connect-fleetio",
  },
];

beforeEach(() => {
  mockPush.mockClear();
});

describe("HelpCenterPage — structure", () => {
  it("renders in the marketing surface with header + footer and exactly one <h1>", () => {
    render(<HelpCenterPage providers={PROVIDERS} />);
    const surface = screen.getByTestId("help-center-page");
    expect(surface).toHaveAttribute("data-marketing-surface");
    expect(screen.getByTestId("marketing-footer")).toBeInTheDocument();
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("How can we help?");
  });

  it("renders the primary sections: quick start, categories, popular, integrations, support", () => {
    render(<HelpCenterPage providers={PROVIDERS} />);
    expect(screen.getByTestId("help-quick-start")).toBeInTheDocument();
    expect(screen.getByTestId("help-categories")).toBeInTheDocument();
    expect(screen.getByTestId("help-popular")).toBeInTheDocument();
    expect(screen.getByTestId("help-integrations")).toBeInTheDocument();
    expect(screen.getByTestId("help-support-callout")).toBeInTheDocument();
  });

  it("quick start lists the five onboarding articles in order, linking to real article routes", () => {
    render(<HelpCenterPage providers={PROVIDERS} />);
    const list = within(screen.getByTestId("help-quick-start")).getAllByRole("link");
    expect(list).toHaveLength(5);
    expect(list[0]).toHaveAttribute("href", "/help/connect-an-app");
    expect(list[1]).toHaveAttribute("href", "/help/create-your-first-workflow");
    expect(list[2]).toHaveAttribute("href", "/help/configure-workflow-steps");
    expect(list[3]).toHaveAttribute("href", "/help/test-a-workflow");
    expect(list[4]).toHaveAttribute("href", "/help/turn-on-a-workflow");
  });

  it("signed-out (default) header shows Sign in / Try it free", () => {
    render(<HelpCenterPage providers={PROVIDERS} />);
    expect(screen.getByTestId("marketing-nav-signin")).toBeInTheDocument();
    expect(screen.getByTestId("marketing-nav-tryfree")).toBeInTheDocument();
    expect(screen.queryByTestId("marketing-nav-open-app")).not.toBeInTheDocument();
  });

  it("authenticated viewer gets an 'Open ChainReact' header link instead of auth CTAs", () => {
    render(<HelpCenterPage providers={PROVIDERS} authenticated />);
    const open = screen.getByTestId("marketing-nav-open-app");
    expect(open).toHaveAttribute("href", "/workflows");
    expect(open).toHaveTextContent("Open ChainReact");
    expect(screen.queryByTestId("marketing-nav-signin")).not.toBeInTheDocument();
    expect(screen.queryByTestId("marketing-nav-tryfree")).not.toBeInTheDocument();
  });

  it("footer carries the Help Center link (support navigation entry)", () => {
    render(<HelpCenterPage providers={PROVIDERS} />);
    const footer = screen.getByTestId("marketing-footer");
    expect(within(footer).getByRole("link", { name: "Help Center" })).toHaveAttribute(
      "href",
      "/help",
    );
  });
});

describe("HelpCenterPage — search", () => {
  it("finds articles by title as the user types and links to the article route", async () => {
    const user = userEvent.setup();
    render(<HelpCenterPage providers={PROVIDERS} />);
    const input = screen.getByTestId("help-search-input");
    expect(input).toHaveAccessibleName("Search help articles");
    await user.click(input);
    await user.paste("triggers");
    const results = screen.getByTestId("help-search-results");
    const option = within(results).getByRole("option", {
      name: /understand triggers and actions/i,
    });
    expect(option).toHaveAttribute("href", "/help/understand-triggers-and-actions");
  });

  it("finds articles by keyword (not just title words)", async () => {
    const user = userEvent.setup();
    render(<HelpCenterPage providers={PROVIDERS} />);
    await user.click(screen.getByTestId("help-search-input"));
    await user.paste("quota");
    const results = screen.getByTestId("help-search-results");
    expect(
      within(results).getByRole("option", { name: /understand task usage/i }),
    ).toBeInTheDocument();
  });

  it("shows a useful no-results state with a real support mailto", async () => {
    const user = userEvent.setup();
    render(<HelpCenterPage providers={PROVIDERS} />);
    await user.click(screen.getByTestId("help-search-input"));
    await user.paste("xyzzy-plugh-42");
    expect(screen.queryByTestId("help-search-results")).not.toBeInTheDocument();
    const empty = screen.getByTestId("help-search-empty");
    expect(empty).toHaveTextContent(/no articles match/i);
    expect(within(empty).getByRole("link", { name: /email support/i })).toHaveAttribute(
      "href",
      "mailto:support@chainreact.app",
    );
  });

  it("supports keyboard navigation: ArrowDown + Enter opens the highlighted result", async () => {
    const user = userEvent.setup();
    render(<HelpCenterPage providers={PROVIDERS} />);
    const input = screen.getByTestId("help-search-input");
    await user.click(input);
    await user.paste("triggers");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(mockPush).toHaveBeenCalledWith("/help/understand-triggers-and-actions");
  });

  it("Escape clears the query and closes the results", async () => {
    const user = userEvent.setup();
    render(<HelpCenterPage providers={PROVIDERS} />);
    const input = screen.getByTestId("help-search-input");
    await user.click(input);
    await user.paste("triggers");
    expect(screen.getByTestId("help-search-results")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(input).toHaveValue("");
    expect(screen.queryByTestId("help-search-results")).not.toBeInTheDocument();
  });
});

describe("HelpCenterPage — category browsing", () => {
  it("renders all six category cards with catalog-derived article counts", () => {
    render(<HelpCenterPage providers={PROVIDERS} />);
    for (const id of [
      "getting-started",
      "workflows",
      "connecting-apps",
      "troubleshooting",
      "accounts-teams",
      "billing-usage",
    ] as const) {
      const card = screen.getByTestId(`help-category-card-${id}`);
      expect(card).toHaveAttribute("aria-pressed", "false");
      expect(card).toHaveTextContent(`${helpArticleCount(id)} articles`);
    }
  });

  it("selecting a category shows that category's articles — and only those", async () => {
    const user = userEvent.setup();
    render(<HelpCenterPage providers={PROVIDERS} />);
    await user.click(screen.getByTestId("help-category-card-troubleshooting"));
    const panel = screen.getByTestId("help-category-panel");
    expect(
      within(panel).getByRole("link", { name: /troubleshoot a failed workflow run/i }),
    ).toHaveAttribute("href", "/help/troubleshoot-a-failed-run");
    expect(
      within(panel).getByRole("link", { name: /fix workflow setup issues/i }),
    ).toBeInTheDocument();
    expect(
      within(panel).queryByRole("link", { name: /understand task usage/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("help-category-card-troubleshooting")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("'Show all topics' collapses the category panel", async () => {
    const user = userEvent.setup();
    render(<HelpCenterPage providers={PROVIDERS} />);
    await user.click(screen.getByTestId("help-category-card-workflows"));
    expect(screen.getByTestId("help-category-panel")).toBeInTheDocument();
    await user.click(screen.getByTestId("help-category-clear"));
    expect(screen.queryByTestId("help-category-panel")).not.toBeInTheDocument();
  });
});

describe("HelpCenterPage — integrations + support honesty", () => {
  it("provider entries render from props (registry-derived) and link to their articles", () => {
    render(<HelpCenterPage providers={PROVIDERS} />);
    const slack = screen.getByTestId("help-provider-slack");
    expect(slack).toHaveAttribute("href", "/help/connect-slack");
    expect(slack).toHaveTextContent("Slack");
    const fleetio = screen.getByTestId("help-provider-fleetio");
    expect(fleetio).toHaveAttribute("href", "/help/connect-fleetio");
    expect(fleetio).toHaveTextContent("Fleetio");
  });

  it("hides the integrations section entirely when no providers are passed", () => {
    render(<HelpCenterPage providers={[]} />);
    expect(screen.queryByTestId("help-integrations")).not.toBeInTheDocument();
  });

  it("support callout is a real mailto to the staffed mailbox", () => {
    render(<HelpCenterPage providers={PROVIDERS} />);
    expect(screen.getByTestId("help-support-email")).toHaveAttribute(
      "href",
      "mailto:support@chainreact.app",
    );
  });

  it("HelpSupportCallout renders NOTHING when no support destination is configured", () => {
    const { container } = render(<HelpSupportCallout email={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
