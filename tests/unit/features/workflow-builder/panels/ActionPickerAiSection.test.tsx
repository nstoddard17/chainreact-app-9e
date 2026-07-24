/**
 * ChainReact AI section in the action picker (AI-PROVIDER-4 CS-4).
 *
 * The picker is presentational — the parent panel fetches and passes
 * `aiActions` — so these tests drive the prop directly and assert the
 * honest-visibility contract: no actions ⇒ no section at all (never an
 * empty heading, never a "coming soon" placeholder), never a Connect
 * affordance, and existing native/provider sections untouched.
 */
const mockListProviderActions = jest.fn();
jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listProviderActions: (p: string) => mockListProviderActions(p),
  DiscoveryApiError: class DiscoveryApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

import type { ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionPicker } from "@/features/workflow-builder/panels/ActionPicker";
import { __resetProviderActionsCacheForTests } from "@/features/workflow-builder/hooks/useProviderActions";
import type { ActionMeta } from "@/contracts/actionMeta";

const nativeMeta = {
  key: "native:http_request",
  provider: "native",
  type: "http_request",
  displayName: "HTTP Request",
  description: "Call any HTTP endpoint.",
  category: "http",
  requiresIntegration: false,
  fields: [],
  outputs: [],
} as unknown as ActionMeta;

const analyzeMeta = {
  key: "ai:analyze_document",
  provider: "ai",
  type: "analyze_document",
  displayName: "Analyze Document",
  description: "Read a document and return structured data.",
  category: "ai",
  requiresIntegration: false,
  fields: [],
  outputs: [],
} as unknown as ActionMeta;

const transformMeta = {
  ...analyzeMeta,
  key: "ai:transform_data",
  type: "transform_data",
  displayName: "Transform Data",
  description: "Reshape data into another format.",
} as unknown as ActionMeta;

function renderPicker(
  overrides: Partial<ComponentProps<typeof ActionPicker>> = {},
) {
  const onPickAction = jest.fn();
  render(
    <ActionPicker
      nativeActions={[nativeMeta]}
      nativeLoading={false}
      nativeError={null}
      actionProviders={[{ id: "slack", displayName: "Slack" }]}
      onPickAction={onPickAction}
      {...overrides}
    />,
  );
  return { onPickAction };
}

describe("ActionPicker — ChainReact AI section", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetProviderActionsCacheForTests();
    mockListProviderActions.mockResolvedValue([]);
  });

  it("renders a named AI section listing the AI actions", () => {
    renderPicker({ aiActions: [analyzeMeta, transformMeta] });
    const section = screen.getByRole("region", { name: "ChainReact AI actions" });
    expect(within(section).getByText("Analyze Document")).toBeInTheDocument();
    expect(within(section).getByText("Transform Data")).toBeInTheDocument();
  });

  it("renders NOTHING when there are no AI actions (no heading, no placeholder)", () => {
    renderPicker({ aiActions: [] });
    expect(
      screen.queryByRole("region", { name: "ChainReact AI actions" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/ChainReact AI/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it("renders nothing when the catalog prop is omitted entirely (disabled processor)", () => {
    renderPicker();
    expect(
      screen.queryByRole("region", { name: "ChainReact AI actions" }),
    ).not.toBeInTheDocument();
  });

  it("never shows a Connect / Reconnect affordance for the AI provider", () => {
    renderPicker({ aiActions: [analyzeMeta] });
    expect(screen.queryByRole("button", { name: /connect/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Browse ChainReact AI actions/i }),
    ).not.toBeInTheDocument();
  });

  it("picking an AI action fires onPickAction with that meta", async () => {
    const user = userEvent.setup();
    const { onPickAction } = renderPicker({ aiActions: [analyzeMeta] });
    await user.click(screen.getByText("Analyze Document"));
    expect(onPickAction).toHaveBeenCalledTimes(1);
    expect(onPickAction).toHaveBeenCalledWith(analyzeMeta);
  });

  it("search filters AI actions like every other section", () => {
    renderPicker({ aiActions: [analyzeMeta, transformMeta], searchQuery: "transform" });
    const section = screen.getByRole("region", { name: "ChainReact AI actions" });
    expect(within(section).getByText("Transform Data")).toBeInTheDocument();
    expect(within(section).queryByText("Analyze Document")).not.toBeInTheDocument();
  });

  it("hides the AI section when a search excludes every AI action", () => {
    renderPicker({ aiActions: [analyzeMeta], searchQuery: "zzz-no-match" });
    expect(
      screen.queryByRole("region", { name: "ChainReact AI actions" }),
    ).not.toBeInTheDocument();
  });

  it("leaves the existing native and provider sections intact", () => {
    renderPicker({ aiActions: [analyzeMeta] });
    expect(screen.getByRole("region", { name: "Native actions" })).toBeInTheDocument();
    expect(screen.getByText("HTTP Request")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Provider actions" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Browse Slack actions" }),
    ).toBeInTheDocument();
  });
});
