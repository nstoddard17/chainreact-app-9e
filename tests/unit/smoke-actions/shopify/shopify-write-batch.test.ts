/**
 * @jest-environment node
 *
 * Write smoke harness — Shopify write lifecycle batch (11 actions).
 *
 * Drives each fixture through the pure `runWriteSmoke` orchestrator over a FAKE
 * boundary. Protects the contracts that matter:
 *   - every verify goes through the shopify per-resource state seams (Shopify
 *     registers NO read actions);
 *   - create_order's numeric line-item variant_id resolves via the
 *     {{env.*:number}} whole-token modifier (a NUMBER reaches the config, not a
 *     string) — plus the modifier's guard rails (non-numeric stays literal);
 *   - order fixtures cancel via the registered update_order_status action
 *     where Shopify permits (create_order / add_order_note -> archived);
 *     update_order_status proves cancelled==true; create_fulfillment proves
 *     fulfillmentStatus fulfilled and honestly leaves the fulfilled order;
 *   - update_inventory is a pure state mutation on the dev-test-staged tracked
 *     item (no captures; artifact "none");
 *   - suffix-pinned updates (product title, variant sku, customer first name)
 *     cannot vacuously pass on the setup value;
 *   - wrong/absent read-backs are VERIFY_FAILED; missing env gates BLOCKED_ENV.
 */
import type { ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import {
  ResourceLedger,
  resolveStepConfig,
  runWriteSmoke,
  type StepRunOutcome,
  type WriteHarnessDeps,
} from "@/tests/smoke-actions/writeHarness";

const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true } as const;
const MARKER = "crsmoke-T1-";
const ORDER_VARIANT = "777001";
const INV_ITEM = "888001";
const LOCATION = "999001";

const env = (n: string): string | undefined =>
  n === "SMOKE_SHOPIFY_CONNECTED"
    ? "true"
    : n === "SMOKE_SHOPIFY_ORDER_VARIANT_ID"
      ? ORDER_VARIANT
      : n === "SMOKE_SHOPIFY_INVENTORY_ITEM_ID"
        ? INV_ITEM
        : n === "SMOKE_SHOPIFY_LOCATION_ID"
          ? LOCATION
          : undefined;

const fixtureFor = (key: string): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === key)!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

function depsWith(reads: Record<string, Record<string, unknown>> = {}): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  return {
    calls,
    async runActionStep(input): Promise<StepRunOutcome> {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      switch (input.action) {
        case "create_product":
          return { ok: true, output: { productId: 101, variantId: 201, title: input.config.title }, reason: null };
        case "update_product":
          return { ok: true, output: { success: true, productId: 101, title: input.config.title }, reason: null };
        case "create_product_variant":
          return { ok: true, output: { success: true, variantId: 202, productId: 101, sku: input.config.sku }, reason: null };
        case "update_product_variant":
          return { ok: true, output: { success: true, variantId: 201, sku: input.config.sku }, reason: null };
        case "create_customer":
          return { ok: true, output: { customerId: 301, email: input.config.email }, reason: null };
        case "update_customer":
          return { ok: true, output: { success: true, customerId: 301 }, reason: null };
        case "create_order":
          return { ok: true, output: { orderId: 401, email: input.config.email, totalPrice: "0.00" }, reason: null };
        case "update_order_status":
          return { ok: true, output: { success: true, orderId: 401, status: "cancelled" }, reason: null };
        case "add_order_note":
          return { ok: true, output: { success: true, orderId: 401, note: input.config.note }, reason: null };
        case "create_fulfillment":
          return { ok: true, output: { success: true, fulfillmentId: 501, orderId: 401, status: "success" }, reason: null };
        case "update_inventory":
          return { ok: true, output: { success: true, inventoryItemId: Number(INV_ITEM), locationId: Number(LOCATION), newQuantity: input.config.quantity }, reason: null };
        default:
          return { ok: false, output: null, reason: `no plan for ${input.action}` };
      }
    },
    async smokeReadBack(input): Promise<StepRunOutcome> {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (reads[input.action]) return { ok: true, output: reads[input.action]!, reason: null };
      switch (input.action) {
        case "product_state":
          return {
            ok: true,
            output: {
              found: true,
              title: `${MARKER}updated product - safe to delete`,
              status: "active",
              variants: [{ id: 201, sku: `${MARKER}sku`, price: "0.00", option1: `${MARKER}opt` }],
              variantCount: 2,
            },
            reason: null,
          };
        case "variant_state":
          return { ok: true, output: { found: true, sku: `${MARKER}updsku`, price: "0.00", option1: "Default Title", inventoryItemId: Number(INV_ITEM) }, reason: null };
        case "customer_state":
          return { ok: true, output: { found: true, email: `${MARKER}cust@example.com`, firstName: `${MARKER}updated`, tags: "crsmoke" }, reason: null };
        case "order_state":
          return {
            ok: true,
            output: { found: true, email: `${MARKER}order@example.com`, note: `${MARKER}note - safe to ignore`, tags: "crsmoke", financialStatus: "pending", fulfillmentStatus: "fulfilled", cancelled: true },
            reason: null,
          };
        case "inventory_level":
          return { ok: true, output: { found: true, available: 7 }, reason: null };
        default:
          return { ok: false, output: null, reason: "no plan" };
      }
    },
  };
}

// ─── The :number whole-token modifier ────────────────────────────────────────

describe("resolveStepConfig {{...:number}} modifier", () => {
  const ledger = new ResourceLedger();
  ledger.record({ resourceKey: "variant", provider: "shopify", kind: "variant", externalId: "123456", marker: MARKER });

  it("substitutes a NUMBER for a whole-string env token", () => {
    const out = resolveStepConfig(
      { line_items: [{ variant_id: "{{env.SMOKE_SHOPIFY_ORDER_VARIANT_ID:number}}", quantity: 1 }] },
      MARKER,
      ledger,
      env,
    ) as { line_items: Array<{ variant_id: unknown; quantity: unknown }> };
    expect(out.line_items[0]!.variant_id).toBe(Number(ORDER_VARIANT));
    expect(typeof out.line_items[0]!.variant_id).toBe("number");
    expect(out.line_items[0]!.quantity).toBe(1);
  });

  it("substitutes a NUMBER for a whole-string ledger token", () => {
    const out = resolveStepConfig({ variant_id: "{{ledger.variant.id:number}}" }, MARKER, ledger, env) as {
      variant_id: unknown;
    };
    expect(out.variant_id).toBe(123456);
  });

  it("leaves the literal token when the value is missing or non-numeric (loud failure)", () => {
    const out = resolveStepConfig(
      { a: "{{env.SMOKE_UNSET:number}}", b: "{{ledger.nope.id:number}}" },
      MARKER,
      ledger,
      env,
    ) as { a: unknown; b: unknown };
    expect(out.a).toBe("{{env.SMOKE_UNSET:number}}");
    expect(out.b).toBe("{{ledger.nope.id:number}}");
  });

  it("does NOT touch plain tokens (numeric-looking ids stay strings)", () => {
    const out = resolveStepConfig({ boardId: "{{ledger.variant.id}}" }, MARKER, ledger, env) as { boardId: unknown };
    expect(out.boardId).toBe("123456");
    expect(typeof out.boardId).toBe("string");
  });
});

// ─── Shape ───────────────────────────────────────────────────────────────────

describe("shopify write batch — shape", () => {
  it("every fixture verifies via a shopify smoke seam (no registered reads exist)", () => {
    for (const key of [
      "shopify:create_product", "shopify:update_product", "shopify:create_product_variant",
      "shopify:update_product_variant", "shopify:create_customer", "shopify:update_customer",
      "shopify:create_order", "shopify:update_order_status", "shopify:add_order_note",
      "shopify:create_fulfillment", "shopify:update_inventory",
    ] as const) {
      const f = fixtureFor(key);
      expect(f.writeHarness?.verify?.smokeRead).toBe(true);
      expect(f.writeHarness?.verify?.provider).toBe("shopify");
    }
  });

  it("order cleanups use the registered cancel; consent gates are explicit false", () => {
    for (const key of ["shopify:create_order", "shopify:add_order_note"] as const) {
      const f = fixtureFor(key);
      expect(f.writeHarness?.cleanup?.action).toBe("update_order_status");
      expect(f.writeHarness?.cleanup?.config.action).toBe("cancel");
      expect(f.writeHarness?.cleanup?.config.notify_customer).toBe(false);
      expect(f.writeHarness?.cleanupKind).toBe("archive");
    }
    expect(fixtureFor("shopify:create_customer").config.send_welcome_email).toBe(false);
    expect(fixtureFor("shopify:create_order").config.send_receipt).toBe(false);
  });

  it("suffix-pinned updates cannot vacuously pass on setup values", () => {
    expect(fixtureFor("shopify:update_product").writeHarness?.verify?.markerSuffix).toBe("updated");
    expect(fixtureFor("shopify:update_product_variant").writeHarness?.verify?.markerSuffix).toBe("updsku");
    expect(fixtureFor("shopify:update_customer").writeHarness?.verify?.markerSuffix).toBe("updated");
  });
});

// ─── Flows ───────────────────────────────────────────────────────────────────

describe("shopify write batch — flows", () => {
  it("create_order: numeric variant_id reaches the engine; cancel cleanup archives", async () => {
    const deps = depsWith();
    const r = await runWriteSmoke(fixtureFor("shopify:create_order"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("archived");
    const exec = deps.calls.find((c) => c.action === "create_order");
    const li = (exec?.config.line_items as Array<{ variant_id: unknown }>)[0]!;
    expect(li.variant_id).toBe(Number(ORDER_VARIANT));
    expect(typeof li.variant_id).toBe("number");
    const cancel = deps.calls.find((c) => c.action === "update_order_status");
    expect(cancel?.config.order_id).toBe("401");
  });

  it("update_order_status: proves cancelled==true; cancelled order honestly left", async () => {
    const deps = depsWith();
    const r = await runWriteSmoke(fixtureFor("shopify:update_order_status"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("left");
  });

  it("update_order_status: a read-back with cancelled=false is VERIFY_FAILED", async () => {
    const deps = depsWith({
      order_state: { found: true, email: `${MARKER}cancel@example.com`, note: "", tags: "", financialStatus: "pending", fulfillmentStatus: null, cancelled: false },
    });
    const r = await runWriteSmoke(fixtureFor("shopify:update_order_status"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("create_fulfillment: proves fulfillmentStatus fulfilled; fulfilled order left", async () => {
    const deps = depsWith({
      order_state: { found: true, email: `${MARKER}fulfill@example.com`, note: "", tags: "", financialStatus: "pending", fulfillmentStatus: "fulfilled", cancelled: false },
    });
    const r = await runWriteSmoke(fixtureFor("shopify:create_fulfillment"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("left");
    expect(r.ledger.created).toBe(2); // order + fulfillment
  });

  it("update_inventory: pure state mutation, no captures, expectEquals available", async () => {
    const deps = depsWith();
    const r = await runWriteSmoke(fixtureFor("shopify:update_inventory"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("none");
    expect(r.ledger.created).toBe(0);
    const verify = deps.calls.find((c) => c.action === "inventory_level");
    expect(verify?.config.inventoryItemId).toBe(INV_ITEM);
  });

  it("update_inventory: a wrong available count is VERIFY_FAILED", async () => {
    const deps = depsWith({ inventory_level: { found: true, available: 3 } });
    const r = await runWriteSmoke(fixtureFor("shopify:update_inventory"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("product/customer lifecycles: PASS with marker read-backs; artifacts left", async () => {
    for (const key of [
      "shopify:create_product", "shopify:update_product", "shopify:create_product_variant",
      "shopify:update_product_variant", "shopify:create_customer", "shopify:update_customer",
    ] as const) {
      const r = await runWriteSmoke(fixtureFor(key), { ...RUN, envLookup: env }, depsWith());
      expect({ key, status: r.status }).toEqual({ key, status: "PASS" });
      expect(r.artifact).toBe("left");
    }
  });

  it("create_product: a read-back without the marker is VERIFY_FAILED", async () => {
    const deps = depsWith({
      product_state: { found: true, title: "Someone elses product", status: "active", variants: [], variantCount: 0 },
    });
    const r = await runWriteSmoke(fixtureFor("shopify:create_product"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("order fixtures gate BLOCKED_ENV without the staged variant env", async () => {
    const deps = depsWith();
    const noVariant = (n: string): string | undefined =>
      n === "SMOKE_SHOPIFY_ORDER_VARIANT_ID" ? undefined : env(n);
    const r = await runWriteSmoke(fixtureFor("shopify:create_order"), { ...RUN, envLookup: noVariant }, deps);
    expect(r.status).toBe("BLOCKED_ENV");
    expect(deps.calls).toHaveLength(0);
  });
});
