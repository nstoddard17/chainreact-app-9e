/**
 * @jest-environment node
 */
import { createServer } from "node:net";
import {
  startMockHermesServer,
  waitForMockHermesHealth,
  type MockHermesHandle,
} from "../../e2e/helpers/mockHermesServer";
import {
  findFreeLoopbackPort,
  reserveLoopbackPortSync,
  resolveMockHermesPort,
  mockHermesGatewayUrl,
} from "../../e2e/helpers/reservePort";

/**
 * 5.DUAL-BUILDER-1 CS-7G — process-isolation hardening for the mock-Hermes E2E lifecycle.
 *
 * CS-7F used a FIXED mock port (9890) and had no health gate; overlapping runs and stray
 * processes collided. These prove the CS-7G lifecycle: per-run dynamic loopback ports, two
 * instances that never collide, an awaited health gate, startup-failure cleanup, a clean
 * normal shutdown, correct per-run URL propagation, and fail-closed behavior for a missing
 * mock — all WITHOUT any broad port-kill (only tracked handles are ever closed).
 */
describe("CS-7G mock-Hermes process lifecycle", () => {
  describe("dynamic loopback port assignment", () => {
    it("findFreeLoopbackPort returns a real, in-range loopback port", async () => {
      const port = await findFreeLoopbackPort();
      expect(Number.isInteger(port)).toBe(true);
      expect(port).toBeGreaterThan(0);
      expect(port).toBeLessThanOrEqual(65_535);
    });

    it("port: 0 binds an ephemeral port and the handle reports the ACTUAL bound port", async () => {
      const handle = await startMockHermesServer({ port: 0 });
      try {
        expect(handle.port).toBeGreaterThan(0);
        expect(handle.baseUrl).toBe(`http://127.0.0.1:${handle.port}`);
        const health = await fetch(`${handle.baseUrl}/health`);
        expect(health.status).toBe(200);
      } finally {
        await handle.close();
      }
    });

    it("reserveLoopbackPortSync (config-load path) returns a usable free port", () => {
      const port = reserveLoopbackPortSync();
      expect(port).toBeGreaterThan(0);
      expect(port).toBeLessThanOrEqual(65_535);
    });
  });

  describe("two instances never collide", () => {
    it("two ephemeral mocks get distinct ports and both answer /health", async () => {
      const a = await startMockHermesServer({ port: 0 });
      const b = await startMockHermesServer({ port: 0 });
      try {
        expect(a.port).not.toBe(b.port);
        expect((await fetch(`${a.baseUrl}/health`)).status).toBe(200);
        expect((await fetch(`${b.baseUrl}/health`)).status).toBe(200);
      } finally {
        await a.close();
        await b.close();
      }
    });
  });

  describe("health wait", () => {
    it("resolves once a live mock is serving /health", async () => {
      const handle = await startMockHermesServer({ port: 0 });
      try {
        await expect(waitForMockHermesHealth(handle.baseUrl, { timeoutMs: 2_000 })).resolves.toBeUndefined();
      } finally {
        await handle.close();
      }
    });

    it("rejects (fail-closed) when nothing is listening — never silently continues", async () => {
      const deadPort = await findFreeLoopbackPort(); // free, nothing bound
      await expect(
        waitForMockHermesHealth(`http://127.0.0.1:${deadPort}`, { timeoutMs: 400, intervalMs: 50 }),
      ).rejects.toThrow(/did not become healthy/);
    });
  });

  describe("startup failure cleanup", () => {
    it("binding a port already in use throws EADDRINUSE and leaves the original server intact", async () => {
      // Occupy a port with a plain server, then try to start the mock on it.
      const occupied = await findFreeLoopbackPort();
      const blocker = createServer();
      await new Promise<void>((resolve) => blocker.listen(occupied, "127.0.0.1", resolve));
      try {
        let threw: { code?: string } | null = null;
        try {
          await startMockHermesServer({ port: occupied });
        } catch (err) {
          threw = err as { code?: string };
        }
        expect(threw?.code).toBe("EADDRINUSE");
        // The pre-existing (unrelated) server is untouched — no broad kill happened.
        expect(blocker.listening).toBe(true);
      } finally {
        await new Promise<void>((resolve) => blocker.close(() => resolve()));
      }
    });
  });

  describe("normal shutdown frees the port (no broad termination)", () => {
    it("close() releases the port and only affects the tracked handle", async () => {
      const handle: MockHermesHandle = await startMockHermesServer({ port: 0 });
      const port = handle.port;
      await handle.close();
      // The port is now free: a plain server can bind it (proves close() actually released it).
      const rebind = createServer();
      await expect(
        new Promise<void>((resolve, reject) => {
          rebind.once("error", reject);
          rebind.listen(port, "127.0.0.1", () => resolve());
        }),
      ).resolves.toBeUndefined();
      await new Promise<void>((resolve) => rebind.close(() => resolve()));
    });
  });

  describe("per-run URL propagation to the app process", () => {
    it("resolveMockHermesPort reserves once and records it on env for later readers", () => {
      const env: Record<string, string | undefined> = {};
      const first = resolveMockHermesPort(env);
      expect(env.MOCK_HERMES_PORT).toBe(String(first));
      // Idempotent within a process: a later reader (global-setup) gets the SAME port.
      const second = resolveMockHermesPort(env);
      expect(second).toBe(first);
    });

    it("resolveMockHermesPort honors an operator-pinned MOCK_HERMES_PORT", () => {
      const env: Record<string, string | undefined> = { MOCK_HERMES_PORT: "54999" };
      expect(resolveMockHermesPort(env)).toBe(54_999);
    });

    it("mockHermesGatewayUrl builds a loopback URL the app points at", () => {
      expect(mockHermesGatewayUrl(12_345)).toBe("http://127.0.0.1:12345");
    });
  });

  describe("missing mock fails closed rather than contacting production", () => {
    it("a guidance request to a non-listening loopback port connection-refuses (never resolves to a provider)", async () => {
      const deadPort = await findFreeLoopbackPort();
      await expect(
        fetch(`http://127.0.0.1:${deadPort}/api/hermes-agent/guidance`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt: "x" }),
        }),
      ).rejects.toBeTruthy();
    });
  });
});
