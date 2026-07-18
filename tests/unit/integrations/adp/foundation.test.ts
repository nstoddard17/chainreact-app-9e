/**
 * @jest-environment node
 *
 * ADP provider foundation tests: manifest honesty + registry classification,
 * machine-auth config, the mTLS API client (mocked ADP boundary), and the
 * `adpx-messageauthentication` webhook signature verifier.
 */

import { adpManifest } from "@/integrations/adp/manifest";
import { getProvider } from "@/integrations/_registry";
import { credentialSharingForProvider } from "@/core/integrations/credentialSharing";
import { getMachineAuth } from "@/services/machineCredentials/registry";
import { adpMachineAuth } from "@/integrations/adp/auth";
import { MachineConnectInputError } from "@/services/machineCredentials/types";
import {
  computeAdpMessageAuth,
  verifyAdpWebhookSignature,
  ADP_MESSAGE_AUTH_HEADER,
} from "@/integrations/adp/webhooks/verifySignature";

describe("ADP manifest — honest + disabled", () => {
  it("is registered, disabled, machine-credentials, with no capabilities claimed", () => {
    expect(getProvider("adp")).toBeDefined();
    expect(adpManifest.isEnabled).toBe(false);
    expect(adpManifest.authFlow).toBe("machine_credentials");
    expect(adpManifest.capabilities).toEqual({
      oauth: false,
      webhookTrigger: false,
      pollingTrigger: false,
      actions: false,
    });
  });

  it("is classified as an account credential", () => {
    expect(credentialSharingForProvider("adp")).toBe("account");
  });

  it("has a registered machine-auth config", () => {
    expect(getMachineAuth("adp")).toBe(adpMachineAuth);
  });
});

describe("ADP machine-auth config", () => {
  it("exposes IAT + prod environments (IAT default) with correct hosts", () => {
    expect(adpMachineAuth.environments.map((e) => e.value)).toEqual(["iat", "prod"]);
    const prod = adpMachineAuth.buildTokenConfig("prod");
    expect(prod.tokenUrl).toBe("https://accounts.adp.com/auth/oauth/v2/token");
    expect(prod.clientAuth).toBe("basic");
    expect(adpMachineAuth.apiBaseUrl("prod")).toBe("https://api.adp.com");
    expect(adpMachineAuth.apiBaseUrl("iat")).toBe("https://iat-api.adp.com");
  });

  it("builds non-secret metadata for the environment", () => {
    expect(adpMachineAuth.buildMetadata("prod")).toEqual({
      environment: "prod",
      apiBaseUrl: "https://api.adp.com",
      tokenUrl: "https://accounts.adp.com/auth/oauth/v2/token",
    });
  });

  it("validates connect input shape without echoing values", () => {
    const good = {
      clientId: "abc-123",
      clientSecret: "s",
      certPem: "-----BEGIN CERTIFICATE-----\nx\n-----END CERTIFICATE-----",
      keyPem: "-----BEGIN EC PRIVATE KEY-----\ny\n-----END EC PRIVATE KEY-----",
    };
    expect(() => adpMachineAuth.validateConnectInput(good)).not.toThrow();
    expect(() =>
      adpMachineAuth.validateConnectInput({ ...good, clientId: "has space" }),
    ).toThrow(MachineConnectInputError);
    expect(() =>
      adpMachineAuth.validateConnectInput({ ...good, certPem: "nope" }),
    ).toThrow(MachineConnectInputError);
    expect(() =>
      adpMachineAuth.validateConnectInput({ ...good, keyPem: "nope" }),
    ).toThrow(MachineConnectInputError);
  });
});

describe("ADP webhook signature (adpx-messageauthentication)", () => {
  const clientId = "connector-client-id";
  const clientSecret = "connector-secret";

  it("uses the documented HMAC-SHA256(key=secret, msg=clientId) scheme", () => {
    const expected = computeAdpMessageAuth(clientId, clientSecret);
    expect(expected).toMatch(/^[0-9a-f]{64}$/);
    expect(ADP_MESSAGE_AUTH_HEADER).toBe("adpx-messageauthentication");
  });

  it("accepts a valid signature and rejects a wrong/missing one", () => {
    const good = computeAdpMessageAuth(clientId, clientSecret);
    expect(verifyAdpWebhookSignature({ headerValue: good, clientId, clientSecret })).toBe(true);
    expect(
      verifyAdpWebhookSignature({ headerValue: "deadbeef", clientId, clientSecret }),
    ).toBe(false);
    expect(
      verifyAdpWebhookSignature({ headerValue: null, clientId, clientSecret }),
    ).toBe(false);
    // Wrong secret ⇒ reject.
    expect(
      verifyAdpWebhookSignature({ headerValue: good, clientId, clientSecret: "other" }),
    ).toBe(false);
  });
});
