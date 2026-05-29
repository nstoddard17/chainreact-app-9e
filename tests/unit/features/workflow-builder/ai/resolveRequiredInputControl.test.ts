/**
 * @jest-environment node
 *
 * Slice 4.AI-35E — shared, metadata-driven control selection for React Agent
 * required-input entries. Maps a `requiredUserInput` entry to the class of
 * control the chat renders, mirroring the config-panel field renderers.
 *
 * The whole point of the helper is that it is METADATA-DRIVEN, never
 * provider-specific — so these tests deliberately exercise the same field
 * shapes across unrelated providers + native nodes and assert the control is
 * decided purely from `options` / `optionsSource` / `fieldType` / `multiple` /
 * `kind`.
 */
import {
  resolveRequiredInputControl,
  isRequiredInputControlRenderable,
  type RequiredInputControlKind,
} from "@/features/workflow-builder/ai/resolveRequiredInputControl";
import type { AiRequiredUserInput } from "@/lib/api/ai";

function input(partial: Partial<AiRequiredUserInput>): AiRequiredUserInput {
  return { label: "X", kind: "config_value", ...partial };
}

describe("resolveRequiredInputControl — static options", () => {
  it("single-pick static enum → select", () => {
    expect(
      resolveRequiredInputControl(
        input({ fieldType: "select", options: [{ label: "A", value: "a" }] }),
      ),
    ).toBe("select");
  });

  it("multi static enum → multiselect", () => {
    expect(
      resolveRequiredInputControl(
        input({ fieldType: "select", multiple: true, options: [{ label: "A", value: "a" }] }),
      ),
    ).toBe("multiselect");
  });

  it("provider_choice (carries its own options) → select", () => {
    expect(
      resolveRequiredInputControl({
        label: "Which email app?",
        kind: "provider_choice",
        category: "email",
        options: [
          { label: "Gmail", value: "gmail" },
          { label: "Outlook", value: "microsoft-outlook" },
        ],
      }),
    ).toBe("select");
  });
});

describe("resolveRequiredInputControl — dynamic optionsSource", () => {
  it("optionsSource → combobox", () => {
    expect(
      resolveRequiredInputControl(input({ fieldType: "combobox", optionsSource: "slack:channels" })),
    ).toBe("combobox");
  });

  it("optionsSource takes precedence even when options also slip through", () => {
    expect(
      resolveRequiredInputControl(
        input({ fieldType: "combobox", optionsSource: "airtable:tables", options: [] }),
      ),
    ).toBe("combobox");
  });
});

describe("resolveRequiredInputControl — scalar field types", () => {
  it("boolean field → boolean", () => {
    expect(resolveRequiredInputControl(input({ fieldType: "boolean" }))).toBe("boolean");
  });

  it("number field → number", () => {
    expect(resolveRequiredInputControl(input({ fieldType: "number" }))).toBe("number");
  });

  it("textarea field → textarea", () => {
    expect(resolveRequiredInputControl(input({ fieldType: "textarea" }))).toBe("textarea");
  });

  it("text field → text", () => {
    expect(resolveRequiredInputControl(input({ fieldType: "text" }))).toBe("text");
  });

  it.each(["cron", "string-array", "file", "file-array", "keyvalue", "router-routes"])(
    "known config field with no dedicated chat control (%s) → text fallback",
    (fieldType) => {
      expect(resolveRequiredInputControl(input({ fieldType }))).toBe("text");
    },
  );
});

describe("resolveRequiredInputControl — fallback + bullet", () => {
  it("bare config_value with no metadata → text (known config field, renderer unknown)", () => {
    // This is the live regression: 'What should the Slack DM say?' arrives as a
    // bare config_value (null-patch plan, no node identity). It must render a
    // text control, not a static bullet.
    expect(resolveRequiredInputControl(input({ kind: "config_value" }))).toBe("text");
  });

  it("field+nodeId identity with no fieldType → text", () => {
    expect(
      resolveRequiredInputControl({ label: "X", kind: "config_value", nodeId: "n1", field: "f" }),
    ).toBe("text");
  });

  it.each(["clarification", "choose_trigger", "variable_reference", "select_integration"] as const)(
    "non-field clarification kind (%s) with no metadata → bullet",
    (kind) => {
      expect(resolveRequiredInputControl({ label: "Pick something", kind })).toBe("bullet");
    },
  );

  it("a clarification that DOES carry field identity still renders a control", () => {
    expect(
      resolveRequiredInputControl({ label: "X", kind: "clarification", nodeId: "n1", field: "f" }),
    ).toBe("text");
  });
});

describe("resolveRequiredInputControl — metadata-driven, not provider-specific", () => {
  // Same field SHAPE across unrelated providers + a native node must resolve to
  // the SAME control. No provider id influences the decision.
  const providers = ["slack", "gmail", "microsoft-outlook", "stripe", "google-sheets", "airtable", "trello", "notion", "hubspot", "native"];

  it.each(providers)("textarea body field resolves to textarea for provider %s", (provider) => {
    expect(
      resolveRequiredInputControl(input({ provider, nodeId: "n1", field: "body", fieldType: "textarea" })),
    ).toBe("textarea");
  });

  it.each(providers)("optionsSource resource field resolves to combobox for provider %s", (provider) => {
    expect(
      resolveRequiredInputControl(
        input({ provider, nodeId: "n1", field: "resource", fieldType: "combobox", optionsSource: `${provider}:resources` }),
      ),
    ).toBe("combobox");
  });
});

describe("isRequiredInputControlRenderable", () => {
  it("is true for everything that resolves to a control", () => {
    const renderable: AiRequiredUserInput[] = [
      input({ fieldType: "text" }),
      input({ fieldType: "textarea" }),
      input({ fieldType: "boolean" }),
      input({ fieldType: "number" }),
      input({ fieldType: "select", options: [{ label: "A", value: "a" }] }),
      input({ fieldType: "combobox", optionsSource: "slack:channels" }),
      { label: "Which email?", kind: "provider_choice", options: [{ label: "Gmail", value: "gmail" }] },
      input({}), // bare config_value
    ];
    for (const i of renderable) expect(isRequiredInputControlRenderable(i)).toBe(true);
  });

  it("is false only for non-field clarifications", () => {
    const bullets: AiRequiredUserInput[] = [
      { label: "Pick a trigger", kind: "choose_trigger" },
      { label: "Clarify the goal", kind: "clarification" },
      { label: "Connect Stripe", kind: "select_integration" },
    ];
    for (const i of bullets) expect(isRequiredInputControlRenderable(i)).toBe(false);
  });

  it("never returns a kind outside the documented union", () => {
    const kinds: RequiredInputControlKind[] = [
      resolveRequiredInputControl(input({ fieldType: "text" })),
      resolveRequiredInputControl({ label: "x", kind: "clarification" }),
    ];
    for (const k of kinds) {
      expect([
        "select",
        "multiselect",
        "combobox",
        "boolean",
        "number",
        "textarea",
        "text",
        "bullet",
      ]).toContain(k);
    }
  });
});
