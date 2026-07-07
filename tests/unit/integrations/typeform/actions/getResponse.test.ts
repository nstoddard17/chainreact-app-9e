/**
 * @jest-environment node
 *
 * TYPEFORM-2 — `typeform:get_response` handler + schema.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockResponsesList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
  InsufficientScopeError: class extends Error {},
}));

jest.mock("@/integrations/_shared/typeform/api/responses", () => ({
  responsesList: (...args: unknown[]) => mockResponsesList(...args),
}));

import { getResponse } from "@/integrations/typeform/actions/getResponse";
import { GetResponseConfigSchema } from "@/integrations/typeform/actions/getResponse.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockResponsesList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(overrides: Partial<TriggerEvent> = {}): TriggerEvent {
  return {
    provider: "typeform",
    eventType: "new_response_in_form",
    eventId: "evt-1",
    occurredAt: "2026-07-06T00:00:00Z",
    providerAccountId: "marcus@example.test",
    payload: {},
    ...overrides,
  };
}

function baseInput(config: Record<string, unknown>) {
  return {
    workflowId: "wf",
    userId: "u",
    accountId: "acct-u",
    runId: "r",
    nodeId: "n",
    config,
    triggerEvent: trigger(),
  };
}

const matchingItem = {
  token: "resp-9",
  submitted_at: "2026-07-05T10:00:00Z",
  landed_at: "2026-07-05T09:58:00Z",
  hidden: { plan: "pro" },
  calculated: { score: 3 },
  answers: [
    {
      type: "choice",
      field: { id: "f1", ref: "ref1", type: "multiple_choice" },
      choice: { label: "Blue" },
    },
  ],
};

describe("get_response schema", () => {
  it("requires formId and responseToken", () => {
    expect(() => GetResponseConfigSchema.parse({})).toThrow();
    expect(() => GetResponseConfigSchema.parse({ formId: "f" })).toThrow();
    expect(() =>
      GetResponseConfigSchema.parse({ formId: "f", responseToken: "" }),
    ).toThrow();
    expect(() =>
      GetResponseConfigSchema.parse({ formId: "f", responseToken: "resp-9" }),
    ).not.toThrow();
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      GetResponseConfigSchema.parse({
        formId: "f",
        responseToken: "t",
        bogus: 1,
      }),
    ).toThrow();
  });
});

describe("get_response handler", () => {
  it("looks up via included_response_ids with page_size 1", async () => {
    mockResponsesList.mockResolvedValueOnce({ items: [matchingItem], totalItems: 1 });
    await getResponse(baseInput({ formId: "form-1", responseToken: "resp-9" }));
    expect(mockResponsesList.mock.calls[0]![0]).toMatchObject({
      formId: "form-1",
      pageSize: 1,
      includedResponseIds: "resp-9",
    });
  });

  it("returns the bounded found:true shape on a match", async () => {
    mockResponsesList.mockResolvedValueOnce({ items: [matchingItem], totalItems: 1 });
    const result = await getResponse(
      baseInput({ formId: "form-1", responseToken: "resp-9" }),
    );
    expect(result.output).toEqual({
      found: true,
      responseToken: "resp-9",
      submittedAt: "2026-07-05T10:00:00Z",
      landedAt: "2026-07-05T09:58:00Z",
      answers: [
        {
          fieldId: "f1",
          fieldRef: "ref1",
          fieldType: "multiple_choice",
          answerType: "choice",
          value: "Blue",
        },
      ],
      hidden: { plan: "pro" },
      score: 3,
    });
    expect(result.output).not.toHaveProperty("metadata");
  });

  it("friendly not-found: empty filter result -> found:false, null fields, no throw", async () => {
    mockResponsesList.mockResolvedValueOnce({ items: [], totalItems: 0 });
    const result = await getResponse(
      baseInput({ formId: "form-1", responseToken: "resp-missing" }),
    );
    expect(result.output).toEqual({
      found: false,
      responseToken: null,
      submittedAt: null,
      landedAt: null,
      answers: null,
      hidden: null,
      score: null,
    });
  });

  it("defensive: an item whose token does NOT match is treated as not found", async () => {
    mockResponsesList.mockResolvedValueOnce({
      items: [{ ...matchingItem, token: "some-other-token" }],
      totalItems: 1,
    });
    const result = await getResponse(
      baseInput({ formId: "form-1", responseToken: "resp-9" }),
    );
    expect(result.output).toMatchObject({ found: false, responseToken: null });
  });

  it("uses refreshAndRetry with provider='typeform'", async () => {
    mockResponsesList.mockResolvedValueOnce({ items: [matchingItem], totalItems: 1 });
    await getResponse(baseInput({ formId: "form-1", responseToken: "resp-9" }));
    const call = mockRefreshAndRetry.mock.calls[0]![0];
    expect(call.provider).toBe("typeform");
    expect(call.accountId).toBe("acct-u");
  });

  it("propagates FORM-level provider failures verbatim (bad formId is a config error, not found:false)", async () => {
    mockResponsesList.mockRejectedValueOnce(
      new Error("Typeform resource not found: form nope"),
    );
    await expect(
      getResponse(baseInput({ formId: "nope", responseToken: "resp-9" })),
    ).rejects.toThrow(/form nope/);
  });

  it("never leaks the access token into the output", async () => {
    mockResponsesList.mockResolvedValueOnce({ items: [matchingItem], totalItems: 1 });
    const result = await getResponse(
      baseInput({ formId: "form-1", responseToken: "resp-9" }),
    );
    expect(JSON.stringify(result.output)).not.toContain('"tok"');
  });
});
