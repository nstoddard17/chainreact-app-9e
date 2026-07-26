/**
 * @jest-environment node
 *
 * REACT-AGENT-RESOLVER-RECOVERY-1 — Typeform + Mailchimp regression through the REAL resolver path.
 *
 * Reproduces the exact production failure the React Agent's required-details panel showed for the
 * drafted `typeform:new_response_in_form → mailchimp:add_subscriber → …` workflow, and pins BOTH
 * root causes — which are NOT the same:
 *
 *   - **Typeform** is classified `personal` in `core/integrations/credentialSharing.ts`, so
 *     `services/options/credentialPolicy.ts` routes an options request for a workflow the requester
 *     did not create to `NOT_WORKFLOW_OWNER`, and the workflow creator with no connection to
 *     `OWNER_MUST_CONNECT`. Both were rendered by the old rail control as the retry-less
 *     "Couldn't load options. You can finish this in the step editor." — the dead end.
 *   - **Mailchimp** is classified `account`, so the same situations resolve the WORKFLOW's account
 *     and return `INTEGRATION_DISCONNECTED` (or a provider failure) — which the old control rendered
 *     as a bare "Try again" with nothing else on offer.
 *
 * Everything below the route runs FOR REAL: the resolver registry, the credential-sharing policy,
 * `resolveOptionsSource`, the provider option resolvers, and the provider API wrappers (including
 * their status→error classification). Only two boundaries are stubbed:
 *   - persistence / credential material (`repositories/integrations`, personal-account lookup,
 *     workflow-creator lookup, `refreshAndRetry`'s token acquisition), and
 *   - the external provider HTTP boundary (`fetch`).
 *
 * The second half of each case asserts what the BUILDER now does with the result: the shared
 * `classifyOptionsRecovery` turns every one of these into a distinct, honest, recoverable state.
 */

const mockGetActiveForExecution = jest.fn();
const mockEnsurePersonalAccount = jest.fn();
const mockResolveWorkflowCreatorContext = jest.fn();

jest.mock("@/repositories/integrations", () => ({
  __esModule: true,
  getActiveForExecution: (...a: unknown[]) => mockGetActiveForExecution(...a),
  markNeedsReconnect: jest.fn(async () => false),
  clearNeedsReconnect: jest.fn(async () => {}),
}));
jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  __esModule: true,
  ensurePersonalAccount: (...a: unknown[]) => mockEnsurePersonalAccount(...a),
}));
jest.mock("@/services/options/workflowCreatorContext", () => ({
  __esModule: true,
  resolveWorkflowCreatorContext: (...a: unknown[]) => mockResolveWorkflowCreatorContext(...a),
}));
jest.mock("@/services/integrations/reconnectNotification", () => ({
  __esModule: true,
  notifyReconnectNeeded: jest.fn(async () => {}),
}));
jest.mock("@/services/teamCredentials/nodeCredentialOwners", () => ({
  __esModule: true,
  resolveEffectiveNodeOwner: jest.fn(async () => null),
}));

// Credential material is a persistence concern, not the provider boundary: hand the real wrapper a
// token and let it make the real (fetch-stubbed) call.
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: async (input: { apiCall: (t: string) => Promise<unknown> }) =>
      input.apiCall("provider-access-token"),
  };
});

import { resolveOptionsSource } from "@/services/options/resolveOptionsSource";
import { classifyOptionsRecovery } from "@/core/workflows/options/optionsRecovery";

const OWNER = "user-owner";
const COWORKER = "user-coworker";
const TEAM_ACCOUNT = "acct-team";

function typeformIntegration() {
  return {
    id: "int-typeform",
    accountId: TEAM_ACCOUNT,
    provider: "typeform",
    providerAccountId: "owner@example.test",
    accountMetadata: {},
    needsReconnectAt: null,
  };
}
function mailchimpIntegration() {
  return {
    id: "int-mailchimp",
    accountId: TEAM_ACCOUNT,
    provider: "mailchimp",
    providerAccountId: "mc-1",
    accountMetadata: { dc: "us14" },
    needsReconnectAt: null,
  };
}

/** Stub ONE provider HTTP response. The real wrapper parses it and classifies the status. */
function stubProviderHttp(status: number, body: unknown) {
  const fetchMock = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  }));
  (globalThis as { fetch: unknown }).fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

/** The whole rendered recovery text the user would see, for leak assertions. */
function renderedRecovery(
  source: string,
  providerLabel: string,
  fieldLabel: string,
  response: { code?: string; message?: string },
) {
  const d = classifyOptionsRecovery({
    status: "error",
    code: response.code as never,
    source,
    providerLabel,
    fieldLabel,
  });
  return { descriptor: d, text: `${d.headline} ${d.detail ?? ""}` };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEnsurePersonalAccount.mockResolvedValue({ id: "acct-personal" });
  mockResolveWorkflowCreatorContext.mockResolvedValue(null);
  mockGetActiveForExecution.mockResolvedValue(null);
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

// ── Typeform (personal credential) ─────────────────────────────────────────────────────────────

describe("typeform:forms — the dead-end cases", () => {
  it("a co-editor on someone else's workflow gets NOT_WORKFLOW_OWNER and NO provider call is made", async () => {
    mockResolveWorkflowCreatorContext.mockResolvedValue({
      workflowId: "wf-1",
      createdByUserId: OWNER,
      accountId: TEAM_ACCOUNT,
    });
    const fetchMock = stubProviderHttp(200, { items: [] });

    const { response } = await resolveOptionsSource({
      source: "typeform:forms",
      userId: COWORKER,
      q: "",
      deps: {},
      workflowId: "wf-1",
      nodeId: "node-1",
    });

    expect(response.ok).toBe(false);
    expect(response.ok === false && response.code).toBe("NOT_WORKFLOW_OWNER");
    // The owner's forms are never fetched, and no integration row is even looked up.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockGetActiveForExecution).not.toHaveBeenCalled();

    // The builder now renders this as owner-managed — no pointless retry, but NOT a dead end.
    const { descriptor } = renderedRecovery("typeform:forms", "Typeform", "Form", response as never);
    expect(descriptor.kind).toBe("owner-managed");
    expect(descriptor.canRetry).toBe(false);
    expect(descriptor.canEnterManually).toBe(true);
  });

  it("the workflow creator with no Typeform connection gets OWNER_MUST_CONNECT → a connect CTA", async () => {
    mockResolveWorkflowCreatorContext.mockResolvedValue({
      workflowId: "wf-1",
      createdByUserId: OWNER,
      accountId: TEAM_ACCOUNT,
    });
    mockGetActiveForExecution.mockResolvedValue(null);

    const { response } = await resolveOptionsSource({
      source: "typeform:forms",
      userId: OWNER,
      q: "",
      deps: {},
      workflowId: "wf-1",
      nodeId: null,
    });

    expect(response.ok === false && response.code).toBe("OWNER_MUST_CONNECT");
    const { descriptor } = renderedRecovery("typeform:forms", "Typeform", "Form", response as never);
    expect(descriptor.kind).toBe("connection-missing");
    expect(descriptor.canReconnect).toBe(true);
    expect(descriptor.reconnectProvider).toBe("typeform");
  });
});

describe("typeform:forms — provider outcomes through the real wrapper", () => {
  it("lists real forms on the happy path", async () => {
    mockResolveWorkflowCreatorContext.mockResolvedValue({
      workflowId: "wf-1",
      createdByUserId: OWNER,
      accountId: TEAM_ACCOUNT,
    });
    mockGetActiveForExecution.mockResolvedValue(typeformIntegration());
    stubProviderHttp(200, {
      page_count: 1,
      items: [
        { id: "form_abc", title: "Customer Feedback" },
        { id: "form_def", title: "Lead Capture" },
      ],
    });

    const { response } = await resolveOptionsSource({
      source: "typeform:forms",
      userId: OWNER,
      q: "",
      deps: {},
      workflowId: "wf-1",
      nodeId: null,
    });

    expect(response.ok).toBe(true);
    expect(response.ok === true && response.items).toEqual([
      { value: "form_abc", label: "Customer Feedback" },
      { value: "form_def", label: "Lead Capture" },
    ]);
  });

  it("a 403 from Typeform becomes the reconnect/permission state, naming the permission only", async () => {
    mockResolveWorkflowCreatorContext.mockResolvedValue({
      workflowId: "wf-1",
      createdByUserId: OWNER,
      accountId: TEAM_ACCOUNT,
    });
    mockGetActiveForExecution.mockResolvedValue(typeformIntegration());
    stubProviderHttp(403, {
      code: "AUTHENTICATION_FAILED",
      description: "token forms:read missing for account 91231",
    });

    const { response } = await resolveOptionsSource({
      source: "typeform:forms",
      userId: OWNER,
      q: "",
      deps: {},
      workflowId: "wf-1",
      nodeId: null,
    });

    expect(response.ok === false && response.code).toBe("PROVIDER_REAUTH_REQUIRED");
    const message = response.ok === false ? response.message : "";
    expect(message).toMatch(/missing a required permission/i);
    // The provider's own body never reaches the browser.
    expect(message).not.toMatch(/AUTHENTICATION_FAILED/);
    expect(message).not.toMatch(/91231/);
  });

  it("a 500 from Typeform becomes a sanitized PROVIDER_ERROR, not a stack or a body", async () => {
    mockResolveWorkflowCreatorContext.mockResolvedValue({
      workflowId: "wf-1",
      createdByUserId: OWNER,
      accountId: TEAM_ACCOUNT,
    });
    mockGetActiveForExecution.mockResolvedValue(typeformIntegration());
    stubProviderHttp(500, { error: "internal", trace: "at forms.ts:12", token: "tf_live_LEAK" });

    const { response } = await resolveOptionsSource({
      source: "typeform:forms",
      userId: OWNER,
      q: "",
      deps: {},
      workflowId: "wf-1",
      nodeId: null,
    });

    expect(response.ok === false && response.code).toBe("PROVIDER_ERROR");
    const message = response.ok === false ? response.message : "";
    expect(message).not.toMatch(/tf_live_LEAK/);
    expect(message).not.toMatch(/forms\.ts/);

    const { descriptor, text } = renderedRecovery("typeform:forms", "Typeform", "Form", response as never);
    expect(descriptor.kind).toBe("provider-unavailable");
    expect(descriptor.canRetry).toBe(true);
    expect(text).not.toMatch(/tf_live_LEAK/);
  });
});

// ── Mailchimp (account credential) ─────────────────────────────────────────────────────────────

describe("mailchimp:audiences — a DIFFERENT root cause from Typeform", () => {
  it("resolves the WORKFLOW's account (not the editor's personal one) and reports it disconnected", async () => {
    mockResolveWorkflowCreatorContext.mockResolvedValue({
      workflowId: "wf-1",
      createdByUserId: OWNER,
      accountId: TEAM_ACCOUNT,
    });
    mockGetActiveForExecution.mockResolvedValue(null);

    const { response, diagnostics } = await resolveOptionsSource({
      source: "mailchimp:audiences",
      userId: COWORKER,
      q: "",
      deps: {},
      workflowId: "wf-1",
      nodeId: null,
    });

    // Account-shared: a co-editor is NOT owner-gated here — this is why the two fields showed
    // different states in production.
    expect(diagnostics.credentialDecision).toBe("account");
    expect(mockGetActiveForExecution).toHaveBeenCalledWith(TEAM_ACCOUNT, "mailchimp", null);
    expect(response.ok === false && response.code).toBe("INTEGRATION_DISCONNECTED");

    const { descriptor } = renderedRecovery(
      "mailchimp:audiences",
      "Mailchimp",
      "Audience",
      response as never,
    );
    expect(descriptor.kind).toBe("connection-missing");
    expect(descriptor.reconnectProvider).toBe("mailchimp");
  });

  it("lists real audiences on the happy path", async () => {
    mockGetActiveForExecution.mockResolvedValue(mailchimpIntegration());
    stubProviderHttp(200, {
      total_items: 1,
      lists: [{ id: "aud_1", name: "Newsletter", stats: { member_count: 42 } }],
    });

    const { response } = await resolveOptionsSource({
      source: "mailchimp:audiences",
      userId: OWNER,
      q: "",
      deps: {},
      workflowId: null,
      nodeId: null,
    });

    expect(response.ok).toBe(true);
    expect(response.ok === true && response.items).toEqual([
      { value: "aud_1", label: "Newsletter", description: "42 members" },
    ]);
  });

  it("an account with no audiences is an EMPTY result, not an error", async () => {
    mockGetActiveForExecution.mockResolvedValue(mailchimpIntegration());
    stubProviderHttp(200, { total_items: 0, lists: [] });

    const { response } = await resolveOptionsSource({
      source: "mailchimp:audiences",
      userId: OWNER,
      q: "",
      deps: {},
      workflowId: null,
      nodeId: null,
    });

    expect(response.ok).toBe(true);
    expect(response.ok === true && response.items).toEqual([]);
    // The builder shows the distinct "no audiences yet" state, still with a way forward.
    const empty = classifyOptionsRecovery({
      status: "empty",
      source: "mailchimp:audiences",
      providerLabel: "Mailchimp",
      fieldLabel: "Audience",
    });
    expect(empty.kind).toBe("no-results");
    expect(empty.canEnterManually).toBe(true);
  });

  it("a 401 from Mailchimp asks for a reconnect and never echoes the provider body", async () => {
    mockGetActiveForExecution.mockResolvedValue(mailchimpIntegration());
    stubProviderHttp(401, { title: "API Key Invalid", detail: "your key mc-secret-123 is invalid" });

    const { response } = await resolveOptionsSource({
      source: "mailchimp:audiences",
      userId: OWNER,
      q: "",
      deps: {},
      workflowId: null,
      nodeId: null,
    });

    expect(response.ok === false && response.code).toBe("INTEGRATION_DISCONNECTED");
    const message = response.ok === false ? response.message : "";
    expect(message).toMatch(/Reconnect Mailchimp/i);
    expect(message).not.toMatch(/mc-secret-123/);
  });

  it("an integration row missing its datacenter asks for a reconnect instead of crashing", async () => {
    mockGetActiveForExecution.mockResolvedValue({
      ...mailchimpIntegration(),
      accountMetadata: {},
    });

    const { response } = await resolveOptionsSource({
      source: "mailchimp:audiences",
      userId: OWNER,
      q: "",
      deps: {},
      workflowId: null,
      nodeId: null,
    });

    expect(response.ok === false && response.code).toBe("INTEGRATION_DISCONNECTED");
    const { descriptor } = renderedRecovery(
      "mailchimp:audiences",
      "Mailchimp",
      "Audience",
      response as never,
    );
    expect(descriptor.canReconnect).toBe(true);
  });
});
