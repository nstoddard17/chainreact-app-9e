/**
 * @jest-environment jsdom
 *
 * features/templates/TemplatesDashboard (CS-XT-7A). Mocks the template API client + the router.
 * Asserts marketplace rendering, official badge, creator attribution, usage/fork counts, the
 * "Your templates" tab + creator-only manage controls, Use → navigate, Fork → refetch + tab
 * switch, tier-error toast, empty state, and that no raw account/user id is rendered.
 */
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { TemplatesDashboard } from "@/features/templates/TemplatesDashboard";
import type { MyTemplateItem, MarketplaceTemplateSummary } from "@/features/templates/types";
import { TemplateApiError } from "@/lib/api/workflowTemplates";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

const api = {
  useTemplate: jest.fn(),
  forkTemplate: jest.fn(),
  listAccountTemplates: jest.fn(),
  updateAccountTemplate: jest.fn(),
  deleteAccountTemplate: jest.fn(),
};
jest.mock("@/lib/api/workflowTemplates", () => ({
  useTemplate: (...a: unknown[]) => api.useTemplate(...a),
  forkTemplate: (...a: unknown[]) => api.forkTemplate(...a),
  listAccountTemplates: (...a: unknown[]) => api.listAccountTemplates(...a),
  updateAccountTemplate: (...a: unknown[]) => api.updateAccountTemplate(...a),
  deleteAccountTemplate: (...a: unknown[]) => api.deleteAccountTemplate(...a),
  TemplateApiError: class TemplateApiError extends Error {
    code: string; status: number;
    constructor(m: string, c: string, s: number) { super(m); this.code = c; this.status = s; }
  },
}));

const ACCOUNT = "acct-1";
const ME = "user-1";

const official: MarketplaceTemplateSummary = {
  id: "off-1", name: "Failed payment recovery", description: "Catch declined charges.",
  source: "official", isOfficial: true, visibility: "public", creatorDisplayName: null,
  usageCount: 12400, forkCount: 12, forkedFromTemplateId: null, publishedAt: "2026-06-01T00:00:00Z", schemaVersion: 1, createdAt: "2026-06-01T00:00:00Z",
  card: {
    nodeCount: 2, stepCount: 1, triggerKind: "app", providers: ["stripe", "slack"], category: "ecommerce",
    steps: [
      { kind: "trigger", provider: "stripe", type: "event_received" },
      { kind: "action", provider: "slack", type: "send_channel_message" },
    ],
  },
};
const community: MarketplaceTemplateSummary = {
  id: "com-1", name: "Lead capture to CRM", description: "Route Typeform leads.",
  source: "user", isOfficial: false, visibility: "public", creatorDisplayName: "Priya Kapoor",
  usageCount: 4300, forkCount: 30, forkedFromTemplateId: null, publishedAt: "2026-06-02T00:00:00Z", schemaVersion: 1, createdAt: "2026-06-02T00:00:00Z",
  card: {
    nodeCount: 2, stepCount: 1, triggerKind: "manual", providers: ["hubspot"], category: "sales-crm",
    steps: [
      { kind: "trigger", provider: "native", type: "manual.run" },
      { kind: "action", provider: "hubspot", type: "create_contact" },
    ],
  },
};
const mineItem: MyTemplateItem = {
  id: "mine-1", name: "Acme deal desk", description: "Internal approvals.",
  source: "user", visibility: "private", usageCount: 0, forkCount: 0, publishedAt: null, canManage: true,
};
const notMine: MyTemplateItem = { ...mineItem, id: "mine-2", name: "Shared by teammate", canManage: false };

function renderDash(over: Partial<Parameters<typeof TemplatesDashboard>[0]> = {}) {
  return render(
    <TemplatesDashboard
      accountId={ACCOUNT}
      initialMarketplace={[official, community]}
      initialMine={[mineItem, notMine]}
      {...over}
    />,
  );
}

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset());
  mockPush.mockReset();
});

it("renders marketplace cards with official badge + community creator + counts", () => {
  renderDash();
  expect(screen.getByText("Failed payment recovery")).toBeInTheDocument();
  expect(screen.getByText("Lead capture to CRM")).toBeInTheDocument();
  expect(screen.getAllByTestId("official-badge").length).toBeGreaterThan(0);
  expect(screen.getByTestId("creator-chip")).toHaveTextContent("Priya Kapoor");
  // usage count rendered (12400)
  expect(screen.getByText("12400")).toBeInTheDocument();
});

it("does not render any raw account_id / user id", () => {
  const { container } = renderDash();
  expect(container.innerHTML).not.toContain(ACCOUNT);
  expect(container.innerHTML).not.toContain(ME);
});

it("'By ChainReact' tab shows only official; 'Community' only public user templates", () => {
  renderDash();
  fireEvent.click(screen.getByTestId("templates-tab-official"));
  expect(screen.getByText("Failed payment recovery")).toBeInTheDocument();
  expect(screen.queryByText("Lead capture to CRM")).toBeNull();
  fireEvent.click(screen.getByTestId("templates-tab-community"));
  expect(screen.getByText("Lead capture to CRM")).toBeInTheDocument();
  expect(screen.queryByText("Failed payment recovery")).toBeNull();
});

it("'Your templates' tab shows owned templates; manage controls only when canManage", () => {
  renderDash();
  fireEvent.click(screen.getByTestId("templates-tab-mine"));
  const cards = screen.getAllByTestId("template-card");
  expect(cards).toHaveLength(2);
  // the creator's own card has Delete; the teammate's (canManage:false) does not.
  const mineCard = screen.getByText("Acme deal desk").closest("[data-testid='template-card']")!;
  const teammateCard = screen.getByText("Shared by teammate").closest("[data-testid='template-card']")!;
  expect(within(mineCard as HTMLElement).queryByTestId("template-delete")).toBeInTheDocument();
  expect(within(teammateCard as HTMLElement).queryByTestId("template-delete")).toBeNull();
});

it("search filters by name", () => {
  renderDash();
  fireEvent.change(screen.getByTestId("templates-search"), { target: { value: "lead" } });
  expect(screen.getByText("Lead capture to CRM")).toBeInTheDocument();
  expect(screen.queryByText("Failed payment recovery")).toBeNull();
});

it("empty state when nothing matches", () => {
  renderDash();
  fireEvent.change(screen.getByTestId("templates-search"), { target: { value: "zzzznope" } });
  expect(screen.getByTestId("templates-empty")).toBeInTheDocument();
});

it("Use calls the API and navigates to the created workflow", async () => {
  api.useTemplate.mockResolvedValue({ workflowId: "wf-new", name: "T" });
  renderDash();
  const card = screen.getByText("Failed payment recovery").closest("[data-testid='template-card']")!;
  fireEvent.click(within(card as HTMLElement).getByTestId("template-use"));
  await waitFor(() => expect(api.useTemplate).toHaveBeenCalledWith("off-1", { targetAccountId: ACCOUNT }));
  expect(mockPush).toHaveBeenCalledWith("/workflows/wf-new?created=1");
});

it("Fork calls the API, refetches own templates, and switches to the mine tab", async () => {
  api.forkTemplate.mockResolvedValue({ template: { id: "tpl-fork" } });
  api.listAccountTemplates.mockResolvedValue([
    { id: "tpl-fork", name: "Lead capture to CRM", description: null, source: "user", visibility: "private", canManage: true, forkedFromTemplateId: "com-1", usageCount: 0, forkCount: 0, publishedAt: null, unpublishedAt: null, schemaVersion: 1, createdAt: "x", updatedAt: "x" },
  ]);
  renderDash({ initialMine: [] });
  const card = screen.getByText("Lead capture to CRM").closest("[data-testid='template-card']")!;
  fireEvent.click(within(card as HTMLElement).getByTestId("template-fork"));
  await waitFor(() => expect(api.forkTemplate).toHaveBeenCalledWith("com-1", { targetAccountId: ACCOUNT }));
  await waitFor(() => expect(api.listAccountTemplates).toHaveBeenCalledWith(ACCOUNT));
  // now on the mine tab, the forked copy shows
  await waitFor(() => expect(screen.getByTestId("templates-toast")).toHaveTextContent(/private copy/i));
});

it("shows a friendly upgrade toast on a tier error", async () => {
  api.forkTemplate.mockRejectedValue(new TemplateApiError("Your plan can't save custom templates. Upgrade to Pro or higher.", "TEMPLATES_REQUIRE_UPGRADE", 403));
  renderDash();
  const card = screen.getByText("Failed payment recovery").closest("[data-testid='template-card']")!;
  fireEvent.click(within(card as HTMLElement).getByTestId("template-fork"));
  await waitFor(() => expect(screen.getByTestId("templates-toast")).toHaveTextContent(/Upgrade to Pro/i));
});

// ── CS-XT-MARKETPLACE-UX: card metadata, category chips, provider filter ──────────

it("renders derived card metadata (category, trigger-kind, step count, providers, preview)", () => {
  renderDash();
  const card = screen.getByText("Failed payment recovery").closest("[data-testid='template-card']")!;
  const el = card as HTMLElement;
  expect(within(el).getByTestId("template-category")).toHaveTextContent("Ecommerce");
  expect(within(el).getByTestId("template-trigger-kind")).toHaveTextContent("App-triggered");
  expect(within(el).getByTestId("template-step-count")).toHaveTextContent("1 step");
  expect(within(el).getByTestId("template-provider-stripe")).toHaveTextContent("Stripe");
  expect(within(el).getByTestId("template-provider-slack")).toHaveTextContent("Slack");
  // static preview chain derived from the definition (no JSON, no config).
  expect(within(el).getByTestId("template-preview")).toHaveTextContent(/Stripe: Event received/);
  expect(within(el).getByTestId("template-preview")).toHaveTextContent(/Slack: Send channel message/);
});

it("category chips appear and filter the marketplace", () => {
  renderDash();
  expect(screen.getByTestId("templates-category-chips")).toBeInTheDocument();
  // both categories present (official=ecommerce, community=sales-crm)
  expect(screen.getByTestId("templates-category-ecommerce")).toBeInTheDocument();
  expect(screen.getByTestId("templates-category-sales-crm")).toBeInTheDocument();
  // filter to Ecommerce → only the Stripe/Slack official remains
  fireEvent.click(screen.getByTestId("templates-category-ecommerce"));
  expect(screen.getByText("Failed payment recovery")).toBeInTheDocument();
  expect(screen.queryByText("Lead capture to CRM")).toBeNull();
  expect(screen.getByTestId("templates-count")).toHaveTextContent("1");
  // back to All → both return
  fireEvent.click(screen.getByTestId("templates-category-all"));
  expect(screen.getByText("Failed payment recovery")).toBeInTheDocument();
  expect(screen.getByText("Lead capture to CRM")).toBeInTheDocument();
});

it("category chips show only buckets present in the current tab and reset on tab change", () => {
  renderDash();
  // narrow to a category, then switch tabs — filter resets so the grid isn't mysteriously empty.
  fireEvent.click(screen.getByTestId("templates-category-sales-crm"));
  expect(screen.queryByText("Failed payment recovery")).toBeNull();
  fireEvent.click(screen.getByTestId("templates-tab-official"));
  // official tab: sales-crm chip is gone (no official is sales-crm), ecommerce present, all shown
  expect(screen.queryByTestId("templates-category-sales-crm")).toBeNull();
  expect(screen.getByTestId("templates-category-ecommerce")).toBeInTheDocument();
  expect(screen.getByText("Failed payment recovery")).toBeInTheDocument();
});

it("provider filter control shows for the marketplace and is hidden on Your templates", () => {
  renderDash();
  expect(screen.getByTestId("templates-provider-filter")).toBeInTheDocument();
  fireEvent.click(screen.getByTestId("templates-tab-mine"));
  expect(screen.queryByTestId("templates-provider-filter")).toBeNull();
  expect(screen.queryByTestId("templates-category-chips")).toBeNull();
});

it("opens the details dialog from the Details button and uses the template from there", async () => {
  api.useTemplate.mockResolvedValue({ workflowId: "wf-x", name: "T" });
  renderDash();
  const card = screen.getByText("Failed payment recovery").closest("[data-testid='template-card']")!;
  fireEvent.click(within(card as HTMLElement).getByTestId("template-details"));
  // the details dialog shows the safe summary + what-happens-next copy BEFORE any create.
  expect(screen.getByTestId("template-details-dialog")).toBeInTheDocument();
  expect(screen.getByTestId("summary-what-happens-next")).toHaveTextContent(/connect apps and fill in required fields/i);
  expect(screen.getByTestId("summary-what-happens-next")).toHaveTextContent(/does not copy credentials/i);
  // confirming Use from the dialog creates + navigates.
  fireEvent.click(screen.getByTestId("template-details-use"));
  await waitFor(() => expect(api.useTemplate).toHaveBeenCalledWith("off-1", { targetAccountId: ACCOUNT }));
  expect(mockPush).toHaveBeenCalledWith("/workflows/wf-x?created=1");
});

it("clicking a card title opens the details dialog", () => {
  renderDash();
  const card = screen.getByText("Lead capture to CRM").closest("[data-testid='template-card']")!;
  fireEvent.click(within(card as HTMLElement).getByTestId("template-title"));
  expect(screen.getByTestId("template-details-dialog")).toBeInTheDocument();
  // closing returns to the grid.
  fireEvent.click(screen.getByTestId("template-details-close"));
  expect(screen.queryByTestId("template-details-dialog")).toBeNull();
});

it("an official template with empty configs renders its card without leaking config/JSON", () => {
  const emptyConfigOfficial: MarketplaceTemplateSummary = {
    ...official,
    id: "off-empty",
    name: "Quick note to Notion",
    card: {
      nodeCount: 2, stepCount: 1, triggerKind: "manual", providers: ["notion"], category: "files-docs",
      steps: [
        { kind: "trigger", provider: "native", type: "manual.run" },
        { kind: "action", provider: "notion", type: "create_page" },
      ],
    },
  };
  const { container } = render(
    <TemplatesDashboard accountId={ACCOUNT} initialMarketplace={[emptyConfigOfficial]} initialMine={[]} />,
  );
  const card = screen.getByText("Quick note to Notion").closest("[data-testid='template-card']")!;
  expect(within(card as HTMLElement).getByTestId("template-preview")).toHaveTextContent(/Notion: Create page/);
  // nothing resembling raw config / a JSON blob is rendered.
  expect(container.innerHTML).not.toContain('"config"');
  expect(container.innerHTML).not.toContain("manual.run"); // raw type id never shown (humanized only)
});

// ── CS-XT-MARKETPLACE-UX-SEARCH: search, combined filters, empty states, a11y ─────

it("search is case-insensitive and matches title + derived labels (app/category)", () => {
  renderDash();
  // title, upper-cased
  fireEvent.change(screen.getByTestId("templates-search"), { target: { value: "  PAYMENT  " } });
  expect(screen.getByText("Failed payment recovery")).toBeInTheDocument();
  expect(screen.queryByText("Lead capture to CRM")).toBeNull();
  // derived app label (official card has Stripe)
  fireEvent.change(screen.getByTestId("templates-search"), { target: { value: "stripe" } });
  expect(screen.getByText("Failed payment recovery")).toBeInTheDocument();
  expect(screen.queryByText("Lead capture to CRM")).toBeNull();
  // derived app label for the community one (HubSpot)
  fireEvent.change(screen.getByTestId("templates-search"), { target: { value: "hubspot" } });
  expect(screen.getByText("Lead capture to CRM")).toBeInTheDocument();
  expect(screen.queryByText("Failed payment recovery")).toBeNull();
});

it("search AND category combine; a contradiction shows the no-match empty state + reset", () => {
  renderDash();
  fireEvent.click(screen.getByTestId("templates-category-ecommerce")); // official only
  fireEvent.change(screen.getByTestId("templates-search"), { target: { value: "hubspot" } }); // community-only term
  const empty = screen.getByTestId("templates-empty");
  expect(empty).toHaveAttribute("data-empty-kind", "no-match");
  expect(empty).toHaveTextContent(/No templates match your filters/i);
  // copy must not imply templates / connections are missing
  expect(empty).not.toHaveTextContent(/connect|missing|no apps|install/i);
  // the empty-state reset restores everything.
  fireEvent.click(screen.getByTestId("templates-empty-reset"));
  expect(screen.getByText("Failed payment recovery")).toBeInTheDocument();
  expect(screen.getByText("Lead capture to CRM")).toBeInTheDocument();
});

it("Clear filters control appears when active and restores the full list", () => {
  renderDash();
  expect(screen.queryByTestId("templates-clear-filters")).toBeNull();
  fireEvent.change(screen.getByTestId("templates-search"), { target: { value: "payment" } });
  expect(screen.getByTestId("templates-clear-filters")).toBeInTheDocument();
  fireEvent.click(screen.getByTestId("templates-clear-filters"));
  expect(screen.getByText("Failed payment recovery")).toBeInTheDocument();
  expect(screen.getByText("Lead capture to CRM")).toBeInTheDocument();
  expect(screen.queryByTestId("templates-clear-filters")).toBeNull();
});

it("distinguishes empty states: none-exist (marketplace) vs none-mine vs no-match", () => {
  // none-marketplace: a community tab with no community templates.
  const { unmount } = render(
    <TemplatesDashboard accountId={ACCOUNT} initialMarketplace={[official]} initialMine={[]} />,
  );
  fireEvent.click(screen.getByTestId("templates-tab-community"));
  expect(screen.getByTestId("templates-empty")).toHaveAttribute("data-empty-kind", "none-marketplace");
  expect(screen.queryByTestId("templates-empty-reset")).toBeNull(); // not a filter problem → no reset
  unmount();

  // none-mine: the "Your templates" tab with no saved templates.
  render(<TemplatesDashboard accountId={ACCOUNT} initialMarketplace={[official]} initialMine={[]} />);
  fireEvent.click(screen.getByTestId("templates-tab-mine"));
  expect(screen.getByTestId("templates-empty")).toHaveAttribute("data-empty-kind", "none-mine");
});

it("sort control is marketplace-only and labeled; search input + provider filter are labeled", () => {
  renderDash();
  expect(screen.getByTestId("templates-search")).toHaveAttribute("aria-label", "Search templates");
  expect(screen.getByTestId("templates-sort")).toHaveAttribute("aria-label", "Sort templates");
  expect(screen.getByTestId("templates-provider-filter")).toHaveAttribute("aria-label", "Filter by app");
  // hidden on "Your templates" (step-based sort + app filter don't apply there).
  fireEvent.click(screen.getByTestId("templates-tab-mine"));
  expect(screen.queryByTestId("templates-sort")).toBeNull();
  expect(screen.queryByTestId("templates-provider-filter")).toBeNull();
});

it("detail + Use still work after filtering", async () => {
  api.useTemplate.mockResolvedValue({ workflowId: "wf-z", name: "T" });
  renderDash();
  fireEvent.change(screen.getByTestId("templates-search"), { target: { value: "payment" } });
  const card = screen.getByText("Failed payment recovery").closest("[data-testid='template-card']")!;
  fireEvent.click(within(card as HTMLElement).getByTestId("template-details"));
  fireEvent.click(screen.getByTestId("template-details-use"));
  await waitFor(() => expect(api.useTemplate).toHaveBeenCalledWith("off-1", { targetAccountId: ACCOUNT }));
  expect(mockPush).toHaveBeenCalledWith("/workflows/wf-z?created=1");
});
