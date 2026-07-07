/**
 * @jest-environment node
 *
 * TYPEFORM-2 — `typeform:list_responses` handler + schema.
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

import { listResponses } from "@/integrations/typeform/actions/listResponses";
import { ListResponsesConfigSchema } from "@/integrations/typeform/actions/listResponses.schema";

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
    eventType: "manual",
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

const twoItemPage = {
  items: [
    {
      token: "resp-1",
      submitted_at: "2026-07-05T10:00:00Z",
      landed_at: "2026-07-05T09:59:00Z",
      hidden: { source: "newsletter" },
      calculated: { score: 7 },
      answers: [
        { type: "text", field: { id: "f1", ref: "ref1", type: "short_text" }, text: "Ada" },
        { type: "email", field: { id: "f2", ref: "ref2", type: "email" }, email: "ada@example.test" },
      ],
    },
    {
      token: "resp-2",
      submitted_at: "2026-07-04T10:00:00Z",
      landed_at: null,
      hidden: null,
      calculated: null,
      answers: null,
    },
  ],
  totalItems: 42,
};

describe("list_responses schema", () => {
  it("requires formId", () => {
    expect(() => ListResponsesConfigSchema.parse({})).toThrow();
    expect(() =>
      ListResponsesConfigSchema.parse({ formId: "form-1" }),
    ).not.toThrow();
  });

  it("bounds pageSize to 1..100 integers", () => {
    expect(() =>
      ListResponsesConfigSchema.parse({ formId: "f", pageSize: 0 }),
    ).toThrow();
    expect(() =>
      ListResponsesConfigSchema.parse({ formId: "f", pageSize: 101 }),
    ).toThrow();
    expect(() =>
      ListResponsesConfigSchema.parse({ formId: "f", pageSize: 2.5 }),
    ).toThrow();
    expect(() =>
      ListResponsesConfigSchema.parse({ formId: "f", pageSize: 100 }),
    ).not.toThrow();
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      ListResponsesConfigSchema.parse({ formId: "f", bogus: 1 }),
    ).toThrow();
  });
});

describe("list_responses handler", () => {
  it("defaults to pageSize 25, first page, no filters", async () => {
    mockResponsesList.mockResolvedValueOnce(twoItemPage);
    await listResponses(baseInput({ formId: "form-1" }));
    const call = mockResponsesList.mock.calls[0]![0];
    expect(call.formId).toBe("form-1");
    expect(call.pageSize).toBe(25);
    expect(call.since).toBeUndefined();
    expect(call.until).toBeUndefined();
    expect(call.query).toBeUndefined();
    expect(call.before).toBeUndefined();
    expect(call.includedResponseIds).toBeUndefined();
  });

  it("threads pageSize + since/until/query/before; '' values mean not-sent", async () => {
    mockResponsesList.mockResolvedValueOnce(twoItemPage);
    await listResponses(
      baseInput({
        formId: "form-1",
        pageSize: 2,
        since: "2026-07-01T00:00:00Z",
        until: "2026-07-06T00:00:00Z",
        query: "ada",
        before: "resp-0",
      }),
    );
    expect(mockResponsesList.mock.calls[0]![0]).toMatchObject({
      pageSize: 2,
      since: "2026-07-01T00:00:00Z",
      until: "2026-07-06T00:00:00Z",
      query: "ada",
      before: "resp-0",
    });

    mockResponsesList.mockResolvedValueOnce(twoItemPage);
    await listResponses(
      baseInput({ formId: "form-1", since: "", until: "", query: "", before: "" }),
    );
    const second = mockResponsesList.mock.calls[1]![0];
    expect(second.since).toBeUndefined();
    expect(second.until).toBeUndefined();
    expect(second.query).toBeUndefined();
    expect(second.before).toBeUndefined();
  });

  it("returns the bounded per-response shape + pagination outputs", async () => {
    mockResponsesList.mockResolvedValueOnce(twoItemPage);
    const result = await listResponses(
      baseInput({ formId: "form-1", pageSize: 2 }),
    );
    expect(result.output).toEqual({
      responses: [
        {
          responseToken: "resp-1",
          submittedAt: "2026-07-05T10:00:00Z",
          landedAt: "2026-07-05T09:59:00Z",
          answers: [
            {
              fieldId: "f1",
              fieldRef: "ref1",
              fieldType: "short_text",
              answerType: "text",
              value: "Ada",
            },
            {
              fieldId: "f2",
              fieldRef: "ref2",
              fieldType: "email",
              answerType: "email",
              value: "ada@example.test",
            },
          ],
          hidden: { source: "newsletter" },
          score: 7,
        },
        {
          responseToken: "resp-2",
          submittedAt: "2026-07-04T10:00:00Z",
          landedAt: null,
          answers: [],
          hidden: null,
          score: null,
        },
      ],
      count: 2,
      totalItems: 42,
      hasMore: true,
      nextBefore: "resp-2",
    });
    // Bounded: raw-record fields never leak into response entries.
    const responses = result.output.responses as Array<Record<string, unknown>>;
    expect(responses[0]).not.toHaveProperty("metadata");
    expect(responses[0]).not.toHaveProperty("calculated");
    expect(responses[0]).not.toHaveProperty("token");
  });

  it("cursor: full page -> nextBefore = last token; short page -> null", async () => {
    // Full page (pageSize 2, 2 items) — asserted above via twoItemPage.
    mockResponsesList.mockResolvedValueOnce({
      items: twoItemPage.items.slice(0, 1),
      totalItems: 1,
    });
    const short = await listResponses(baseInput({ formId: "form-1", pageSize: 2 }));
    expect(short.output).toMatchObject({
      count: 1,
      hasMore: false,
      nextBefore: null,
    });

    mockResponsesList.mockResolvedValueOnce({ items: [], totalItems: 0 });
    const empty = await listResponses(baseInput({ formId: "form-1" }));
    expect(empty.output).toEqual({
      responses: [],
      count: 0,
      totalItems: 0,
      hasMore: false,
      nextBefore: null,
    });
  });

  it("uses refreshAndRetry with provider='typeform'", async () => {
    mockResponsesList.mockResolvedValueOnce(twoItemPage);
    await listResponses(baseInput({ formId: "form-1" }));
    const call = mockRefreshAndRetry.mock.calls[0]![0];
    expect(call.provider).toBe("typeform");
    expect(call.accountId).toBe("acct-u");
    expect(call.providerAccountId).toBe("marcus@example.test");
  });

  it("passes providerAccountId null when the trigger is not typeform", async () => {
    mockResponsesList.mockResolvedValueOnce(twoItemPage);
    await listResponses({
      ...baseInput({ formId: "form-1" }),
      triggerEvent: trigger({ provider: "native" }),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBeNull();
  });

  it("propagates provider failures verbatim (engine owns classification)", async () => {
    mockResponsesList.mockRejectedValueOnce(
      new Error("Typeform GET /forms/form-1/responses failed: boom"),
    );
    await expect(listResponses(baseInput({ formId: "form-1" }))).rejects.toThrow(
      /boom/,
    );
  });

  it("never leaks the access token into the output", async () => {
    mockResponsesList.mockResolvedValueOnce(twoItemPage);
    const result = await listResponses(baseInput({ formId: "form-1" }));
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
