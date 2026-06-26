/**
 * Tests for features/apps/collapsedReconnect — the pure derivation that decides
 * what the COLLAPSED app card surfaces for reconnect discoverability
 * (Slice 4.CS-APPS-RECOVERY-2). No rendering; pure branching only.
 */
import type { AppAccountSummary } from "@/contracts/apps";
import { deriveCollapsedReconnect } from "@/features/apps/collapsedReconnect";

function acc(over: Partial<AppAccountSummary> = {}): AppAccountSummary {
  return {
    id: "int-x",
    displayName: null,
    connectedAt: "2026-01-01T00:00:00Z",
    canDisconnect: false,
    canReconnect: false,
    sharingStatus: "not_applicable",
    sharedWithAccount: false,
    canShare: false,
    canUnshare: false,
    needsReconnect: false,
    ...over,
  };
}

describe("deriveCollapsedReconnect", () => {
  it("none when there are no accounts", () => {
    expect(deriveCollapsedReconnect([])).toEqual({ kind: "none" });
  });

  it("none when every account is healthy", () => {
    expect(
      deriveCollapsedReconnect([acc({ id: "a" }), acc({ id: "b", canReconnect: true })]),
    ).toEqual({ kind: "none" });
  });

  it("reconnect-one (with the flagged row's id) when exactly one reconnectable row needs reconnect", () => {
    const out = deriveCollapsedReconnect([
      acc({ id: "healthy", canReconnect: true }),
      acc({ id: "broken", needsReconnect: true, canReconnect: true }),
    ]);
    expect(out).toEqual({ kind: "reconnect-one", integrationId: "broken" });
  });

  it("none when the only row needing reconnect is NOT reconnectable (blocked)", () => {
    expect(
      deriveCollapsedReconnect([acc({ id: "broken", needsReconnect: true, canReconnect: false })]),
    ).toEqual({ kind: "none" });
  });

  it("review when two reconnectable rows need reconnect (never guess which to act on)", () => {
    expect(
      deriveCollapsedReconnect([
        acc({ id: "b1", needsReconnect: true, canReconnect: true }),
        acc({ id: "b2", needsReconnect: true, canReconnect: true }),
      ]),
    ).toEqual({ kind: "review" });
  });

  it("review when a reconnectable + a blocked row both need reconnect (mix → expand, surface both)", () => {
    expect(
      deriveCollapsedReconnect([
        acc({ id: "b1", needsReconnect: true, canReconnect: true }),
        acc({ id: "b2", needsReconnect: true, canReconnect: false }),
      ]),
    ).toEqual({ kind: "review" });
  });
});
