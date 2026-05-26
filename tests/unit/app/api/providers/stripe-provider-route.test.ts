/**
 * @jest-environment node
 *
 * Slice 4.STRIPE-TRIGGER-META-2 — Stripe provider-route coverage.
 * Closes the single launch blocker identified by PROVIDER-AUDIT-1 §2.1.
 *
 * GET /api/providers/stripe/actions still returns the 16-action surface
 * after the sub-registry refactor (regression guard); GET .../triggers
 * NOW returns the event_received webhook trigger with the full wire shape
 * (enabledEvents combobox+multiple+required with 18 static options including
 * the 3 failed-payment events; data + previousAttributes sensitive); the
 * providers index still reports stripe.hasMetadata=true. No provider API
 * calls (pure registry read).
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
  multiple?: boolean;
  defaultValue?: unknown;
  optionsSource?: string;
  options?: Array<{ value: string; label: string; description?: string }>;
}
interface WireOutput {
  name: string;
  type: string;
  sensitive?: boolean;
}
interface WireAction {
  key: string;
  category: string;
  requiresIntegration: boolean;
  isDestructive: boolean;
  requiresConfirmation: boolean;
  riskLevel: string;
  fields: WireField[];
  outputs: WireOutput[];
}

async function fetchActions(): Promise<WireAction[]> {
  const res = await getActions(new Request("http://x/stripe/actions"), {
    params: Promise.resolve({ id: "stripe" }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { provider: string; actions: WireAction[] };
  expect(body.provider).toBe("stripe");
  return body.actions;
}

describe("GET /api/providers/stripe/actions — sub-registry refactor regression guard", () => {
  it("still returns the full 16-action surface after the sub-registry refactor", async () => {
    const actions = await fetchActions();
    expect(actions).toHaveLength(16);
  });

  it("returns all 16 stripe action keys after the sub-registry refactor", async () => {
    const keys = (await fetchActions()).map((a) => a.key).sort();
    expect(keys).toEqual(
      [
        "stripe:cancel_subscription",
        "stripe:capture_payment_intent",
        "stripe:confirm_payment_intent",
        "stripe:create_checkout_session",
        "stripe:create_customer",
        "stripe:create_invoice",
        "stripe:create_payment_intent",
        "stripe:create_payment_link",
        "stripe:create_refund",
        "stripe:create_subscription",
        "stripe:find_customer",
        "stripe:find_payment_intent",
        "stripe:find_subscription",
        "stripe:get_payments",
        "stripe:update_customer",
        "stripe:update_subscription",
      ].sort(),
    );
  });

  it("every action requiresIntegration + category commerce", async () => {
    for (const a of await fetchActions()) {
      expect(a.requiresIntegration).toBe(true);
      expect(a.category).toBe("commerce");
    }
  });
});

interface WireTrigger {
  key: string;
  type: string;
  activation: string;
  requiresIntegration: boolean;
  category: string;
  fields: WireField[];
  payloadShape: Array<{ name: string; type: string; sensitive?: boolean }>;
}

async function fetchTriggers(): Promise<WireTrigger[]> {
  const res = await getTriggers(new Request("http://x/stripe/triggers"), {
    params: Promise.resolve({ id: "stripe" }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { provider: string; triggers: WireTrigger[] };
  expect(body.provider).toBe("stripe");
  return body.triggers;
}

describe("GET /api/providers/stripe/triggers — launch blocker closed", () => {
  it("returns the event_received webhook trigger (was [] before STRIPE-TRIGGER-META-2)", async () => {
    const triggers = await fetchTriggers();
    expect(triggers.map((t) => t.key)).toEqual(["stripe:event_received"]);
    const t = triggers[0]!;
    expect(t.activation).toBe("webhook");
    expect(t.requiresIntegration).toBe(true);
    expect(t.category).toBe("commerce");
  });

  it("exposes the `enabledEvents` combobox+multiple+required config field with 18 static options", async () => {
    const t = (await fetchTriggers())[0]!;
    expect(t.fields.map((f) => f.name)).toEqual(["enabledEvents"]);
    const f = t.fields[0]!;
    expect(f.type).toBe("combobox");
    expect(f.multiple).toBe(true);
    expect(f.required).toBe(true);
    expect(f.optionsSource).toBeUndefined();
    expect(f.options).toBeDefined();
    expect(f.options).toHaveLength(18);
  });

  it("includes the 3 failed-payment event options (closes the canonical Stripe → Slack DM use case)", async () => {
    const t = (await fetchTriggers())[0]!;
    const values = t.fields[0]!.options!.map((o) => o.value);
    expect(values).toContain("payment_intent.payment_failed");
    expect(values).toContain("charge.failed");
    expect(values).toContain("invoice.payment_failed");
  });

  it("data + previousAttributes payload fields serialize sensitive", async () => {
    const t = (await fetchTriggers())[0]!;
    const byName = new Map(t.payloadShape.map((p) => [p.name, p]));
    expect(byName.get("data")!.sensitive).toBe(true);
    expect(byName.get("previousAttributes")!.sensitive).toBe(true);
    expect(byName.get("stripeEventType")!.sensitive).not.toBe(true);
    expect(byName.get("created")!.sensitive).not.toBe(true);
  });
});

describe("GET /api/providers — stripe hasMetadata (already true; this guards the refactor)", () => {
  it("stripe.hasMetadata=true is preserved after the sub-registry refactor", async () => {
    const res = await getProviders();
    const body = (await res.json()) as {
      providers: Array<{ id: string; hasMetadata: boolean }>;
    };
    const stripe = body.providers.find((p) => p.id === "stripe");
    expect(stripe).toBeDefined();
    expect(stripe?.hasMetadata).toBe(true);
  });
});
