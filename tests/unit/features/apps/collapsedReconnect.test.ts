/**
 * Tests for features/apps/collapsedReconnect — the pure derivation that decides
 * what the COLLAPSED app card surfaces for reconnect discoverability
 * (Slice 4.CS-APPS-RECOVERY-2). No rendering; pure branching only.
 */
import type { AppAccountSummary } from "@/contracts/apps";
import {
  deriveCollapsedReconnect,
  orderAccountsByReconnectNeed,
} from "@/features/apps/collapsedReconnect";

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

describe("orderAccountsByReconnectNeed (CS-APPS-RECOVERY-ROW-ORDER)", () => {
  const ids = (xs: readonly AppAccountSummary[]) => xs.map((a) => a.id);

  it("puts reconnect-needed rows before healthy rows", () => {
    const out = orderAccountsByReconnectNeed([
      acc({ id: "h1" }),
      acc({ id: "b1", needsReconnect: true }),
      acc({ id: "h2" }),
      acc({ id: "b2", needsReconnect: true }),
    ]);
    expect(ids(out)).toEqual(["b1", "b2", "h1", "h2"]);
  });

  it("is stable within the reconnect-needed group (preserves original relative order)", () => {
    const out = orderAccountsByReconnectNeed([
      acc({ id: "b1", needsReconnect: true }),
      acc({ id: "h1" }),
      acc({ id: "b2", needsReconnect: true }),
      acc({ id: "b3", needsReconnect: true }),
    ]);
    expect(ids(out).slice(0, 3)).toEqual(["b1", "b2", "b3"]);
  });

  it("is stable within the healthy group (preserves original relative order)", () => {
    const out = orderAccountsByReconnectNeed([
      acc({ id: "h1" }),
      acc({ id: "b1", needsReconnect: true }),
      acc({ id: "h2" }),
      acc({ id: "h3" }),
    ]);
    expect(ids(out).slice(1)).toEqual(["h1", "h2", "h3"]);
  });

  it("is a no-op for a healthy-only list (original order preserved)", () => {
    const out = orderAccountsByReconnectNeed([acc({ id: "h1" }), acc({ id: "h2" })]);
    expect(ids(out)).toEqual(["h1", "h2"]);
  });

  it("does not mutate the input array", () => {
    const input = [acc({ id: "h1" }), acc({ id: "b1", needsReconnect: true })];
    const snapshot = ids(input);
    orderAccountsByReconnectNeed(input);
    expect(ids(input)).toEqual(snapshot);
  });
});
