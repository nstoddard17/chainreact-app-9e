/**
 * ANON-BUILDER-3 Scope B — the local-only React Agent rail's "Copy prompt"
 * backup. Proves it copies ONLY the safe prompt string (no skeleton JSON, no
 * secrets) and shows feedback. The AI CTA stays a contextual sign-up link.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnonymousAgentRail } from "@/features/workflow-builder/panels/AnonymousAgentRail";

describe("AnonymousAgentRail — copy prompt", () => {
  it("copies exactly the (trimmed) prompt string and shows 'Copied'", async () => {
    // userEvent.setup() installs a working clipboard stub on navigator.
    const user = userEvent.setup();
    render(<AnonymousAgentRail prompt="   Notify #wins on a 5-star review   " />);
    await user.click(screen.getByTestId("anonymous-agent-rail-copy"));
    // ONLY the safe prompt string is copied — no skeleton JSON, no secrets.
    expect(await navigator.clipboard.readText()).toBe("Notify #wins on a 5-star review");
    await waitFor(() =>
      expect(screen.getByTestId("anonymous-agent-rail-copy")).toHaveTextContent("Copied"),
    );
  });

  it("hides the copy button when there is no prompt", () => {
    render(<AnonymousAgentRail />);
    expect(screen.queryByTestId("anonymous-agent-rail-copy")).toBeNull();
  });

  it("the AI CTA is a contextual sign-up link (no paid AI before auth)", () => {
    render(<AnonymousAgentRail prompt="x" />);
    expect(screen.getByTestId("anonymous-agent-rail-signup")).toHaveAttribute(
      "href",
      "/auth/sign-up?returnTo=%2Fstart%2Fcontinue&reason=ai",
    );
  });
});
