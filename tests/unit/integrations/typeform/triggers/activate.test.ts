/**
 * @jest-environment node
 *
 * Tests for the Typeform activation hook — Slice 5.TYPEFORM-1.
 *
 * The Typeform lifecycle has NO creation handshake: activate mints the
 * secret itself, PUTs the webhook, and returns the full config patch
 * (no pre-upsert, no read-back — contrast the Asana activate tests).
 */
const mockRefreshAndRetry = jest.fn();
const mockWebhookPut = jest.fn();

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

jest.mock("@/integrations/_shared/typeform/api/webhooks", () => ({
  webhookPut: (...args: unknown[]) => mockWebhookPut(...args),
  webhookDelete: jest.fn(),
}));

jest.mock("@/core/encryption/tokens", () => ({
  encryptToken: (s: string) => `enc(${s})`,
  decryptToken: (s: string) => s.slice(4, -1),
}));

import {
  typeformNewResponseInFormActivate,
  typeformWebhookTag,
} from "@/integrations/typeform/triggers/newResponseInForm/activate";

function integration(overrides: Record<string, unknown> = {}) {
  return {
    id: "int-1",
    accountId: "acct-1",
    connectedByUserId: "user-1",
    provider: "typeform",
    providerAccountId: "marcus@example.test",
    ...overrides,
  } as never;
}

function node(config: Record<string, unknown>) {
  return {
    id: "node-1",
    kind: "trigger",
    provider: "typeform",
    type: "new_response_in_form",
    config,
  } as never;
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockWebhookPut.mockReset();
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.TYPEFORM_WEBHOOK_URL;
});

describe("typeformWebhookTag", () => {
  it("is deterministic per (workflow, node) and safe-charset", () => {
    const a = typeformWebhookTag("wf-1", "node-1");
    const b = typeformWebhookTag("wf-1", "node-1");
    const c = typeformWebhookTag("wf-2", "node-1");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^chainreact-[0-9a-f]{24}$/);
  });
});

describe("typeformNewResponseInFormActivate — happy path", () => {
  it("PUTs the webhook with a minted secret + strict-lookup URL and returns the full patch", async () => {
    mockWebhookPut.mockResolvedValueOnce({
      id: "wh-1",
      tag: typeformWebhookTag("wf-1", "node-1"),
      enabled: true,
    });

    const patch = await typeformNewResponseInFormActivate({
      node: node({ formId: "form-1" }),
      integration: integration(),
      workflowId: "wf-1",
    } as never);

    expect(mockWebhookPut).toHaveBeenCalledTimes(1);
    const putArg = mockWebhookPut.mock.calls[0]![0];
    expect(putArg.formId).toBe("form-1");
    expect(putArg.tag).toBe(typeformWebhookTag("wf-1", "node-1"));
    expect(putArg.url).toBe(
      "https://app.example.test/api/webhooks/typeform?workflowId=wf-1&nodeId=node-1",
    );
    // Minted secret: 32 random bytes, base64url.
    expect(typeof putArg.secret).toBe("string");
    expect(putArg.secret.length).toBeGreaterThanOrEqual(43);

    // The patch carries the ENCRYPTED secret + lifecycle fields.
    expect(patch).toMatchObject({
      webhookEnabled: true,
      formId: "form-1",
      webhookTag: typeformWebhookTag("wf-1", "node-1"),
      webhookId: "wh-1",
      hookSecretEncrypted: `enc(${putArg.secret})`,
      notificationUrl:
        "https://app.example.test/api/webhooks/typeform?workflowId=wf-1&nodeId=node-1",
    });
    // Never persisted in plaintext.
    expect(JSON.stringify(patch)).not.toContain(`"${putArg.secret}"`);
  });

  it("mints a FRESH secret per activation", async () => {
    mockWebhookPut.mockResolvedValue({ id: "wh-1" });
    await typeformNewResponseInFormActivate({
      node: node({ formId: "f" }),
      integration: integration(),
      workflowId: "wf-1",
    } as never);
    await typeformNewResponseInFormActivate({
      node: node({ formId: "f" }),
      integration: integration(),
      workflowId: "wf-1",
    } as never);
    const first = mockWebhookPut.mock.calls[0]![0].secret;
    const second = mockWebhookPut.mock.calls[1]![0].secret;
    expect(first).not.toBe(second);
  });

  it("honors the TYPEFORM_WEBHOOK_URL override and strips a doubled path", async () => {
    process.env.TYPEFORM_WEBHOOK_URL =
      "https://tunnel.example.test/api/webhooks/typeform";
    mockWebhookPut.mockResolvedValueOnce({ id: "wh-1" });
    await typeformNewResponseInFormActivate({
      node: node({ formId: "f" }),
      integration: integration(),
      workflowId: "wf-1",
    } as never);
    expect(mockWebhookPut.mock.calls[0]![0].url).toBe(
      "https://tunnel.example.test/api/webhooks/typeform?workflowId=wf-1&nodeId=node-1",
    );
  });
});

describe("typeformNewResponseInFormActivate — failures", () => {
  it("throws when formId is missing (nothing created)", async () => {
    await expect(
      typeformNewResponseInFormActivate({
        node: node({}),
        integration: integration(),
        workflowId: "wf-1",
      } as never),
    ).rejects.toThrow(/formId is required/);
    expect(mockWebhookPut).not.toHaveBeenCalled();
  });

  it("propagates a PUT failure (activation aborts; nothing to clean up)", async () => {
    mockWebhookPut.mockRejectedValueOnce(new Error("provider down"));
    await expect(
      typeformNewResponseInFormActivate({
        node: node({ formId: "f" }),
        integration: integration(),
        workflowId: "wf-1",
      } as never),
    ).rejects.toThrow("provider down");
  });
});
