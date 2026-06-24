/**
 * REACT-LIVE-SKELETON-2 — the local-only React Agent rail's FREE deterministic skeleton.
 *
 * Proves: a carried-over prompt auto-previews on the canvas via the no-auth endpoint (no paid AI);
 * an unsupported prompt keeps the user in the builder with a sign-up CTA + any catalog-gap message;
 * editing + Preview re-infers; "Copy prompt" copies only the safe prompt string.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSkeleton = jest.fn();
jest.mock("@/lib/api/ai/anonSkeleton", () => ({
  requestAnonSkeleton: (...a: unknown[]) => mockSkeleton(...a),
}));

import { AnonymousAgentRail } from "@/features/workflow-builder/panels/AnonymousAgentRail";

const PLAN = { schemaVersion: 1, title: "Manual → Slack", summary: "", notApplied: true, steps: [{ ref: "s0", role: "trigger", provider: "native", type: "manual.run", purpose: "" }] };
const PREVIEW = { version: 1, title: "Manual → Slack", summary: "", notice: "Preview only — your workflow has not changed.", notApplied: true as const, nodes: [], edges: [] };

beforeEach(() => {
  mockSkeleton.mockReset().mockResolvedValue(null);
});

describe("AnonymousAgentRail — free deterministic skeleton", () => {
  it("auto-previews the carried-over prompt on the canvas (deterministic, no paid AI)", async () => {
    mockSkeleton.mockResolvedValue({ plan: PLAN, preview: PREVIEW });
    const onShowPreview = jest.fn();
    render(<AnonymousAgentRail prompt="when I run this manually, send a slack message" onShowPreview={onShowPreview} />);
    await waitFor(() => expect(onShowPreview).toHaveBeenCalledTimes(1));
    expect(onShowPreview.mock.calls[0]![0]).toMatchObject({ plan: { title: "Manual → Slack" }, preview: { title: "Manual → Slack" } });
    // It used ONLY the free deterministic endpoint helper.
    expect(mockSkeleton).toHaveBeenCalledWith({ goalText: "when I run this manually, send a slack message" });
    expect(await screen.findByTestId("anonymous-agent-rail-ready")).toBeInTheDocument();
  });

  it("shows a sign-up CTA (and any catalog gap) when no deterministic shape is inferable", async () => {
    mockSkeleton.mockResolvedValue({ plan: null, preview: null, warnings: ["Mailchimp has no send-campaign action yet."] });
    const onShowPreview = jest.fn();
    render(<AnonymousAgentRail prompt="send a mailchimp win-back email campaign" onShowPreview={onShowPreview} />);
    expect(await screen.findByTestId("anonymous-agent-rail-no-shape")).toBeInTheDocument();
    expect(screen.getByTestId("anonymous-agent-rail-warnings")).toHaveTextContent(/send-campaign/i);
    expect(screen.getByText(/Create an account to use React Agent/i)).toBeInTheDocument();
    expect(onShowPreview).not.toHaveBeenCalled();
    // Stays in the builder — the sign-up CTA is a link, not a forced redirect.
    expect(screen.getByTestId("anonymous-agent-rail-signup")).toHaveAttribute(
      "href",
      "/auth/sign-up?returnTo=%2Fstart%2Fcontinue&reason=ai",
    );
  });

  it("editing the idea + Preview re-infers and supersedes (latest wins)", async () => {
    const user = userEvent.setup();
    mockSkeleton.mockResolvedValue({ plan: PLAN, preview: PREVIEW });
    const onShowPreview = jest.fn();
    render(<AnonymousAgentRail onShowPreview={onShowPreview} />);
    // No prompt → no auto-infer yet.
    expect(onShowPreview).not.toHaveBeenCalled();
    await user.type(screen.getByTestId("anonymous-agent-rail-prompt"), "manual run then send a slack message");
    await user.click(screen.getByTestId("anonymous-agent-rail-preview"));
    await waitFor(() => expect(onShowPreview).toHaveBeenCalledTimes(1));
  });

  it("reports composer edits via onPromptChange (so the anon draft persists)", async () => {
    const user = userEvent.setup();
    const onPromptChange = jest.fn();
    render(<AnonymousAgentRail onPromptChange={onPromptChange} />);
    await user.type(screen.getByTestId("anonymous-agent-rail-prompt"), "abc");
    expect(onPromptChange).toHaveBeenLastCalledWith("abc");
  });

  it("copies only the safe prompt string", async () => {
    const user = userEvent.setup();
    render(<AnonymousAgentRail prompt="   Notify #wins on a 5-star review   " />);
    await user.click(screen.getByTestId("anonymous-agent-rail-copy"));
    expect(await navigator.clipboard.readText()).toBe("Notify #wins on a 5-star review");
  });
});
