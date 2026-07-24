/** @jest-environment node */
/**
 * AI-PROVIDER-7 (CS-7) — Suggest-fields sample resolution.
 *
 * The rule this file protects: a saved literal works with no run at all, a
 * `{{token}}` resolves against the author's own latest test run, and every
 * "no sample" arm names something the author can DO about it.
 */
import {
  readSingleTemplatePath,
  resolveSuggestionSample,
  SUGGESTION_SAMPLE_MESSAGES,
} from "@/core/workflows/suggestionSample";

const FILE_REF = {
  kind: "v2_storage",
  name: "payroll.pdf",
  mimeType: "application/pdf",
  storagePath: "u/w/r/n/payroll.pdf",
};

describe("readSingleTemplatePath", () => {
  it("reads a lone token, with or without whitespace", () => {
    expect(readSingleTemplatePath("{{step.file}}")).toBe("step.file");
    expect(readSingleTemplatePath("  {{  step.file  }}  ")).toBe("step.file");
  });

  it("is null for anything that is not exactly one token", () => {
    for (const value of [
      "text",
      "",
      "prefix {{step.file}}",
      "{{a}} {{b}}",
      42,
      null,
      undefined,
      { kind: "v2_storage" },
    ]) {
      expect(readSingleTemplatePath(value)).toBeNull();
    }
  });
});

describe("config literals", () => {
  it("uses a saved FileRef with no run required", () => {
    const result = resolveSuggestionSample({
      config: { file: FILE_REF },
      sampleSourceField: "file",
      latestValuesBySource: {},
    });
    expect(result).toEqual({
      ok: true,
      value: FILE_REF,
      source: "config_literal",
    });
  });

  it("uses saved text", () => {
    const result = resolveSuggestionSample({
      config: { file: "Invoice total: $42" },
      sampleSourceField: "file",
      latestValuesBySource: {},
    });
    expect(result).toMatchObject({ ok: true, source: "config_literal" });
  });
});

describe("latest-run tokens", () => {
  const latest = {
    step1: { attachment: FILE_REF, rows: [{ a: 1 }], empty: null },
    trigger: { payload: { body: "hello" } },
  };

  it("resolves a nested path from the run output", () => {
    expect(
      resolveSuggestionSample({
        config: { file: "{{step1.attachment}}" },
        sampleSourceField: "file",
        latestValuesBySource: latest,
      }),
    ).toEqual({
      ok: true,
      value: FILE_REF,
      source: "latest_run",
      path: "step1.attachment",
    });
  });

  it("resolves the trigger alias and a deep path", () => {
    expect(
      resolveSuggestionSample({
        config: { input: "{{trigger.payload.body}}" },
        sampleSourceField: "input",
        latestValuesBySource: latest,
      }),
    ).toMatchObject({ ok: true, value: "hello", source: "latest_run" });
  });

  it("resolves a whole-step reference (no path segment)", () => {
    expect(
      resolveSuggestionSample({
        config: { input: "{{step1}}" },
        sampleSourceField: "input",
        latestValuesBySource: latest,
      }),
    ).toMatchObject({ ok: true, value: latest.step1 });
  });

  it("says RUN IT when the step has no recent value", () => {
    const result = resolveSuggestionSample({
      config: { file: "{{never_ran.attachment}}" },
      sampleSourceField: "file",
      latestValuesBySource: latest,
    });
    expect(result).toEqual({ ok: false, reason: "no_run_yet" });
    expect(SUGGESTION_SAMPLE_MESSAGES.no_run_yet).toMatch(/Test this workflow once/);
  });

  it("says RUN IT AGAIN when the step ran but produced nothing there", () => {
    for (const path of ["{{step1.empty}}", "{{step1.missing.deep}}"]) {
      expect(
        resolveSuggestionSample({
          config: { file: path },
          sampleSourceField: "file",
          latestValuesBySource: latest,
        }),
      ).toEqual({ ok: false, reason: "empty_value" });
    }
  });
});

describe("no input", () => {
  it.each([[undefined], [null], [""], ["   "]])(
    "asks the author to pick a document first for %p",
    (value) => {
      const result = resolveSuggestionSample({
        config: { file: value },
        sampleSourceField: "file",
        latestValuesBySource: {},
      });
      expect(result).toEqual({ ok: false, reason: "no_input" });
    },
  );

  it("treats a missing field as no input", () => {
    expect(
      resolveSuggestionSample({
        config: {},
        sampleSourceField: "file",
        latestValuesBySource: {},
      }),
    ).toEqual({ ok: false, reason: "no_input" });
  });

  it("has actionable copy for every failure reason", () => {
    for (const message of Object.values(SUGGESTION_SAMPLE_MESSAGES)) {
      expect(message.length).toBeGreaterThan(20);
      expect(message).toMatch(/[.!]$/);
    }
  });
});
