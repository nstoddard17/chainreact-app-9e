/**
 * @jest-environment node
 *
 * SUPABASE-TABLE-TYPING-1B — the runtime contract for `workflow_runs`' broad
 * columns.
 *
 * `trigger_event` is what the engine REPLAYS: the variable resolver reads it and
 * dedup keys off `provider` + `eventId`. The generated type is `Json`, which
 * carries no field information, and the repositories previously asserted the
 * shape through a handwritten row interface. These tests pin the fail-closed
 * behaviour — including that a provider payload never reaches an error message.
 */
import {
  WORKFLOW_RUN_BILLING_STATUSES,
  WORKFLOW_RUN_TRIGGERED_BY,
  parseErrorClassification,
  parseFatalError,
  parseRunSteps,
  parseTriggerEvent,
} from "@/core/database/workflowRunColumns";
import { narrowColumn, narrowNullableColumn } from "@/core/database/columnNarrowing";

const WEBHOOK_EVENT = {
  provider: "slack",
  eventType: "message_received",
  eventId: "Ev123",
  occurredAt: "2026-08-05T00:00:00.000Z",
  providerAccountId: "T123",
  payload: { text: "hello", channel: "C1" },
};

describe("parseTriggerEvent — the envelope the engine replays", () => {
  it("accepts a webhook envelope and preserves the provider payload untouched", () => {
    const out = parseTriggerEvent("trigger_event", WEBHOOK_EVENT);
    expect(out.provider).toBe("slack");
    expect(out.eventId).toBe("Ev123");
    // The payload is opaque BY DESIGN — providers extend it, so it is preserved
    // verbatim rather than validated into a shape they never agreed to.
    expect(out.payload).toEqual({ text: "hello", channel: "C1" });
  });

  it("accepts a manual/scheduled envelope with an empty payload", () => {
    const manual = { ...WEBHOOK_EVENT, provider: "manual", eventType: "manual_run", payload: {} };
    expect(parseTriggerEvent("trigger_event", manual).provider).toBe("manual");
  });

  it("accepts a polling envelope", () => {
    const polling = { ...WEBHOOK_EVENT, provider: "gmail", eventType: "new_email" };
    expect(parseTriggerEvent("trigger_event", polling).eventType).toBe("new_email");
  });

  it.each(["provider", "eventType", "eventId", "occurredAt", "providerAccountId"])(
    "REJECTS a stored event missing its %s discriminator",
    (field) => {
      const broken: Record<string, unknown> = { ...WEBHOOK_EVENT };
      delete broken[field];
      expect(() => parseTriggerEvent("trigger_event", broken)).toThrow(
        /stored value does not match its contract/,
      );
    },
  );

  it("REJECTS an empty discriminator rather than treating it as a manual run", () => {
    // Defaulting a malformed event to "manual" would let a corrupted row run
    // with the wrong trigger identity — the failure must be loud.
    expect(() => parseTriggerEvent("trigger_event", { ...WEBHOOK_EVENT, provider: "" })).toThrow();
    expect(() => parseTriggerEvent("trigger_event", { ...WEBHOOK_EVENT, eventType: "" })).toThrow();
  });

  it("REJECTS a non-object, null, or array event", () => {
    for (const bad of [null, undefined, 42, "manual", [WEBHOOK_EVENT]]) {
      expect(() => parseTriggerEvent("trigger_event", bad)).toThrow();
    }
  });

  it("REJECTS a payload that is not an object", () => {
    expect(() => parseTriggerEvent("trigger_event", { ...WEBHOOK_EVENT, payload: "raw" })).toThrow();
  });

  it("NEVER puts the provider payload into the error message", () => {
    // trigger_event.payload is an unmodified provider body: tokens, e-mail
    // addresses and message text live there. A validation error must name the
    // field and nothing else.
    const secretish = {
      ...WEBHOOK_EVENT,
      eventId: "",
      payload: {
        access_token: "xoxb-SUPER-SECRET-VALUE",
        email: "victim@example.test",
        body: "confidential message body",
      },
    };
    let message = "";
    try {
      parseTriggerEvent("workflow_runs.trigger_event(run-1)", secretish);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("workflow_runs.trigger_event(run-1)");
    expect(message).toContain("eventId");
    expect(message).not.toContain("xoxb-SUPER-SECRET-VALUE");
    expect(message).not.toContain("victim@example.test");
    expect(message).not.toContain("confidential message body");
  });
});

describe("parseRunSteps / parseFatalError / parseErrorClassification", () => {
  it("treats a missing steps column as an empty run record", () => {
    expect(parseRunSteps("steps", null)).toEqual([]);
  });

  it("accepts a well-formed step list", () => {
    const steps = [
      { nodeId: "n1", status: "succeeded", output: { ok: true } },
      { nodeId: "n2", status: "failed", error: { code: "E", message: "m" } },
    ];
    expect(parseRunSteps("steps", steps)).toHaveLength(2);
  });

  it("REJECTS a step with an unknown status", () => {
    expect(() => parseRunSteps("steps", [{ nodeId: "n1", status: "cancelled" }])).toThrow();
  });

  it("passes NULL fatal_error / error_classification through as null", () => {
    expect(parseFatalError("fatal_error", null)).toBeNull();
    expect(parseErrorClassification("error_classification", null)).toBeNull();
  });

  it("accepts a fatal error and REJECTS a malformed one", () => {
    expect(parseFatalError("fatal_error", { code: "BOOM", message: "it broke" })).toEqual({
      code: "BOOM",
      message: "it broke",
    });
    expect(() => parseFatalError("fatal_error", { code: "BOOM" })).toThrow();
  });

  it("REJECTS an error classification whose action the UI cannot route", () => {
    const good = { title: "t", description: "d", action: "reconnect", severity: "error" };
    expect(parseErrorClassification("error_classification", good)).toMatchObject({
      action: "reconnect",
    });
    expect(() =>
      parseErrorClassification("error_classification", { ...good, action: "teleport" }),
    ).toThrow();
  });
});

describe("workflow_runs CHECK-constrained columns", () => {
  it("narrows every legal triggered_by value", () => {
    for (const v of WORKFLOW_RUN_TRIGGERED_BY) {
      expect(narrowColumn("workflow_runs.triggered_by", WORKFLOW_RUN_TRIGGERED_BY, v)).toBe(v);
    }
  });

  it("REJECTS an unknown triggered_by instead of attributing the run wrongly", () => {
    expect(() =>
      narrowColumn("workflow_runs.triggered_by", WORKFLOW_RUN_TRIGGERED_BY, "cron"),
    ).toThrow(/workflow_runs\.triggered_by: unexpected value "cron"/);
  });

  it("treats a NULL billing_status as a real state, but rejects an unknown one", () => {
    expect(
      narrowNullableColumn("workflow_runs.billing_status", WORKFLOW_RUN_BILLING_STATUSES, null),
    ).toBeNull();
    expect(
      narrowNullableColumn("workflow_runs.billing_status", WORKFLOW_RUN_BILLING_STATUSES, "reserved"),
    ).toBe("reserved");
    expect(() =>
      narrowNullableColumn("workflow_runs.billing_status", WORKFLOW_RUN_BILLING_STATUSES, "refunded"),
    ).toThrow(/unexpected value "refunded"/);
  });
});
