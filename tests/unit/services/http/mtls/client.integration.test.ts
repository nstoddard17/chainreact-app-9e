import * as https from "node:https";
import type { AddressInfo } from "node:net";
import { mtlsRequest } from "@/services/http/mtls/client";
import { MtlsError } from "@/services/http/mtls/errors";
import {
  TEST_CLIENT_CERT_PEM,
  TEST_CLIENT_KEY_PEM,
} from "@/tests/fixtures/mtls/testCerts";

/**
 * End-to-end mutual-TLS test against a REAL local node:https server.
 *
 * Proves the transport actually presents the client certificate at the TLS layer
 * (true mTLS) — the injected-dispatch tests cover orchestration, this covers the
 * socket. The self-signed fixture cert doubles as the server cert; the client
 * trusts it via `caPem`, and hostname verification passes through the cert's
 * 127.0.0.1 SAN.
 */
describe("mtls/client — real node:https mutual TLS", () => {
  let server: https.Server;
  let port: number;

  beforeAll(async () => {
    server = https.createServer(
      {
        key: TEST_CLIENT_KEY_PEM,
        cert: TEST_CLIENT_CERT_PEM,
        requestCert: true,
        rejectUnauthorized: false, // we inspect the presented cert ourselves
      },
      (req, res) => {
        const peer = (req.socket as import("node:tls").TLSSocket).getPeerCertificate();
        const presentedCn =
          peer && "subject" in peer && peer.subject ? peer.subject.CN : null;
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(
            JSON.stringify({ presentedCn, method: req.method, path: req.url, echo: body }),
          );
        });
      },
    );
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("presents the client certificate and round-trips a request", async () => {
    const res = await mtlsRequest({
      method: "POST",
      url: `https://127.0.0.1:${port}/hello`,
      headers: { "content-type": "application/json" },
      body: '{"ping":1}',
      credential: {
        certPem: TEST_CLIENT_CERT_PEM,
        keyPem: TEST_CLIENT_KEY_PEM,
        caPem: TEST_CLIENT_CERT_PEM,
      },
    });
    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.presentedCn).toBe("chainreact-mtls-test"); // client cert was presented
    expect(parsed.method).toBe("POST");
    expect(parsed.path).toBe("/hello");
    expect(parsed.echo).toBe('{"ping":1}');
  });

  it("fails with a redacted tls_handshake_failed when the server CA is untrusted", async () => {
    // No caPem → the self-signed server is not trusted by system roots → the
    // handshake fails, and the error must be redacted (no cert material).
    try {
      await mtlsRequest({
        method: "GET",
        url: `https://127.0.0.1:${port}/hello`,
        credential: { certPem: TEST_CLIENT_CERT_PEM, keyPem: TEST_CLIENT_KEY_PEM },
      });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(MtlsError);
      expect((e as MtlsError).code).toBe("tls_handshake_failed");
      expect((e as Error).message).not.toContain("BEGIN");
    }
  });
});
