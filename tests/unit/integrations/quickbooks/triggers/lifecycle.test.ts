/**
 * @jest-environment node
 *
 * QUICKBOOKS-1 — app-level trigger lifecycle + realm filter:
 * activation stores the interest-row config patch (NO provider call),
 * deactivation is a no-op, and the P-S2 realm filter fails closed.
 */
import type { IntegrationRecord } from "@/repositories/integrations";
import type { WorkflowNode } from "@/contracts/workflowDefinition";
import {
  quickbooksAppLevelActivate,
  quickbooksAppLevelDeactivate,
} from "@/integrations/quickbooks/triggers/_shared/lifecycle";
import { makeQuickbooksRealmFilter } from "@/integrations/quickbooks/triggers/_shared/filter";
import type { TriggerEvent } from "@/contracts/triggerEvent";

function integration(overrides: Partial<IntegrationRecord> = {}) {
  return {
    id: "int-1",
    accountId: "acct-1",
    provider: "quickbooks",
    providerAccountId: "913035",
    ...overrides,
  } as IntegrationRecord;
}

const NODE = { id: "n1", config: {} } as unknown as WorkflowNode;

function event(overrides: Partial<TriggerEvent> = {}): TriggerEvent {
  return {
    provider: "quickbooks",
    eventType: "invoice_created",
    eventId: "invoice_created:913035:145",
    occurredAt: "2026-07-07T12:00:00Z",
    providerAccountId: "913035",
    payload: {},
    ...overrides,
  };
}

describe("activation", () => {
  it("returns the interest-row patch with the integration's realm — NO provider call", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    const patch = await quickbooksAppLevelActivate({
      node: NODE,
      integration: integration(),
      workflowId: "wf-1",
    });
    expect(patch).toEqual({ appLevelWebhook: true, realmId: "913035" });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("fails loudly on a corrupted row without a realmId", async () => {
    await expect(
      quickbooksAppLevelActivate({
        node: NODE,
        integration: integration({ providerAccountId: "" }),
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/realmId/);
  });
});

describe("deactivation", () => {
  it("is a no-op (removing the trigger_resources row IS the interest removal)", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    await expect(
      quickbooksAppLevelDeactivate({
        trigger: {} as never,
        integration: integration(),
      }),
    ).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("realm filter (P-S2, fail-closed)", () => {
  const filter = makeQuickbooksRealmFilter("invoice_created");

  it("matches when the activated realm equals the event's company", () => {
    const config = filter.parseConfig({
      appLevelWebhook: true,
      realmId: "913035",
    });
    expect(filter.evaluate(event(), config)).toEqual({ kind: "match" });
  });

  it("no-match for another company's events (cross-realm isolation)", () => {
    const config = filter.parseConfig({ realmId: "222" });
    const result = filter.evaluate(event(), config);
    expect(result.kind).toBe("no-match");
  });

  it("fails CLOSED: config missing realmId throws in parseConfig", () => {
    expect(() => filter.parseConfig({ appLevelWebhook: true })).toThrow();
    expect(() => filter.parseConfig({ realmId: "" })).toThrow();
  });
});
