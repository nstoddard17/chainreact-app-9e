/**
 * @jest-environment node
 *
 * Tests for the Typeform options resolver — Slice 5.TYPEFORM-1.
 * Mocks refreshAndRetry + the forms API wrapper; proves label mapping,
 * server-side search pass-through, sanitized error mapping, and the
 * no-integration denial.
 */
const mockRefreshAndRetry = jest.fn();
const mockFormsList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  class Unauthorized401Error extends Error {}
  class InsufficientScopeError extends Error {}
  class IntegrationActionRequiredError extends Error {}
  return {
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
    Unauthorized401Error,
    InsufficientScopeError,
    IntegrationActionRequiredError,
  };
});

jest.mock("@/integrations/_shared/typeform/api/forms", () => ({
  formsList: (...args: unknown[]) => mockFormsList(...args),
}));

import {
  IntegrationActionRequiredError,
  InsufficientScopeError,
} from "@/services/oauth/refreshAndRetry";
import { OptionsResolverError } from "@/services/options/types";
import { typeformFormsResolver } from "@/integrations/typeform/options/forms";

function ctx(overrides: Record<string, unknown> = {}) {
  return {
    integration: {
      id: "int-1",
      accountId: "acct-1",
      provider: "typeform",
      providerAccountId: "marcus@example.test",
    },
    deps: {},
    q: "",
    ...overrides,
  } as never;
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockFormsList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("typeform:forms resolver", () => {
  it("maps forms to value/label items, sorted by label, with hasMore", async () => {
    mockFormsList.mockResolvedValueOnce({
      items: [
        { id: "f-2", title: "Zeta survey" },
        { id: "f-1", title: "Alpha feedback" },
        { id: "f-3", title: "" }, // falls back to the id as label
        { id: "", title: "dropped (no id)" },
      ],
      hasMore: true,
    });
    const result = await typeformFormsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "f-1", label: "Alpha feedback" },
      { value: "f-3", label: "f-3" },
      { value: "f-2", label: "Zeta survey" },
    ]);
    expect(result.hasMore).toBe(true);
  });

  it("passes ctx.q as Typeform's server-side search AND filters locally", async () => {
    mockFormsList.mockResolvedValueOnce({
      items: [
        { id: "f-1", title: "Customer feedback" },
        { id: "f-2", title: "Internal quiz" },
      ],
      hasMore: false,
    });
    const result = await typeformFormsResolver.resolve(ctx({ q: "feedback" }));
    expect(mockFormsList.mock.calls[0]![0]).toMatchObject({
      search: "feedback",
      pageSize: 200,
    });
    expect(result.items).toEqual([
      { value: "f-1", label: "Customer feedback" },
    ]);
  });

  it("denies with INTEGRATION_DISCONNECTED when no integration is present", async () => {
    await expect(
      typeformFormsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockFormsList).not.toHaveBeenCalled();
  });

  it("maps dead-credential failures to INTEGRATION_DISCONNECTED (sanitized)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "typeform",
        providerAccountId: "secret-detail@example.test",
        reason: "refresh_failed",
      }),
    );
    const err = await typeformFormsResolver.resolve(ctx()).catch((e) => e);
    expect(err).toBeInstanceOf(OptionsResolverError);
    expect(err.code).toBe("INTEGRATION_DISCONNECTED");
    expect(err.message).not.toContain("secret-detail");
  });

  it("maps 403 to PROVIDER_REAUTH_REQUIRED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new InsufficientScopeError("403"),
    );
    const err = await typeformFormsResolver.resolve(ctx()).catch((e) => e);
    expect(err.code).toBe("PROVIDER_REAUTH_REQUIRED");
  });

  it("maps other provider failures to a static PROVIDER_ERROR", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Error("raw provider text"));
    const err = await typeformFormsResolver.resolve(ctx()).catch((e) => e);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toContain("raw provider text");
  });
});
