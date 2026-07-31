/**
 * @jest-environment node
 *
 * `google-sheets:append_row` config-schema compatibility
 * (SHEETS-GUIDED-CONFIG-1).
 *
 * The guided builder needed a destination TAB to hang the column
 * resolver on, so the schema gained `sheetName`. This suite exists for
 * one reason: to prove that addition cannot break a workflow that is
 * already live.
 *
 * The business rule under protection — a configuration saved before
 * this slice must keep validating and running, unchanged, with no
 * migration and no rewrite-on-open. If `sheetName` were required, or
 * carried a default, every existing Append Row node would either fail
 * validation or silently acquire a value its author never chose.
 */

import { AppendRowConfigSchema } from "@/integrations/google-sheets/actions/appendRow.schema";

const LEGACY_CONFIG = {
  spreadsheetId: "sheet-abc",
  range: "Sheet1!A:Z",
  values: ["2026-07-31", "dana@example.test", "Invoice 4471"],
  valueInputOption: "USER_ENTERED",
} as const;

describe("AppendRowConfigSchema — legacy configurations keep working", () => {
  it("accepts a configuration saved before the tab picker existed", () => {
    const parsed = AppendRowConfigSchema.parse({ ...LEGACY_CONFIG });
    expect(parsed.spreadsheetId).toBe("sheet-abc");
    expect(parsed.range).toBe("Sheet1!A:Z");
    // The tab is genuinely absent — not defaulted to something invented.
    expect(parsed.sheetName).toBeUndefined();
    // The default that already existed is unchanged.
    expect(parsed.insertDataOption).toBe("INSERT_ROWS");
  });

  it("never invents a tab for a legacy config (no default that would change meaning)", () => {
    const parsed = AppendRowConfigSchema.parse({ ...LEGACY_CONFIG });
    expect(Object.prototype.hasOwnProperty.call(parsed, "sheetName")).toBe(
      false,
    );
  });

  it("accepts a configuration written by the guided builder", () => {
    const parsed = AppendRowConfigSchema.parse({
      ...LEGACY_CONFIG,
      sheetName: "Email log",
      range: "'Email log'!A:F",
    });
    expect(parsed.sheetName).toBe("Email log");
    expect(parsed.range).toBe("'Email log'!A:F");
  });

  it("keeps range required — it is still the only value sent to the API", () => {
    const { range: _dropped, ...withoutRange } = LEGACY_CONFIG;
    expect(() =>
      AppendRowConfigSchema.parse({ ...withoutRange, sheetName: "Email log" }),
    ).toThrow();
  });

  it("rejects a blank tab rather than storing an empty destination", () => {
    expect(() =>
      AppendRowConfigSchema.parse({ ...LEGACY_CONFIG, sheetName: "" }),
    ).toThrow();
  });

  it("still rejects unknown keys — the strict contract did not loosen", () => {
    expect(() =>
      AppendRowConfigSchema.parse({
        ...LEGACY_CONFIG,
        // A plausible-looking key the guided UI might have been tempted to
        // persist. Config is not a scratchpad for builder state.
        columnMapping: { Subject: "{{trigger.subject}}" },
      }),
    ).toThrow();
  });

  it("still requires an explicit valueInputOption (Q11 unchanged)", () => {
    const { valueInputOption: _dropped, ...withoutChoice } = LEGACY_CONFIG;
    expect(() => AppendRowConfigSchema.parse({ ...withoutChoice })).toThrow();
  });

  it("still rejects an empty values array", () => {
    expect(() =>
      AppendRowConfigSchema.parse({ ...LEGACY_CONFIG, values: [] }),
    ).toThrow(/non-empty/);
  });
});
