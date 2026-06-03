/**
 * @jest-environment node
 *
 * Tests for the execution-scoped credential-resolution context
 * (Slice 4.ACCOUNT-MODEL-22B). Proves the AsyncLocalStorage round-trip the
 * engine relies on to thread the workflow creator into refreshAndRetry.
 */
import {
  runWithCredentialResolutionContext,
  getCredentialResolutionContext,
} from "@/services/oauth/credentialResolutionContext";

describe("credentialResolutionContext", () => {
  it("returns undefined outside any run scope", () => {
    expect(getCredentialResolutionContext()).toBeUndefined();
  });

  it("exposes the context inside run, incl. across awaits", async () => {
    await runWithCredentialResolutionContext({ createdByUserId: "user-A" }, async () => {
      expect(getCredentialResolutionContext()?.createdByUserId).toBe("user-A");
      await Promise.resolve();
      // Still present after an await within the same async tree.
      expect(getCredentialResolutionContext()?.createdByUserId).toBe("user-A");
    });
  });

  it("does not leak the context after the run settles", async () => {
    await runWithCredentialResolutionContext({ createdByUserId: "user-A" }, async () => {});
    expect(getCredentialResolutionContext()).toBeUndefined();
  });

  it("nested runs override, then restore the outer context", () => {
    runWithCredentialResolutionContext({ createdByUserId: "outer" }, () => {
      expect(getCredentialResolutionContext()?.createdByUserId).toBe("outer");
      runWithCredentialResolutionContext({ createdByUserId: "inner" }, () => {
        expect(getCredentialResolutionContext()?.createdByUserId).toBe("inner");
      });
      expect(getCredentialResolutionContext()?.createdByUserId).toBe("outer");
    });
  });
});
