/**
 * @jest-environment node
 *
 * `fleetioCreateMeterEntry` API wrapper (FLEETIO-4).
 *
 * Business rules protected:
 *   - Correct method (POST) + endpoint (top-level /meter_entries — NOT
 *     vehicle-nested), so vehicle_id rides in the BODY.
 *   - Both Fleetio auth headers + pinned X-Api-Version.
 *   - Request body contains EXACTLY the approved fields in Fleetio wire types;
 *     caller input is never spread and `meter_type` is omitted for a primary
 *     reading / sent as "secondary" for a secondary one.
 *   - Zero and decimal readings survive the wire conversion.
 *   - 201 returns the created Meter Entry projected into the bounded subset.
 *   - Malformed 2xx (no/zero id) → FleetioMalformedResponseError (never a
 *     fabricated meter-entry id).
 *   - 401/403/404/422/5xx/timeout reject safely, credential-free.
 *   - WRITE-SAFETY: 429, 5xx, timeout and network failure each make EXACTLY one
 *     provider call — a create is never auto-replayed.
 *   - No idempotency header is sent (Fleetio publishes none for this endpoint).
 */
import { fleetioCreateMeterEntry } from "@/integrations/fleetio/api/meterEntries";
import {
  FleetioForbiddenError,
  FleetioNotFoundError,
  FleetioRateLimitError,
  FleetioMalformedResponseError,
} from "@/integrations/fleetio/api/_request";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

const ORIGINAL_FETCH = global.fetch;
const API_KEY = "fleetio-key-meter-secret";
const ACCOUNT_TOKEN = "acct-token-meter-secret";

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...(headers ?? {}) },
  });
}

/** A realistic `MeterEntry_Created` 201 body (2025-05-05 shape) + raw noise. */
const CREATED = {
  id: 9001,
  account_id: 7211,
  value: "152340.5",
  meter_type: null,
  meterable_id: null,
  meterable_type: null,
  vehicle_id: 42,
  void: false,
  category: "manual",
  date: "2026-07-23",
  created_at: "2026-07-23T12:00:00Z",
  updated_at: "2026-07-23T12:00:00Z",
  auto_voided_at: null,
  gps_provider: null,
  gps_device_id: null,
  is_sample: false,
  secret_internal: "must-not-leak",
};

const BASE = {
  apiKey: API_KEY,
  accountToken: ACCOUNT_TOKEN,
  vehicleId: 42,
  value: 152340.5,
  date: "2026-07-23T12:00:00Z",
  secondaryMeter: false,
};

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
});

describe("fleetioCreateMeterEntry — wire shape", () => {
  it("POSTs the TOP-LEVEL /meter_entries with both headers, pinned version, and only the approved body", async () => {
    const fetchMock = jest.fn(async () => jsonResponse(201, CREATED));
    global.fetch = fetchMock as unknown as typeof fetch;

    const entry = await fleetioCreateMeterEntry(BASE);

    const [url, init] = fetchMock.mock.calls[0]! as unknown as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    // Top-level create endpoint — vehicle_id is a BODY field, not a path segment.
    expect(url).toBe("https://secure.fleetio.com/api/meter_entries");
    expect(url).not.toContain("/vehicles/");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Token ${API_KEY}`);
    expect(init.headers["Account-Token"]).toBe(ACCOUNT_TOKEN);
    expect(init.headers["X-Api-Version"]).toBe("2025-05-05");

    // EXACTLY the approved fields, in Fleetio wire types. `meter_type` is
    // omitted for a primary reading; `void` / notes / source are never sent.
    expect(JSON.parse(init.body)).toEqual({
      vehicle_id: 42,
      value: 152340.5,
      date: "2026-07-23T12:00:00Z",
    });

    // Bounded projection; raw noise dropped.
    expect(entry.id).toBe(9001);
    expect(entry.value).toBe("152340.5");
    expect(JSON.stringify(entry)).not.toContain("must-not-leak");
    expect(JSON.stringify(entry)).not.toContain("7211");
  });

  it("sends meter_type: 'secondary' ONLY for a secondary-meter reading", async () => {
    const fetchMock = jest.fn(async () => jsonResponse(201, { ...CREATED, meter_type: "secondary" }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await fleetioCreateMeterEntry({ ...BASE, value: 4210, secondaryMeter: true });

    const [, init] = fetchMock.mock.calls[0]! as unknown as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({
      vehicle_id: 42,
      value: 4210,
      date: "2026-07-23T12:00:00Z",
      meter_type: "secondary",
    });
  });

  it("preserves an explicit ZERO reading on the wire (not dropped as falsy)", async () => {
    const fetchMock = jest.fn(async () => jsonResponse(201, { ...CREATED, value: "0" }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const entry = await fleetioCreateMeterEntry({ ...BASE, value: 0 });

    const [, init] = fetchMock.mock.calls[0]! as unknown as [string, { body: string }];
    expect(JSON.parse(init.body).value).toBe(0);
    expect(entry.value).toBe("0");
  });

  it("sends no idempotency header (Fleetio publishes none for meter entries)", async () => {
    const fetchMock = jest.fn(async () => jsonResponse(201, CREATED));
    global.fetch = fetchMock as unknown as typeof fetch;
    await fleetioCreateMeterEntry(BASE);
    const [, init] = fetchMock.mock.calls[0]! as unknown as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    const headerNames = Object.keys(init.headers).map((h) => h.toLowerCase());
    expect(headerNames.some((h) => h.includes("idempoten"))).toBe(false);
    expect(Object.keys(JSON.parse(init.body))).not.toContain("idempotency_key");
  });
});

describe("fleetioCreateMeterEntry — response validation", () => {
  it("projects the created entry into exactly the bounded subset", async () => {
    global.fetch = jest.fn(async () => jsonResponse(201, CREATED)) as unknown as typeof fetch;
    const entry = await fleetioCreateMeterEntry(BASE);
    expect(Object.keys(entry).sort()).toEqual(
      ["created_at", "date", "id", "meter_type", "value", "vehicle_id", "void"].sort(),
    );
  });

  it("rejects a malformed 2xx (no meter-entry id) without fabricating one", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(201, { value: "1", vehicle_id: 42 }),
    ) as unknown as typeof fetch;
    await expect(fleetioCreateMeterEntry(BASE)).rejects.toBeInstanceOf(FleetioMalformedResponseError);
  });

  it("rejects a 2xx whose id is not a usable Fleetio id", async () => {
    global.fetch = jest.fn(async () => jsonResponse(201, { ...CREATED, id: 0 })) as unknown as typeof fetch;
    await expect(fleetioCreateMeterEntry(BASE)).rejects.toBeInstanceOf(FleetioMalformedResponseError);
  });

  it("rejects a non-JSON 2xx body", async () => {
    global.fetch = jest.fn(async () =>
      new Response("<html/>", { status: 201, headers: { "Content-Type": "text/html" } }),
    ) as unknown as typeof fetch;
    await expect(fleetioCreateMeterEntry(BASE)).rejects.toThrow(/non-JSON/);
  });
});

describe("fleetioCreateMeterEntry — error mapping (credential-free)", () => {
  const cases: Array<[number, string, (e: unknown) => void]> = [
    [401, "bad", (e) => expect(e).toBeInstanceOf(Unauthorized401Error)],
    [403, "nope", (e) => expect(e).toBeInstanceOf(FleetioForbiddenError)],
    [404, "gone", (e) => expect(e).toBeInstanceOf(FleetioNotFoundError)],
  ];
  it.each(cases)("maps %s to its typed error with no credential leak", async (status, body, assertFn) => {
    const fetchMock = jest.fn(async () => new Response(body, { status }));
    global.fetch = fetchMock as unknown as typeof fetch;
    let thrown: unknown;
    try {
      await fleetioCreateMeterEntry(BASE);
    } catch (e) {
      thrown = e;
    }
    assertFn(thrown);
    const message = String((thrown as Error).message);
    expect(message).not.toContain(API_KEY);
    expect(message).not.toContain(ACCOUNT_TOKEN);
    // Exactly one write attempt for every documented failure.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("403 stays a ROLE/permission error — not treated as an invalid credential", async () => {
    global.fetch = jest.fn(async () => new Response("nope", { status: 403 })) as unknown as typeof fetch;
    let thrown: unknown;
    try {
      await fleetioCreateMeterEntry(BASE);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(FleetioForbiddenError);
    expect(thrown).not.toBeInstanceOf(Unauthorized401Error);
    expect(String((thrown as Error).message)).toMatch(/role does not allow/i);
  });

  it("surfaces a 422 sequence/validation error as bounded, credential-free guidance", async () => {
    // Fleetio's documented 422 shape is {errors:{field:[string]}}. A lower /
    // out-of-sequence reading lands here (there is NO 409 for this endpoint).
    global.fetch = jest.fn(async () =>
      jsonResponse(422, {
        errors: { value: ["must fall between the entries logged before and after this date"] },
      }),
    ) as unknown as typeof fetch;
    let thrown: unknown;
    try {
      await fleetioCreateMeterEntry({ ...BASE, value: 1 });
    } catch (e) {
      thrown = e;
    }
    const message = String((thrown as Error).message);
    // Useful guidance survives...
    expect(message).toMatch(/must fall between the entries logged/);
    // ...bounded, and with no credential / header / URL leak.
    expect(message.length).toBeLessThan(300);
    expect(message).not.toContain(API_KEY);
    expect(message).not.toContain(ACCOUNT_TOKEN);
    expect(message).not.toContain("secure.fleetio.com");
    expect(message).not.toContain("Authorization");
  });

  it("truncates an oversized 422 body instead of echoing it whole", async () => {
    const huge = "x".repeat(5000);
    global.fetch = jest.fn(async () =>
      jsonResponse(422, { errors: { value: [huge] } }),
    ) as unknown as typeof fetch;
    let thrown: unknown;
    try {
      await fleetioCreateMeterEntry(BASE);
    } catch (e) {
      thrown = e;
    }
    expect(String((thrown as Error).message).length).toBeLessThan(300);
  });
});

describe("fleetioCreateMeterEntry — WRITE SAFETY (never auto-replayed)", () => {
  it("does NOT auto-retry a 429 (single call, typed rate-limit error)", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse(429, { error: "Too many requests" }, { "Retry-After": "0" }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(fleetioCreateMeterEntry(BASE)).rejects.toBeInstanceOf(FleetioRateLimitError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT auto-retry a 5xx (single call)", async () => {
    const fetchMock = jest.fn(async () => jsonResponse(500, { error: "boom" }));
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(fleetioCreateMeterEntry(BASE)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT auto-retry a network failure (single call)", async () => {
    const fetchMock = jest.fn(async () => {
      throw new TypeError("fetch failed");
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(fleetioCreateMeterEntry(BASE)).rejects.toThrow(/network failure/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a TIMEOUT is a single attempt and does NOT claim the provider made no change", async () => {
    const fetchMock = jest.fn(async () => {
      const err = new Error("The operation was aborted due to timeout");
      err.name = "TimeoutError";
      throw err;
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    let thrown: unknown;
    try {
      await fleetioCreateMeterEntry(BASE);
    } catch (e) {
      thrown = e;
    }
    const message = String((thrown as Error).message);
    expect(message).toMatch(/timed out/);
    // Unknown outcome: the error must NOT assert that nothing was created.
    expect(message).not.toMatch(/not created|no meter entry|nothing was created|no change/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
