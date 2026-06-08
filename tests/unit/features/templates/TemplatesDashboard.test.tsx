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
};
const community: MarketplaceTemplateSummary = {
  id: "com-1", name: "Lead capture to CRM", description: "Route Typeform leads.",
  source: "user", isOfficial: false, visibility: "public", creatorDisplayName: "Priya Kapoor",
  usageCount: 4300, forkCount: 30, forkedFromTemplateId: null, publishedAt: "2026-06-02T00:00:00Z", schemaVersion: 1, createdAt: "2026-06-02T00:00:00Z",
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
      currentUserId={ME}
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
  expect(mockPush).toHaveBeenCalledWith("/workflows/wf-new");
});

it("Fork calls the API, refetches own templates, and switches to the mine tab", async () => {
  api.forkTemplate.mockResolvedValue({ template: { id: "tpl-fork" } });
  api.listAccountTemplates.mockResolvedValue([
    { id: "tpl-fork", name: "Lead capture to CRM", description: null, source: "user", visibility: "private", createdByUserId: ME, forkedFromTemplateId: "com-1", usageCount: 0, forkCount: 0, publishedAt: null, unpublishedAt: null, schemaVersion: 1, createdAt: "x", updatedAt: "x" },
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
