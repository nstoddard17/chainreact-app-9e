/**
 * 4.TEAM-WORKFLOWS-6 (TW-3b) — active-account mismatch banner.
 *
 * The banner is informational + non-blocking: it renders ONLY on a mismatch
 * and carries no interactive controls (no reload / redirect / discard).
 */
import { render, screen } from "@testing-library/react";
import {
  BuilderTeamProvider,
  type BuilderTeamContextValue,
} from "@/features/workflow-builder/context/builderTeamContext";
import { ActiveAccountMismatchBanner } from "@/features/workflow-builder/layout/ActiveAccountMismatchBanner";

const team = (overrides: Partial<BuilderTeamContextValue> = {}): BuilderTeamContextValue => ({
  isTeamWorkflow: true,
  isViewerCreator: false,
  creatorDisplayName: null,
  workflowAccountName: "Acme Team",
  activeAccountName: "Personal",
  accountMismatch: true,
  ...overrides,
});

function renderBanner(ctx: BuilderTeamContextValue | null): void {
  render(
    <BuilderTeamProvider value={ctx}>
      <ActiveAccountMismatchBanner />
    </BuilderTeamProvider>,
  );
}

describe("ActiveAccountMismatchBanner", () => {
  it("renders only when the workflow account and active account differ, naming both", () => {
    renderBanner(team({ workflowAccountName: "Acme Team", activeAccountName: "Personal" }));
    const banner = screen.getByTestId("active-account-mismatch-banner");
    expect(banner).toHaveTextContent(/editing a workflow in/i);
    expect(banner).toHaveTextContent(/Acme Team/);
    expect(banner).toHaveTextContent(/Personal/);
  });

  it("renders NOTHING when there is no account mismatch", () => {
    renderBanner(team({ accountMismatch: false }));
    expect(screen.queryByTestId("active-account-mismatch-banner")).toBeNull();
  });

  it("renders NOTHING outside a Team context", () => {
    renderBanner(null);
    expect(screen.queryByTestId("active-account-mismatch-banner")).toBeNull();
  });

  it("is non-blocking — no buttons, links, or interactive controls", () => {
    renderBanner(team());
    expect(screen.getByTestId("active-account-mismatch-banner")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
