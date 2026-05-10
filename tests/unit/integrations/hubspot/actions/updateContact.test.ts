/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockContactsUpdate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
}));
jest.mock("@/integrations/_shared/hubspot/api/contacts", () => ({
  contactsUpdate: (...a: unknown[]) => mockContactsUpdate(...a),
}));

import { updateContact } from "@/integrations/hubspot/actions/updateContact";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockContactsUpdate.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

const trigger: TriggerEvent = {
  provider: "hubspot",
  eventType: "manual",
  eventId: "e",
  occurredAt: "x",
  accountId: "9876543",
  payload: {},
};

describe("update_contact", () => {
  it("PATCHes contactsUpdate with non-empty fields", async () => {
    mockContactsUpdate.mockResolvedValueOnce({
      id: "c-42",
      properties: { email: "a@b.com", firstname: "New" },
      updatedAt: "2026-05-10T13:00:00Z",
    });

    const result = await updateContact({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { contactId: "c-42", firstname: "New" },
      triggerEvent: trigger,
    });

    expect(mockContactsUpdate.mock.calls[0]![0]!).toMatchObject({
      contactId: "c-42",
      properties: { firstname: "New" },
    });
    // Only the supplied field reaches the wrapper — `lastname` etc.
    // omitted from the config never get into `properties` (the handler
    // builds the properties object from the schema's allowed keys, so
    // anything not in `config` is absent).
    expect(
      mockContactsUpdate.mock.calls[0]![0]!.properties.lastname,
    ).toBeUndefined();

    expect(result.output.contactId).toBe("c-42");
    expect(result.output.firstName).toBe("New");
    expect(result.output.updatedAt).toBe("2026-05-10T13:00:00Z");
  });

  it("throws when no property fields are provided", async () => {
    await expect(
      updateContact({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { contactId: "c-1" },
        triggerEvent: trigger,
      }),
    ).rejects.toThrow(/at least one property/);
  });

  it("rejects empty contactId at schema layer", async () => {
    await expect(
      updateContact({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { contactId: "", firstname: "X" },
        triggerEvent: trigger,
      }),
    ).rejects.toThrow();
  });

  it("wraps in refreshAndRetry", async () => {
    mockContactsUpdate.mockResolvedValueOnce({ id: "c", properties: {} });
    await updateContact({
      workflowId: "wf",
      userId: "u-1",
      runId: "r",
      nodeId: "n",
      config: { contactId: "c", firstname: "x" },
      triggerEvent: trigger,
    });
    expect(mockRefreshAndRetry).toHaveBeenCalled();
    expect(mockRefreshAndRetry.mock.calls[0]![0]!.userId).toBe("u-1");
    expect(mockRefreshAndRetry.mock.calls[0]![0]!.provider).toBe("hubspot");
  });
});
