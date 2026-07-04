/**
 * @jest-environment node
 *
 * Discovery-surface tests for Asana — Slice 5.ASANA-1.
 *
 * Asserts the builder/AI-visible catalog is complete + consistent:
 * 5 action metas, 2 trigger metas, key format, options-source wiring
 * against the real resolver registry, activation/deactivation hook
 * registration, and the sensitive/risk posture of the outputs.
 */
import {
  getActionMeta,
  getTriggerMeta,
  listActionMetasForProvider,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";
import { getOptionsResolver } from "@/services/options/_registry";
import {
  findActivation,
} from "@/services/triggers/activationRegistry";
import { findDeactivation } from "@/services/triggers/deactivationRegistry";
import { getTriggerFilter } from "@/core/triggers/filterRegistry";
import { getActionHandler } from "@/services/execution/handlers/_registry";
// Side-effect: register the trigger hooks like every prod entrypoint does.
import "@/integrations/_registry";

const ACTION_KEYS = [
  "asana:create_task",
  "asana:update_task",
  "asana:complete_task",
  "asana:add_comment_to_task",
  "asana:get_task",
] as const;

const TRIGGER_KEYS = [
  "asana:new_task_in_project",
  "asana:task_updated_in_project",
] as const;

describe("asana action discovery", () => {
  it("registers exactly the 5 first-slice action metas", () => {
    const metas = listActionMetasForProvider("asana");
    expect(metas.map((m) => m.key).sort()).toEqual([...ACTION_KEYS].sort());
  });

  it("every meta has a registered handler and vice versa (1:1)", () => {
    for (const key of ACTION_KEYS) {
      expect(getActionMeta(key)).toBeDefined();
      const [provider, type] = key.split(":") as [string, string];
      expect(getActionHandler(provider, type)).toBeDefined();
    }
  });

  it("every dynamic field's optionsSource resolves in the options registry", () => {
    for (const meta of listActionMetasForProvider("asana")) {
      for (const field of meta.fields) {
        if (field.optionsSource) {
          expect(getOptionsResolver(field.optionsSource)).toBeDefined();
        }
      }
    }
  });

  it("marks free-form content + access-bearing URLs sensitive", () => {
    const get = getActionMeta("asana:get_task")!;
    const byName = new Map(get.outputs.map((o) => [o.name, o]));
    expect(byName.get("taskName")?.sensitive).toBe(true);
    expect(byName.get("notes")?.sensitive).toBe(true);
    expect(byName.get("assigneeName")?.sensitive).toBe(true);
    expect(byName.get("permalinkUrl")?.sensitive).toBe(true);
    // Opaque gids are NOT sensitive.
    expect(byName.get("taskGid")?.sensitive).toBeUndefined();
  });

  it("write actions are medium-risk, get_task is low, nothing destructive", () => {
    for (const key of ACTION_KEYS) {
      const meta = getActionMeta(key)!;
      expect(meta.isDestructive).toBe(false);
      expect(meta.requiresConfirmation).toBe(false);
      expect(meta.riskLevel).toBe(key === "asana:get_task" ? "low" : "medium");
      expect(meta.requiresIntegration).toBe(true);
    }
  });
});

describe("asana trigger discovery", () => {
  it("registers exactly the 2 project-webhook trigger metas", () => {
    const metas = listTriggerMetasForProvider("asana");
    expect(metas.map((m) => m.key).sort()).toEqual([...TRIGGER_KEYS].sort());
    for (const meta of metas) {
      expect(meta.activation).toBe("webhook");
      expect(meta.requiresIntegration).toBe(true);
    }
  });

  it("both triggers have activation + deactivation hooks + a P-S2 project filter registered", () => {
    for (const key of TRIGGER_KEYS) {
      const [provider, type] = key.split(":") as [string, string];
      expect(findActivation(provider, type)).not.toBeNull();
      expect(findDeactivation(provider, type)).not.toBeNull();
      expect(getTriggerFilter(provider, type)).not.toBeNull();
    }
  });

  it("payload shapes are compact gid-only contracts (no free-form content fields)", () => {
    for (const key of TRIGGER_KEYS) {
      const meta = getTriggerMeta(key)!;
      const names = meta.payloadShape.map((p) => p.name).sort();
      expect(names).toEqual(
        [
          "changeKind",
          "taskGid",
          "projectGid",
          "actorGid",
          "action",
          "resourceSubtype",
          "createdAt",
        ].sort(),
      );
      // Nothing sensitive — compact events carry no user content.
      expect(meta.payloadShape.some((p) => p.sensitive === true)).toBe(false);
    }
  });

  it("trigger config fields cascade workspace → project via real resolvers", () => {
    for (const key of TRIGGER_KEYS) {
      const meta = getTriggerMeta(key)!;
      const project = meta.fields.find((f) => f.name === "projectId")!;
      expect(project.required).toBe(true);
      expect(project.optionsSource).toBe("asana:projects");
      expect(getOptionsResolver("asana:projects")).toBeDefined();
    }
  });
});
