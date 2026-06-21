/**
 * @jest-environment node
 *
 * Safe gateway prompt builder — scope-guard wiring (HERMES-AGENT-MEMORY-SCOPE-GUARD).
 * Proves the prompt always carries the scope instruction, renders the safe context (account / shared
 * + own connections / private-connection notice) when provided, and never carries excluded fields.
 */
import { buildGatewayGuidancePrompt } from "@/services/ai-guidance/gateway/buildGatewayGuidancePrompt";
import { FOREIGN_PRIVATE_CONNECTION_NOTICE } from "@/services/ai-guidance/guidanceContextPolicy";
import type { WorkflowGuidanceRequest } from "@/contracts/aiGuidance";

const EMPTY_REQUEST: WorkflowGuidanceRequest = {
  schemaVersion: 1,
  guidanceKind: "workflow_design",
  workflow: { nodeCount: 0, edgeCount: 0, nodes: [], edges: [] },
};

describe("buildGatewayGuidancePrompt — scope instruction + safe context", () => {
  it("always includes the scope instruction (even with no context)", () => {
    const prompt = buildGatewayGuidancePrompt({ request: EMPTY_REQUEST, goalText: "help" });
    expect(prompt).toContain("Use only the context included in this request");
    expect(prompt).toContain("Do not infer or claim access to other team members");
  });

  it("renders account summary + shared/own connections + private-connection notice from context", () => {
    const prompt = buildGatewayGuidancePrompt({
      request: EMPTY_REQUEST,
      goalText: "help",
      context: {
        schemaVersion: 1,
        account: { type: "team", role: "member" },
        sharedCredentialProviders: ["slack", "notion"],
        ownConnectionProviders: ["gmail"],
        privateConnectionNotice: FOREIGN_PRIVATE_CONNECTION_NOTICE,
        scopesIncluded: ["account", "global", "user", "workflow"],
      },
    });
    expect(prompt).toContain("type=team");
    expect(prompt).toContain("your role=member");
    expect(prompt).toContain("Shared account connections available: slack, notion");
    expect(prompt).toContain("Your own connected accounts: gmail");
    expect(prompt).toContain(FOREIGN_PRIVATE_CONNECTION_NOTICE);
  });

  it("omits context lines when no context is passed", () => {
    const prompt = buildGatewayGuidancePrompt({ request: EMPTY_REQUEST, goalText: "help" });
    expect(prompt).not.toContain("Account context:");
    expect(prompt).not.toContain("Shared account connections");
  });

  it("never carries identity/secret markers", () => {
    const prompt = buildGatewayGuidancePrompt({
      request: EMPTY_REQUEST,
      goalText: "help",
      context: { schemaVersion: 1, account: { type: "team" }, scopesIncluded: ["account", "global"] },
    });
    for (const needle of ["user-", "access_token", "refresh_token", "owner_user_id", "Bearer "]) {
      expect(prompt).not.toContain(needle);
    }
  });
});
