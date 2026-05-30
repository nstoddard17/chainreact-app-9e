/**
 * @jest-environment node
 *
 * Tests for the Gmail createLabel action handler.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockUsersLabelsCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {
    constructor(message?: string) {
      super(message);
      this.name = "Unauthorized401Error";
    }
  },
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/gmail/api/usersLabelsCreate", () => ({
  usersLabelsCreate: (...args: unknown[]) => mockUsersLabelsCreate(...args),
}));

import { createLabel } from "@/integrations/gmail/actions/createLabel";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUsersLabelsCreate.mockReset();
});

function makeGmailTriggerEvent(providerAccountId: string): TriggerEvent {
  return {
    provider: "gmail",
    eventType: "new_email",
    eventId: "evt-1",
    occurredAt: "2026-05-12T12:00:00Z",
    providerAccountId,
    payload: {},
  };
}

function baseHandlerInput(overrides: {
  config?: Record<string, unknown>;
} = {}) {
  return {
    workflowId: "wf-1",
    userId: "user-1",
    accountId: "acct-user-1",
    runId: "run-1",
    nodeId: "node-create-label",
    config: overrides.config ?? { name: "Imports" },
    triggerEvent: makeGmailTriggerEvent("me@example.com"),
  };
}

function wireRefreshAndRetry() {
  mockRefreshAndRetry.mockImplementation(
    async (input: { apiCall: (t: string) => Promise<unknown> }) => {
      return await input.apiCall("token");
    },
  );
}

describe("createLabel — refreshAndRetry routing", () => {
  it("calls refreshAndRetry with userId / provider 'gmail' / accountId from Gmail trigger", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      id: "Label_1",
      name: "Imports",
    });

    await createLabel(baseHandlerInput());

    const call = mockRefreshAndRetry.mock.calls[0]![0];
    expect(call.userId).toBe("user-1");
    expect(call.provider).toBe("gmail");
    expect(call.accountId).toBe("me@example.com");
  });
});

describe("createLabel — apiCall forwards fields", () => {
  beforeEach(() => {
    wireRefreshAndRetry();
    mockUsersLabelsCreate.mockResolvedValue({
      id: "Label_1",
      name: "Imports",
      type: "user",
    });
  });

  it("forwards only name when no optional fields supplied (no V2-side default substitution)", async () => {
    await createLabel(baseHandlerInput({ config: { name: "Imports" } }));

    const args = mockUsersLabelsCreate.mock.calls[0]![0];
    expect(args.name).toBe("Imports");
    // Critical: undefined means the wrapper omits these from the body
    // — Gmail's server-side default applies, V2 does NOT supply one.
    expect(args.labelListVisibility).toBeUndefined();
    expect(args.messageListVisibility).toBeUndefined();
    expect(args.color).toBeUndefined();
  });

  it("forwards labelListVisibility when explicitly provided", async () => {
    await createLabel(
      baseHandlerInput({
        config: { name: "X", labelListVisibility: "labelHide" },
      }),
    );

    const args = mockUsersLabelsCreate.mock.calls[0]![0];
    expect(args.labelListVisibility).toBe("labelHide");
  });

  it("forwards messageListVisibility when explicitly provided", async () => {
    await createLabel(
      baseHandlerInput({
        config: { name: "X", messageListVisibility: "hide" },
      }),
    );

    const args = mockUsersLabelsCreate.mock.calls[0]![0];
    expect(args.messageListVisibility).toBe("hide");
  });

  it("forwards color object when provided", async () => {
    await createLabel(
      baseHandlerInput({
        config: {
          name: "X",
          color: {
            backgroundColor: "#16a766",
            textColor: "#ffffff",
          },
        },
      }),
    );

    const args = mockUsersLabelsCreate.mock.calls[0]![0];
    expect(args.color).toEqual({
      backgroundColor: "#16a766",
      textColor: "#ffffff",
    });
  });
});

describe("createLabel — output shape", () => {
  it("returns canonical label fields renamed { labelId, name, type, ...visibility, color }", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      id: "Label_88",
      name: "Imports",
      type: "user",
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
      color: { backgroundColor: "#16a766", textColor: "#ffffff" },
    });

    const result = await createLabel(baseHandlerInput());

    expect(result).toEqual({
      output: {
        labelId: "Label_88",
        name: "Imports",
        type: "user",
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
        color: { backgroundColor: "#16a766", textColor: "#ffffff" },
      },
    });
  });

  it("preserves undefined optional fields in the output (Gmail did not return them)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      id: "Label_99",
      name: "Imports",
      type: "user",
      // labelListVisibility / messageListVisibility / color absent
    });

    const result = await createLabel(baseHandlerInput());

    expect(result.output.labelId).toBe("Label_99");
    expect(result.output.name).toBe("Imports");
    expect(result.output.labelListVisibility).toBeUndefined();
    expect(result.output.messageListVisibility).toBeUndefined();
    expect(result.output.color).toBeUndefined();
  });
});

describe("createLabel — error propagation", () => {
  it("throws ZodError when name is missing", async () => {
    await expect(
      createLabel(baseHandlerInput({ config: {} })),
    ).rejects.toThrow();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws ZodError when color object is missing one of its required pair", async () => {
    await expect(
      createLabel(
        baseHandlerInput({
          config: {
            name: "X",
            color: { backgroundColor: "#16a766" },
          },
        }),
      ),
    ).rejects.toThrow();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("propagates errors from refreshAndRetry untouched (e.g. 409 already exists)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error("Gmail labels.create failed: Label name exists."),
    );
    await expect(createLabel(baseHandlerInput())).rejects.toThrow(
      /Label name exists/,
    );
  });
});
