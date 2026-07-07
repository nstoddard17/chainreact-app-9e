/**
 * CONNECTION-AWARE-READINESS-1 — pure mapping from the server-resolved
 * connection signal (AgentConnectionSignal) to the readiness banner's
 * per-node connection input. Loading / error / absent data must NEVER
 * map to "connected"; native nodes short-circuit to not-required.
 */
import type { AgentConnectionSignal } from "@/core/workflows/agentReadiness";
import { connectionInputForProvider } from "@/features/workflow-builder/config-modal/readiness/connectionInput";

function resolved(
  providers: ReadonlyArray<{
    provider: string;
    name: string | null;
    state: "connected" | "missing" | "invalid";
    reasonCode?: string;
  }>,
): AgentConnectionSignal {
  return {
    state: "resolved",
    providers: providers.map((p) => ({
      provider: p.provider,
      name: p.name,
      nodeIds: ["n1"],
      canReconnect: true,
      state: p.state,
      ...(p.reasonCode !== undefined && { reasonCode: p.reasonCode }),
    })),
    allConnected: providers.every((p) => p.state === "connected"),
  };
}

const base = { requiresConnection: true, provider: "slack" } as const;

describe("connectionInputForProvider", () => {
  it("native / connectionless nodes are not-required regardless of the signal", () => {
    expect(
      connectionInputForProvider({
        requiresConnection: false,
        provider: "native",
        signal: { state: "error" },
      }),
    ).toEqual({ status: "not-required", providerDisplayName: "native" });
  });

  it("loading maps to checking (never connected)", () => {
    expect(
      connectionInputForProvider({ ...base, signal: { state: "loading" } }).status,
    ).toBe("checking");
  });

  it("error and disabled map to unknown (never connected)", () => {
    expect(
      connectionInputForProvider({ ...base, signal: { state: "error" } }).status,
    ).toBe("unknown");
    expect(
      connectionInputForProvider({ ...base, signal: { state: "disabled" } }).status,
    ).toBe("unknown");
  });

  it("resolved entry: connected / missing map through with the manifest display name", () => {
    expect(
      connectionInputForProvider({
        ...base,
        signal: resolved([{ provider: "slack", name: "Slack", state: "connected" }]),
      }),
    ).toEqual({ status: "connected", providerDisplayName: "Slack" });
    expect(
      connectionInputForProvider({
        ...base,
        signal: resolved([{ provider: "slack", name: "Slack", state: "missing" }]),
      }),
    ).toEqual({ status: "missing", providerDisplayName: "Slack" });
  });

  it("invalid entries with re-authorizable reasons map to reconnect-required; others to attention", () => {
    for (const reasonCode of [
      "needs_reconnect",
      "token_expired",
      "missing_scopes",
      "disconnected",
    ]) {
      expect(
        connectionInputForProvider({
          ...base,
          signal: resolved([
            { provider: "slack", name: "Slack", state: "invalid", reasonCode },
          ]),
        }).status,
      ).toBe("reconnect-required");
    }
    expect(
      connectionInputForProvider({
        ...base,
        signal: resolved([
          {
            provider: "slack",
            name: "Slack",
            state: "invalid",
            reasonCode: "provider_disabled",
          },
        ]),
      }).status,
    ).toBe("attention");
    expect(
      connectionInputForProvider({
        ...base,
        signal: resolved([{ provider: "slack", name: "Slack", state: "invalid" }]),
      }).status,
    ).toBe("attention");
  });

  it("a resolved signal that does not report on the provider maps to unknown, never a guess", () => {
    expect(
      connectionInputForProvider({
        ...base,
        signal: resolved([{ provider: "gmail", name: "Gmail", state: "connected" }]),
      }).status,
    ).toBe("unknown");
  });

  it("falls back to the provider id (or supplied fallback) when the signal has no name", () => {
    expect(
      connectionInputForProvider({
        ...base,
        signal: resolved([{ provider: "slack", name: null, state: "missing" }]),
      }).providerDisplayName,
    ).toBe("slack");
    expect(
      connectionInputForProvider({
        ...base,
        fallbackDisplayName: "Slack",
        signal: resolved([{ provider: "slack", name: null, state: "missing" }]),
      }).providerDisplayName,
    ).toBe("Slack");
  });
});
