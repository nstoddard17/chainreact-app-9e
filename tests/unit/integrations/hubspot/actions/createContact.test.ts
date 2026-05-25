/**
 * @jest-environment node
 *
 * Tests for `create_contact` action handler. Load-bearing for V2's
 * V1-bug-fix: deterministic search-by-email + PATCH on 409, instead
 * of V1's brittle `/Existing ID: (\d+)/` regex extraction.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockContactsCreate = jest.fn();
const mockContactsUpdate = jest.fn();
const mockFindContactByEmail = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/hubspot/api/contacts", () => ({
  contactsCreate: (...a: unknown[]) => mockContactsCreate(...a),
  contactsUpdate: (...a: unknown[]) => mockContactsUpdate(...a),
  findContactByEmail: (...a: unknown[]) => mockFindContactByEmail(...a),
}));

// Re-import the real ConflictError so `err instanceof ConflictError` in
// the handler works against the same class our test throws.
import { ConflictError } from "@/integrations/_shared/hubspot/errors";

import { createContact } from "@/integrations/hubspot/actions/createContact";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockContactsCreate.mockReset();
  mockContactsUpdate.mockReset();
  mockFindContactByEmail.mockReset();
  // Default: refreshAndRetry just calls apiCall(token) with a fake
  // token. Tests that need to verify the wrapping behavior override.
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(
  provider = "hubspot",
  accountId = "9876543",
): TriggerEvent {
  return {
    provider,
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-10T12:00:00Z",
    accountId,
    payload: {},
  };
}

const baseCreated = {
  id: "contact-42",
  properties: { email: "alice@example.com", firstname: "Alice" },
  createdAt: "2026-05-10T12:00:00Z",
  updatedAt: "2026-05-10T12:00:00Z",
};

describe("create_contact — happy path", () => {
  it("calls contactsCreate with email + supplied optional fields", async () => {
    mockContactsCreate.mockResolvedValueOnce(baseCreated);
    await createContact({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        email: "alice@example.com",
        firstname: "Alice",
        lastname: "Anderson",
        company: "Acme",
      },
      triggerEvent: trigger(),
    });
    const apiArg = mockContactsCreate.mock.calls[0]![0]!;
    expect(apiArg.properties).toEqual({
      email: "alice@example.com",
      firstname: "Alice",
      lastname: "Anderson",
      company: "Acme",
    });
  });

  it("omits undefined optional fields (only includes the ones supplied)", async () => {
    mockContactsCreate.mockResolvedValueOnce(baseCreated);
    await createContact({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        email: "alice@example.com",
        firstname: "Alice",
        // lastname, phone, company etc. omitted.
      },
      triggerEvent: trigger(),
    });
    const apiArg = mockContactsCreate.mock.calls[0]![0]!;
    expect(apiArg.properties).toEqual({
      email: "alice@example.com",
      firstname: "Alice",
    });
    expect(apiArg.properties.lastname).toBeUndefined();
    expect(apiArg.properties.phone).toBeUndefined();
  });

  it("returns canonical output shape", async () => {
    mockContactsCreate.mockResolvedValueOnce(baseCreated);
    const result = await createContact({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { email: "alice@example.com" },
      triggerEvent: trigger(),
    });
    expect(result.output).toEqual({
      contactId: "contact-42",
      email: "alice@example.com",
      firstName: "Alice",
      lastName: null,
      createdAt: "2026-05-10T12:00:00Z",
      updatedAt: "2026-05-10T12:00:00Z",
      wasUpdate: false,
      wasSkip: false,
      properties: { email: "alice@example.com", firstname: "Alice" },
    });
  });

  it("wraps the create call in refreshAndRetry (proves 401 recovery is wired)", async () => {
    mockContactsCreate.mockResolvedValueOnce(baseCreated);
    await createContact({
      workflowId: "wf",
      userId: "u-1",
      runId: "r",
      nodeId: "n",
      config: { email: "a@b.com" },
      triggerEvent: trigger(),
    });
    expect(mockRefreshAndRetry).toHaveBeenCalled();
    const refreshArg = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(refreshArg.provider).toBe("hubspot");
    expect(refreshArg.userId).toBe("u-1");
  });

  it("threads hubspot triggerEvent.accountId into refreshAndRetry's accountId param", async () => {
    mockContactsCreate.mockResolvedValueOnce(baseCreated);
    await createContact({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { email: "a@b.com" },
      triggerEvent: trigger("hubspot", "portal-12345"),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0]!.accountId).toBe(
      "portal-12345",
    );
  });

  it("passes accountId: null for non-hubspot triggers (manual / cross-provider runs)", async () => {
    mockContactsCreate.mockResolvedValueOnce(baseCreated);
    await createContact({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { email: "a@b.com" },
      triggerEvent: trigger("slack", "T-anything"),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0]!.accountId).toBeNull();
  });
});

describe("create_contact — schema validation", () => {
  it("rejects missing email", async () => {
    await expect(
      createContact({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {},
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects invalid email format", async () => {
    await expect(
      createContact({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { email: "not-an-email" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects unknown fields (strict schema)", async () => {
    await expect(
      createContact({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { email: "a@b.com", unknownExtraField: "x" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});

describe("create_contact — duplicate handling (V2 fix for V1 regex bug)", () => {
  it("default `fail`: re-throws ConflictError on 409", async () => {
    const conflict = new ConflictError(
      "contact (create)",
      JSON.stringify({
        message: "Contact already exists",
        category: "OBJECT_ALREADY_EXISTS",
      }),
    );
    mockContactsCreate.mockRejectedValueOnce(conflict);
    await expect(
      createContact({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { email: "dup@example.com" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(ConflictError);
    // CRITICAL: no search call happens on `fail` — V1's regex
    // extraction is gone; V2 only searches when the caller opts in.
    expect(mockFindContactByEmail).not.toHaveBeenCalled();
    expect(mockContactsUpdate).not.toHaveBeenCalled();
  });

  it("`update` strategy: search-by-email + PATCH, sets wasUpdate=true", async () => {
    const conflict = new ConflictError("contact (create)", "{}");
    mockContactsCreate.mockRejectedValueOnce(conflict);
    mockFindContactByEmail.mockResolvedValueOnce({
      id: "contact-existing-100",
      properties: { email: "dup@example.com" },
    });
    mockContactsUpdate.mockResolvedValueOnce({
      id: "contact-existing-100",
      properties: {
        email: "dup@example.com",
        firstname: "Updated",
      },
      updatedAt: "2026-05-10T13:00:00Z",
    });

    const result = await createContact({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        email: "dup@example.com",
        firstname: "Updated",
        duplicateHandling: "update",
      },
      triggerEvent: trigger(),
    });

    // Deterministic search-by-email (V2 fix for V1 regex).
    expect(mockFindContactByEmail).toHaveBeenCalledTimes(1);
    expect(mockFindContactByEmail.mock.calls[0]![0]!.email).toBe(
      "dup@example.com",
    );
    // PATCH uses the SEARCH-RESOLVED id, NOT a regex-extracted one.
    expect(mockContactsUpdate.mock.calls[0]![0]!.contactId).toBe(
      "contact-existing-100",
    );
    expect(result.output.wasUpdate).toBe(true);
    expect(result.output.wasSkip).toBe(false);
    expect(result.output.contactId).toBe("contact-existing-100");
  });

  it("`skip` strategy: search-by-email + return existing, no PATCH, sets wasSkip=true", async () => {
    const conflict = new ConflictError("contact (create)", "{}");
    mockContactsCreate.mockRejectedValueOnce(conflict);
    mockFindContactByEmail.mockResolvedValueOnce({
      id: "contact-existing-200",
      properties: { email: "dup@example.com", firstname: "Original" },
      createdAt: "2026-05-01T00:00:00Z",
      updatedAt: "2026-05-01T00:00:00Z",
    });

    const result = await createContact({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        email: "dup@example.com",
        firstname: "Would-Update-If-Update-Mode",
        duplicateHandling: "skip",
      },
      triggerEvent: trigger(),
    });

    expect(mockFindContactByEmail).toHaveBeenCalledTimes(1);
    expect(mockContactsUpdate).not.toHaveBeenCalled();
    expect(result.output.wasSkip).toBe(true);
    expect(result.output.wasUpdate).toBe(false);
    expect(result.output.contactId).toBe("contact-existing-200");
    expect(result.output.firstName).toBe("Original");
  });

  it("race condition: 409 → search returns null → re-throws original ConflictError", async () => {
    const conflict = new ConflictError("contact (create)", "{}");
    mockContactsCreate.mockRejectedValueOnce(conflict);
    mockFindContactByEmail.mockResolvedValueOnce(null);

    await expect(
      createContact({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {
          email: "dup@example.com",
          duplicateHandling: "update",
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(ConflictError);

    expect(mockContactsUpdate).not.toHaveBeenCalled();
  });

  it("non-409 errors propagate verbatim regardless of duplicateHandling strategy", async () => {
    const networkErr = new Error("network failure");
    mockContactsCreate.mockRejectedValueOnce(networkErr);

    await expect(
      createContact({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {
          email: "a@b.com",
          duplicateHandling: "update",
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/network failure/);

    expect(mockFindContactByEmail).not.toHaveBeenCalled();
  });
});
