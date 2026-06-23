/**
 * CS-1 — Google Calendar create_event / update_event opt into the temporal
 * field family. Proves the metadata uses the new field types AND still
 * validates against ActionMetaSchema (stored config shape is unchanged — only
 * the builder control changes; the handler schemas are untouched).
 */
import { ActionMetaSchema, type FieldMeta } from "@/contracts/actionMeta";
import { googleCalendarCreateEventMeta } from "@/integrations/google-calendar/actions/createEvent.meta";
import { googleCalendarUpdateEventMeta } from "@/integrations/google-calendar/actions/updateEvent.meta";

function fieldType(fields: readonly FieldMeta[], name: string): string | undefined {
  return fields.find((f) => f.name === name)?.type;
}

describe("Google Calendar temporal field adoption (CS-1)", () => {
  it("create_event uses datetime / date / timezone controls", () => {
    const f = googleCalendarCreateEventMeta.fields;
    expect(fieldType(f, "startDateTime")).toBe("datetime");
    expect(fieldType(f, "endDateTime")).toBe("datetime");
    expect(fieldType(f, "startDate")).toBe("date");
    expect(fieldType(f, "endDate")).toBe("date");
    expect(fieldType(f, "timezone")).toBe("timezone");
  });

  it("update_event uses datetime / timezone controls", () => {
    const f = googleCalendarUpdateEventMeta.fields;
    expect(fieldType(f, "startDateTime")).toBe("datetime");
    expect(fieldType(f, "endDateTime")).toBe("datetime");
    expect(fieldType(f, "timezone")).toBe("timezone");
  });

  it("both metas still validate against ActionMetaSchema", () => {
    expect(ActionMetaSchema.safeParse(googleCalendarCreateEventMeta).success).toBe(true);
    expect(ActionMetaSchema.safeParse(googleCalendarUpdateEventMeta).success).toBe(true);
  });

  it("temporal fields carry no static options / optionsSource (they're not selects)", () => {
    for (const meta of [googleCalendarCreateEventMeta, googleCalendarUpdateEventMeta]) {
      for (const f of meta.fields) {
        if (["date", "time", "datetime", "timezone"].includes(f.type)) {
          expect(f.options).toBeUndefined();
          expect(f.optionsSource).toBeUndefined();
        }
      }
    }
  });
});
