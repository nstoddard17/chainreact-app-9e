/**
 * @jest-environment node
 *
 * core/workflows/templateCardMeta (CS-XT-MARKETPLACE-UX). Pure derivation of credential-free
 * browse metadata from a template definition. Proves: node/step counts, trigger-kind detection,
 * non-native provider extraction in graph order, edge-walk preview ordering, the category
 * heuristic, the label helpers, and the no-config-leak guarantee (config values never surface).
 */
import type { TemplateDefinition } from "@/contracts/workflowTemplate";
import {
  deriveTemplateCardMeta,
  providerLabel,
  humanizeType,
  stepLabel,
  categoryLabel,
  TRIGGER_KIND_LABELS,
  TEMPLATE_CATEGORIES,
} from "@/core/workflows/templateCardMeta";

function def(
  trigger: { provider: string; type: string },
  actions: Array<{ provider: string; type: string }>,
  opts: { config?: Record<string, unknown> } = {},
): TemplateDefinition {
  const nodes = [
    { id: "trigger", kind: "trigger", provider: trigger.provider, type: trigger.type, position: { x: 400, y: 100 }, config: opts.config ?? {} },
    ...actions.map((a, i) => ({
      id: `a${i + 1}`,
      kind: "action",
      provider: a.provider,
      type: a.type,
      position: { x: 400, y: 280 + i * 180 },
      config: opts.config ?? {},
    })),
  ];
  const edges = nodes.slice(0, -1).map((n, i) => ({ id: `e${i + 1}`, from: n.id, to: nodes[i + 1]!.id }));
  return { nodes, edges } as unknown as TemplateDefinition;
}

describe("deriveTemplateCardMeta — counts + trigger kind", () => {
  it("counts nodes and steps (steps exclude the trigger)", () => {
    const m = deriveTemplateCardMeta(def({ provider: "gmail", type: "new_email" }, [{ provider: "slack", type: "send_channel_message" }]));
    expect(m.nodeCount).toBe(2);
    expect(m.stepCount).toBe(1);
  });

  it("detects manual / scheduled / app trigger kinds", () => {
    expect(deriveTemplateCardMeta(def({ provider: "native", type: "manual.run" }, [{ provider: "gmail", type: "create_draft" }])).triggerKind).toBe("manual");
    expect(deriveTemplateCardMeta(def({ provider: "native", type: "schedule.fired" }, [{ provider: "slack", type: "send_channel_message" }])).triggerKind).toBe("scheduled");
    expect(deriveTemplateCardMeta(def({ provider: "stripe", type: "event_received" }, [{ provider: "slack", type: "send_channel_message" }])).triggerKind).toBe("app");
  });
});

describe("deriveTemplateCardMeta — providers + preview ordering", () => {
  it("lists distinct NON-native providers in graph order", () => {
    const m = deriveTemplateCardMeta(def({ provider: "native", type: "schedule.fired" }, [
      { provider: "google-analytics", type: "run_report" },
      { provider: "slack", type: "send_channel_message" },
    ]));
    expect(m.providers).toEqual(["google-analytics", "slack"]); // native excluded
  });

  it("orders preview steps by following edges from the trigger", () => {
    const m = deriveTemplateCardMeta(def({ provider: "gmail", type: "new_email" }, [
      { provider: "hubspot", type: "create_contact" },
      { provider: "slack", type: "send_channel_message" },
    ]));
    expect(m.steps.map((s) => `${s.kind}:${s.provider}:${s.type}`)).toEqual([
      "trigger:gmail:new_email",
      "action:hubspot:create_contact",
      "action:slack:send_channel_message",
    ]);
  });
});

describe("deriveTemplateCardMeta — category heuristic", () => {
  const cases: Array<[string, TemplateDefinition, string]> = [
    ["GA wins → reporting", def({ provider: "native", type: "schedule.fired" }, [{ provider: "google-analytics", type: "run_report" }, { provider: "slack", type: "send_channel_message" }]), "reporting"],
    ["shopify → ecommerce", def({ provider: "shopify", type: "webhook_received" }, [{ provider: "slack", type: "send_channel_message" }]), "ecommerce"],
    ["hubspot beats slack → sales-crm", def({ provider: "hubspot", type: "webhook_received" }, [{ provider: "slack", type: "send_channel_message" }]), "sales-crm"],
    ["mailchimp → marketing", def({ provider: "mailchimp", type: "campaign_created" }, [{ provider: "slack", type: "send_channel_message" }]), "marketing"],
    ["github → dev-engineering", def({ provider: "github", type: "new_commit" }, [{ provider: "trello", type: "create_card" }]), "dev-engineering"],
    ["trello → project-management", def({ provider: "trello", type: "new_card" }, [{ provider: "gmail", type: "create_draft" }]), "project-management"],
    ["drive → files-docs", def({ provider: "google-drive", type: "file_changed" }, [{ provider: "google-drive", type: "move_file" }]), "files-docs"],
    ["slack-only → team-ops", def({ provider: "slack", type: "channel_created" }, [{ provider: "slack", type: "send_direct_message" }]), "team-ops"],
    ["scheduled, no business provider → reporting", def({ provider: "native", type: "schedule.fired" }, [{ provider: "google-sheets", type: "append_row" }]), "reporting"],
    ["manual, generic → personal-productivity", def({ provider: "native", type: "manual.run" }, [{ provider: "google-sheets", type: "append_row" }]), "personal-productivity"],
  ];
  it.each(cases)("%s", (_label, d, expected) => {
    expect(deriveTemplateCardMeta(d).category).toBe(expected);
  });

  it("only ever returns a registered category key", () => {
    const keys = new Set(TEMPLATE_CATEGORIES.map((c) => c.key));
    for (const [, d] of cases) expect(keys.has(deriveTemplateCardMeta(d).category)).toBe(true);
  });
});

describe("no-leak: config values never surface in derived metadata", () => {
  it("ignores config entirely (only provider/type/kind are read)", () => {
    const m = deriveTemplateCardMeta(
      def({ provider: "slack", type: "send_channel_message" }, [{ provider: "gmail", type: "send_email" }], {
        config: { channel: "C0SECRET", to: "vp@acme.com", botToken: "xoxb-leak-123456" },
      }),
    );
    const blob = JSON.stringify(m);
    expect(blob).not.toMatch(/C0SECRET/);
    expect(blob).not.toMatch(/vp@acme\.com/);
    expect(blob).not.toMatch(/xoxb-leak/);
    // steps carry only the public node identity, never config keys/values.
    for (const s of m.steps) expect(Object.keys(s).sort()).toEqual(["kind", "provider", "type"]);
  });
});

describe("label helpers", () => {
  it("provider labels are friendly, with a prettified fallback for unknown ids", () => {
    expect(providerLabel("github")).toBe("GitHub");
    expect(providerLabel("microsoft-teams")).toBe("Microsoft Teams");
    expect(providerLabel("some-new-app")).toBe("Some New App");
  });
  it("humanizes action/trigger types", () => {
    expect(humanizeType("send_channel_message")).toBe("Send channel message");
    expect(humanizeType("schedule.fired")).toBe("Schedule fired");
  });
  it("builds a step label and resolves category + trigger-kind labels", () => {
    expect(stepLabel({ kind: "action", provider: "slack", type: "send_channel_message" })).toBe("Slack: Send channel message");
    expect(categoryLabel("sales-crm")).toBe("Sales & CRM");
    expect(TRIGGER_KIND_LABELS.scheduled).toBe("Scheduled");
  });
});
