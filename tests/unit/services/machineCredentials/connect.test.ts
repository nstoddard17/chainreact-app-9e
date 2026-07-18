/**
 * @jest-environment node
 *
 * Tests for the machine-credential connect service. The provider registry, the
 * store, and the repo are mocked so we assert: unsupported provider rejection,
 * required-field + environment validation, provider-specific validation, and that
 * a valid connect delegates to the store with the right secrets/metadata. No DB.
 */

const registry = { getMachineAuth: jest.fn() };
jest.mock("@/services/machineCredentials/registry", () => ({
  getMachineAuth: (...a: unknown[]) => registry.getMachineAuth(...a),
}));

const store = { saveMachineCredential: jest.fn(), disconnectMachineCredential: jest.fn() };
jest.mock("@/services/machineCredentials/store", () => ({
  saveMachineCredential: (...a: unknown[]) => store.saveMachineCredential(...a),
  disconnectMachineCredential: (...a: unknown[]) => store.disconnectMachineCredential(...a),
}));

const repo = { getActiveMachineCredential: jest.fn() };
jest.mock("@/repositories/machineCredentials", () => ({
  getActiveMachineCredential: (...a: unknown[]) => repo.getActiveMachineCredential(...a),
}));

import {
  connectMachineCredential,
  disconnectMachineProvider,
  UnsupportedMachineProviderError,
} from "@/services/machineCredentials/connect";
import { MachineConnectInputError } from "@/services/machineCredentials/types";

function fakeAuth(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    environments: [
      { value: "iat", label: "Sandbox" },
      { value: "prod", label: "Production" },
    ],
    validateConnectInput: jest.fn(),
    buildTokenConfig: jest.fn(() => ({ tokenUrl: "https://t", clientAuth: "basic" })),
    buildMetadata: jest.fn((env: string) => ({ environment: env, apiBaseUrl: "https://api" })),
    apiBaseUrl: jest.fn(() => "https://api"),
    ...overrides,
  };
}

const goodInput = {
  clientId: "cid",
  clientSecret: "csecret",
  certPem: "CERT",
  keyPem: "KEY",
  environment: "prod",
};

beforeEach(() => {
  jest.clearAllMocks();
  store.saveMachineCredential.mockResolvedValue({ id: "cred-1", provider: "adp" });
});

describe("connectMachineCredential", () => {
  it("rejects a provider with no machine-auth config", async () => {
    registry.getMachineAuth.mockReturnValue(undefined);
    await expect(
      connectMachineCredential({
        accountId: "acct-1",
        actorUserId: "user-1",
        provider: "adp",
        input: goodInput,
      }),
    ).rejects.toBeInstanceOf(UnsupportedMachineProviderError);
  });

  it("rejects missing required fields", async () => {
    registry.getMachineAuth.mockReturnValue(fakeAuth());
    await expect(
      connectMachineCredential({
        accountId: "acct-1",
        actorUserId: "user-1",
        provider: "adp",
        input: { ...goodInput, clientSecret: "" },
      }),
    ).rejects.toBeInstanceOf(MachineConnectInputError);
    expect(store.saveMachineCredential).not.toHaveBeenCalled();
  });

  it("rejects an unknown environment", async () => {
    registry.getMachineAuth.mockReturnValue(fakeAuth());
    await expect(
      connectMachineCredential({
        accountId: "acct-1",
        actorUserId: "user-1",
        provider: "adp",
        input: { ...goodInput, environment: "bogus" },
      }),
    ).rejects.toMatchObject({ code: "invalid_environment" });
  });

  it("defaults to the first environment when none is supplied", async () => {
    const auth = fakeAuth();
    registry.getMachineAuth.mockReturnValue(auth);
    await connectMachineCredential({
      accountId: "acct-1",
      actorUserId: "user-1",
      provider: "adp",
      input: { ...goodInput, environment: null },
    });
    expect(auth.buildMetadata).toHaveBeenCalledWith("iat");
  });

  it("runs provider-specific validation and surfaces its typed error", async () => {
    const auth = fakeAuth({
      validateConnectInput: jest.fn(() => {
        throw new MachineConnectInputError("bad_client_id", "Client ID must start with ...");
      }),
    });
    registry.getMachineAuth.mockReturnValue(auth);
    await expect(
      connectMachineCredential({
        accountId: "acct-1",
        actorUserId: "user-1",
        provider: "adp",
        input: goodInput,
      }),
    ).rejects.toMatchObject({ code: "bad_client_id" });
    expect(store.saveMachineCredential).not.toHaveBeenCalled();
  });

  it("delegates to the store with secrets + provider metadata on success", async () => {
    const auth = fakeAuth();
    registry.getMachineAuth.mockReturnValue(auth);
    const dto = await connectMachineCredential({
      accountId: "acct-1",
      actorUserId: "user-1",
      provider: "adp",
      input: goodInput,
    });
    expect(dto).toEqual({ id: "cred-1", provider: "adp" });
    const call = store.saveMachineCredential.mock.calls[0]![0];
    expect(call.secrets).toEqual({
      clientId: "cid",
      clientSecret: "csecret",
      certPem: "CERT",
      keyPem: "KEY",
    });
    expect(call.metadata).toEqual({ environment: "prod", apiBaseUrl: "https://api" });
    expect(call.accountId).toBe("acct-1");
  });
});

describe("disconnectMachineProvider", () => {
  it("returns disconnected:false when nothing is connected", async () => {
    repo.getActiveMachineCredential.mockResolvedValue(null);
    const r = await disconnectMachineProvider({
      accountId: "acct-1",
      actorUserId: "user-1",
      provider: "adp",
    });
    expect(r).toEqual({ disconnected: false });
    expect(store.disconnectMachineCredential).not.toHaveBeenCalled();
  });

  it("delegates to the store when a credential exists", async () => {
    repo.getActiveMachineCredential.mockResolvedValue({ id: "cred-1" });
    store.disconnectMachineCredential.mockResolvedValue({ disconnected: true });
    const r = await disconnectMachineProvider({
      accountId: "acct-1",
      actorUserId: "user-1",
      provider: "adp",
    });
    expect(r).toEqual({ disconnected: true });
    expect(store.disconnectMachineCredential).toHaveBeenCalledWith(
      expect.objectContaining({ id: "cred-1", accountId: "acct-1", provider: "adp" }),
    );
  });
});
