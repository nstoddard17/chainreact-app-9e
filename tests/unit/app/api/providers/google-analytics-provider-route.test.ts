/**
 * @jest-environment node
 *
 * Slice 3.GOOGLE-ANALYTICS-4 — GA4 provider-route coverage.
 *
 * GET /api/providers/google-analytics/actions returns the 6 actions in
 * display order with the full wire shape; GET .../triggers returns [];
 * the providers index marks google-analytics hasMetadata=true.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

import { GET as getProviders } from "@/app/api/providers/route";
import { GET as getActions } from "@/app/api/providers/[id]/actions/route";
import { GET as getTriggers } from "@/app/api/providers/[id]/triggers/route";

beforeEach(() => {
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
});

interface WireField {
  name: string;
  type: string;
  required: boolean;
  optionsSource?: string;
  dependsOn?: string;
  options?: Array<{ value: string; label: string }>;
}
interface WireAction {
  key: string;
  category: string;
  requiresIntegration: boolean;
  isDestructive: boolean;
  riskLevel: string;
  fields: WireField[];
  outputs: Array<{ name: string; type: string; sensitive?: boolean }>;
}

async function fetchActions(): Promise<WireAction[]> {
  const res = await getActions(new Request("http://x/google-analytics/actions"), {
    params: Promise.resolve({ id: "google-analytics" }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { provider: string; actions: WireAction[] };
  expect(body.provider).toBe("google-analytics");
  return body.actions;
}

describe("GET /api/providers/google-analytics/actions", () => {
  it("returns the 6-action surface in display order", async () => {
    const actions = await fetchActions();
    expect(actions.map((a) => a.key)).toEqual([
      "google-analytics:run_report",
      "google-analytics:run_pivot_report",
      "google-analytics:get_realtime_data",
      "google-analytics:find_conversion",
      "google-analytics:send_event",
      "google-analytics:create_conversion_event",
    ]);
  });

  it("every action requiresIntegration + category data + non-destructive", async () => {
    for (const a of await fetchActions()) {
      expect(a.requiresIntegration).toBe(true);
      expect(a.category).toBe("data");
      expect(a.isDestructive).toBe(false);
    }
  });

  it("serializes the account → property cascade", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    const rr = byKey.get("google-analytics:run_report")!;
    const account = rr.fields.find((f) => f.name === "accountId")!;
    const property = rr.fields.find((f) => f.name === "propertyId")!;
    expect(account.optionsSource).toBe("google-analytics:accounts");
    expect(account.dependsOn).toBeUndefined();
    expect(property.optionsSource).toBe("google-analytics:properties");
    expect(property.dependsOn).toBe("accountId");
  });

  it("serializes the send_event data-stream cascade + apiSecret as a text field (not an output)", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    const se = byKey.get("google-analytics:send_event")!;
    const measurement = se.fields.find((f) => f.name === "measurementId")!;
    expect(measurement.optionsSource).toBe("google-analytics:data_streams");
    expect(measurement.dependsOn).toBe("propertyId");
    const apiSecret = se.fields.find((f) => f.name === "apiSecret")!;
    expect(apiSecret.type).toBe("text");
    expect(apiSecret.required).toBe(true);
    expect(se.outputs.map((o) => o.name)).not.toContain("apiSecret");
    expect(se.riskLevel).toBe("medium");
  });

  it("serializes static enum options + sensitive output flags", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    const rr = byKey.get("google-analytics:run_report")!;
    const dr = rr.fields.find((f) => f.name === "dateRange")!;
    expect(dr.type).toBe("select");
    expect(dr.options?.some((o) => o.value === "custom")).toBe(true);
    expect(rr.outputs.find((o) => o.name === "rows")!.sensitive).toBe(true);
  });
});

describe("GET /api/providers/google-analytics/triggers", () => {
  it("returns [] (triggers deferred — D-GA3)", async () => {
    const res = await getTriggers(new Request("http://x/google-analytics/triggers"), {
      params: Promise.resolve({ id: "google-analytics" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { provider: string; triggers: unknown[] };
    expect(body.provider).toBe("google-analytics");
    expect(body.triggers).toEqual([]);
  });
});

describe("GET /api/providers — google-analytics hasMetadata", () => {
  it("marks google-analytics hasMetadata=true now that GA-4 shipped its action metas", async () => {
    const res = await getProviders();
    const body = (await res.json()) as { providers: Array<{ id: string; hasMetadata: boolean }> };
    const ga = body.providers.find((p) => p.id === "google-analytics");
    expect(ga).toBeDefined();
    expect(ga?.hasMetadata).toBe(true);
  });
});
