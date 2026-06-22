import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * native:http_request — the one native action that makes a real outbound
 * network call. Unlike the pure native fixtures (delay / if_then_condition /
 * router / format_transformer), this one is ENV-GATED so it never fires a live
 * fetch in offline CI: with `SMOKE_NATIVE_HTTP_URL` unset it SKIPs (clear
 * "missing env" reason). Set it to a stable public **https** endpoint you
 * control (e.g. a status/health URL) to live-verify the GET path.
 *
 * The egress guard blocks private / loopback / link-local / metadata
 * destinations, so the URL must be public. A GET that returns any status (even
 * non-2xx) succeeds — the handler returns `{ ok, status, ... }` and only throws
 * on a blocked destination, an unsupported scheme, or a timeout.
 */
export default defineActionSmokeFixture({
  provider: "native",
  action: "http_request",
  risk: "read",
  config: {
    method: "GET",
    // Overlaid from SMOKE_NATIVE_HTTP_URL at run time; never used unless that
    // env is set (requiredEnv makes the fixture SKIP first when it is unset).
    url: "https://smoke.invalid/native-http-request-placeholder",
  },
  configFromEnv: { url: "SMOKE_NATIVE_HTTP_URL" },
  requiredEnv: ["SMOKE_NATIVE_HTTP_URL"],
  liveSafe: true,
  liveRisk: "read",
  expect: { outcome: "success" },
  notes: "GET against a public https URL from SMOKE_NATIVE_HTTP_URL; SKIPs when unset. No creds, but a real network call.",
});
