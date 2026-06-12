/**
 * @jest-environment node
 *
 * Tests for core/integrations/workflowCredentialScope (Slice 4.WF-RUNPERM).
 * Pure predicates — the credential-scope source of truth for run/edit gating.
 */
import {
  workflowUsesPrivateCredential,
  viewerMayRunEdit,
  isPrivateCredentialProvider,
  NON_OAUTH_PROVIDERS,
} from "@/core/integrations/workflowCredentialScope";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";

function def(providers: Array<string | undefined>): WorkflowDefinition {
  return {
    nodes: providers.map((provider, i) => ({
      id: `n${i}`,
      kind: i === 0 ? ("trigger" as const) : ("action" as const),
      provider: (provider ?? "") as string,
      type: "x",
      config: {},
      position: { x: 0, y: i * 100 },
    })),
    edges: [],
  } as unknown as WorkflowDefinition;
}

describe("isPrivateCredentialProvider", () => {
  it("personal providers are private; account + native are not", () => {
    expect(isPrivateCredentialProvider("gmail")).toBe(true); // personal
    expect(isPrivateCredentialProvider("microsoft-outlook")).toBe(true);
    expect(isPrivateCredentialProvider("google-calendar")).toBe(true);
    expect(isPrivateCredentialProvider("slack")).toBe(false); // account
    expect(isPrivateCredentialProvider("stripe")).toBe(false);
    expect(isPrivateCredentialProvider("native")).toBe(false); // excluded
    expect(isPrivateCredentialProvider("")).toBe(false);
    expect(isPrivateCredentialProvider(undefined)).toBe(false);
  });
  it("unknown providers fail safe to private (personal default)", () => {
    expect(isPrivateCredentialProvider("brand-new-provider")).toBe(true);
  });
  it("native is in the exclusion set", () => {
    expect(NON_OAUTH_PROVIDERS.has("native")).toBe(true);
  });
});

describe("workflowUsesPrivateCredential", () => {
  it("true when any node uses a personal provider (mixed)", () => {
    expect(workflowUsesPrivateCredential(def(["native", "slack", "gmail"]))).toBe(true);
  });
  it("false for account-only", () => {
    expect(workflowUsesPrivateCredential(def(["native", "slack", "stripe"]))).toBe(false);
  });
  it("false for native-only (the gotcha — every workflow has a native trigger)", () => {
    expect(workflowUsesPrivateCredential(def(["native"]))).toBe(false);
    expect(workflowUsesPrivateCredential(def(["native", "native"]))).toBe(false);
  });
  it("true for a single personal node", () => {
    expect(workflowUsesPrivateCredential(def(["native", "gmail"]))).toBe(true);
  });
  it("false for an empty / providerless definition", () => {
    expect(workflowUsesPrivateCredential(def([]))).toBe(false);
    expect(workflowUsesPrivateCredential(def([undefined]))).toBe(false);
  });
  it("unknown provider counts as private (fail-safe)", () => {
    expect(workflowUsesPrivateCredential(def(["native", "totally-new"]))).toBe(true);
  });
});

describe("viewerMayRunEdit", () => {
  const privateDef = def(["native", "gmail"]);
  const sharedDef = def(["native", "slack"]);
  const nativeDef = def(["native"]);

  it("non-private workflow → any caller may run/edit", () => {
    expect(viewerMayRunEdit({ createdByUserId: "A", definition: sharedDef }, "B")).toBe(true);
    expect(viewerMayRunEdit({ createdByUserId: "A", definition: nativeDef }, "B")).toBe(true);
    expect(viewerMayRunEdit({ createdByUserId: null, definition: sharedDef }, "B")).toBe(true);
  });
  it("private workflow → only the creator", () => {
    expect(viewerMayRunEdit({ createdByUserId: "A", definition: privateDef }, "A")).toBe(true);
    expect(viewerMayRunEdit({ createdByUserId: "A", definition: privateDef }, "B")).toBe(false);
  });
  it("private workflow with null creator → nobody may run/edit", () => {
    expect(viewerMayRunEdit({ createdByUserId: null, definition: privateDef }, "A")).toBe(false);
  });
});
