/**
 * @jest-environment node
 *
 * GOOGLE-REVIEW-CERTIFICATION-2 — conditional readiness for `google-calendar:create_event`.
 *
 * The metadata used to declare startDateTime / endDateTime / startDate / endDate as
 * `required: false`, while `createEvent.schema.ts` REQUIRES the timed pair when `allDay` is false
 * and the date pair when it is true. Readiness therefore passed a configuration the runtime then
 * rejected: no Setup Needed in the builder, a HANDLER_FAILED mid-run instead.
 *
 * All four are now `required: true` scoped by their existing top-level `visibleWhen`, so the
 * shared readiness core flags exactly the pair the current All Day mode reveals — and never the
 * hidden pair. This test pins BOTH modes plus the compatibility of already-configured workflows,
 * and asserts meta and runtime schema agree rather than trusting the meta alone.
 */
import { getActionMeta } from "@/services/discovery/_registry";
import { buildRequiredFieldsByType, missingRequiredFields } from "@/core/workflows/requiredFields";
import { CreateEventConfigSchema } from "@/integrations/google-calendar/actions/createEvent.schema";
import type { WorkflowNode } from "@/contracts/workflow";

const meta = getActionMeta("google-calendar:create_event")!;
const requiredByType = buildRequiredFieldsByType([meta], []);

const node = (config: Record<string, unknown>): WorkflowNode =>
  ({
    id: "n1",
    kind: "action",
    provider: "google-calendar",
    type: "create_event",
    position: { x: 0, y: 0 },
    config,
  }) as WorkflowNode;

const missing = (config: Record<string, unknown>): string[] =>
  missingRequiredFields(node(config), requiredByType)
    .map((f) => f.name)
    .sort();

// The Q11 choices are always required and are not what this test is about.
const CONSENT = {
  sendNotifications: "none",
  guestsCanInviteOthers: false,
  guestsCanSeeOtherGuests: false,
};

describe("google-calendar:create_event — conditional date/time readiness", () => {
  it("a TIMED event (allDay false) reports the missing start and end date-time", () => {
    expect(missing({ summary: "Follow up", allDay: false, ...CONSENT })).toEqual([
      "endDateTime",
      "startDateTime",
    ]);
  });

  it("defaults to the TIMED requirement when allDay is absent entirely", () => {
    // A template / API / AI-authored config that omits allDay is a timed event — the meta
    // default is false — so the timed pair must still be demanded.
    expect(missing({ summary: "Follow up", ...CONSENT })).toEqual([
      "endDateTime",
      "startDateTime",
    ]);
  });

  it("an ALL-DAY event requires the DATE pair and never the hidden date-time pair", () => {
    const gaps = missing({ summary: "Company offsite", allDay: true, ...CONSENT });
    expect(gaps).toEqual(["endDate", "startDate"]);
    expect(gaps).not.toContain("startDateTime");
    expect(gaps).not.toContain("endDateTime");
  });

  it("a fully configured TIMED event is ready, and its hidden all-day fields are not gaps", () => {
    expect(
      missing({
        summary: "Follow up",
        allDay: false,
        startDateTime: "2026-08-01T10:00:00Z",
        endDateTime: "2026-08-01T10:30:00Z",
        ...CONSENT,
      }),
    ).toEqual([]);
  });

  it("a fully configured ALL-DAY event is ready", () => {
    expect(
      missing({
        summary: "Company offsite",
        allDay: true,
        startDate: "2026-08-01",
        endDate: "2026-08-02",
        ...CONSENT,
      }),
    ).toEqual([]);
  });

  it("readiness now agrees with the runtime schema in every mode (no ready-but-unrunnable config)", () => {
    const cases: ReadonlyArray<Record<string, unknown>> = [
      { summary: "Follow up", allDay: false, ...CONSENT },
      { summary: "Follow up", ...CONSENT },
      { summary: "Offsite", allDay: true, ...CONSENT },
      {
        summary: "Follow up",
        allDay: false,
        startDateTime: "2026-08-01T10:00:00Z",
        endDateTime: "2026-08-01T10:30:00Z",
        ...CONSENT,
      },
      { summary: "Offsite", allDay: true, startDate: "2026-08-01", endDate: "2026-08-02", ...CONSENT },
    ];
    for (const config of cases) {
      const readinessOk = missing(config).length === 0;
      const runtimeOk = CreateEventConfigSchema.safeParse(config).success;
      // The exact pairing that was broken: readiness said "ready" while the runtime said no.
      expect({ config, readinessOk, runtimeOk }).toEqual({ config, readinessOk, runtimeOk: readinessOk });
    }
  });

  it("declares the four date fields required-when-visible, with no guessed default", () => {
    for (const name of ["startDateTime", "endDateTime", "startDate", "endDate"]) {
      const field = meta.fields.find((f) => f.name === name)!;
      expect({ name, required: field.required, hasDefault: field.defaultValue !== undefined }).toEqual(
        { name, required: true, hasDefault: false },
      );
      expect(field.visibleWhen).toEqual({
        field: "allDay",
        valueTruthy: name.endsWith("DateTime") ? false : true,
      });
    }
  });
});
