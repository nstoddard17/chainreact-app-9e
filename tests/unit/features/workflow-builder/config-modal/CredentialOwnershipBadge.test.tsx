/**
 * 4.TEAM-WORKFLOWS-6 (TW-3b) — per-node credential-ownership badge.
 *
 * Drives the REAL credentialSharingForProvider classifier (slack=account,
 * gmail=personal). The load-bearing assertion is no-leak: the badge names the
 * owner only, never a personal credential label / email.
 */
import { render, screen } from "@testing-library/react";
import {
  BuilderTeamProvider,
  type BuilderTeamContextValue,
} from "@/features/workflow-builder/context/builderTeamContext";
import { CredentialOwnershipBadge } from "@/features/workflow-builder/config-modal/CredentialOwnershipBadge";

const team = (overrides: Partial<BuilderTeamContextValue> = {}): BuilderTeamContextValue => ({
  isTeamWorkflow: true,
  isViewerCreator: false,
  creatorDisplayName: null,
  workflowAccountName: "Acme Team",
  activeAccountName: "Acme Team",
  accountMismatch: false,
  ...overrides,
});

function renderBadge(
  provider: string,
  ctx: BuilderTeamContextValue | null,
): void {
  render(
    <BuilderTeamProvider value={ctx}>
      <CredentialOwnershipBadge provider={provider} />
    </BuilderTeamProvider>,
  );
}

describe("CredentialOwnershipBadge", () => {
  it("renders 'Shared team connection' for an account/service provider on a Team workflow", () => {
    renderBadge("slack", team());
    expect(screen.getByTestId("credential-badge-shared")).toHaveTextContent(
      /Shared team connection/i,
    );
  });

  it("renders the owner-connection badge for a personal provider, naming the creator (no email/label)", () => {
    renderBadge("gmail", team({ creatorDisplayName: "Alice Carter" }));
    const badge = screen.getByTestId("credential-badge-owner");
    expect(badge).toHaveTextContent(/Runs under Alice Carter's connection/i);
    // No personal credential label / email is ever shown.
    expect(badge.textContent).not.toMatch(/@/);
  });

  it("falls back to a generic owner label when the creator display name is unknown", () => {
    renderBadge("gmail", team({ creatorDisplayName: null }));
    expect(screen.getByTestId("credential-badge-owner")).toHaveTextContent(
      /Runs under the workflow owner's connection/i,
    );
  });

  it("says 'your connection' when the viewer is the creator", () => {
    renderBadge("gmail", team({ isViewerCreator: true, creatorDisplayName: "Me" }));
    expect(screen.getByTestId("credential-badge-owner")).toHaveTextContent(
      /Runs under your connection/i,
    );
  });

  it("renders NOTHING for a personal-account workflow (not a team)", () => {
    renderBadge("gmail", team({ isTeamWorkflow: false }));
    expect(screen.queryByTestId("credential-badge-owner")).toBeNull();
    expect(screen.queryByTestId("credential-badge-shared")).toBeNull();
  });

  it("renders NOTHING outside a Team context", () => {
    renderBadge("slack", null);
    expect(screen.queryByTestId("credential-badge-shared")).toBeNull();
  });

  it("renders NOTHING when the provider is empty", () => {
    renderBadge("", team());
    expect(screen.queryByTestId("credential-badge-shared")).toBeNull();
    expect(screen.queryByTestId("credential-badge-owner")).toBeNull();
  });
});
