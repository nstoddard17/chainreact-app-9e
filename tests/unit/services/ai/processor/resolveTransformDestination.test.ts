/** @jest-environment node */
/**
 * AI-PROVIDER-6 (CS-6) — destination resolution.
 *
 * The rule this file protects: the SERVER decides what the model is allowed to
 * emit, by re-deriving from the live registry. A client never gets to supply
 * the destination-action schema, and every refusal names the remedy.
 */
import type { ActionMeta } from "@/contracts/actionMeta";
import { DestinationResolutionError } from "@/services/ai/processor/analysisErrors";
import {
  DESTINATION_EXCLUDED_WARNING_PREFIX,
  destinationWarnings,
  resolveTransformDestination,
} from "@/services/ai/processor/resolveTransformDestination";
import { getActionMeta } from "@/services/discovery/_registry";

const CUSTOM_SCHEMA = {
  fields: [{ name: "full_name", type: "string" as const, required: true }],
};

describe("custom-schema mode", () => {
  it("uses the author's schema verbatim and needs no registry lookup", () => {
    const lookup = jest.fn();
    const resolved = resolveTransformDestination(
      { destinationMode: "custom", destinationSchema: CUSTOM_SCHEMA },
      { lookupActionMeta: lookup as unknown as typeof getActionMeta },
    );
    expect(resolved).toEqual({
      mode: "custom",
      schema: CUSTOM_SCHEMA,
      excludedFields: [],
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("refuses an empty or missing schema", () => {
    for (const destinationSchema of [undefined, { fields: [] }]) {
      expect(() =>
        resolveTransformDestination({
          destinationMode: "custom",
          destinationSchema: destinationSchema as never,
        }),
      ).toThrow(/Add at least one field/);
    }
  });
});

describe("destination-action mode", () => {
  it("derives the schema + context from the LIVE registry", () => {
    const resolved = resolveTransformDestination({
      destinationMode: "action",
      destinationAction: "microsoft-outlook:send_email",
    });
    expect(resolved.mode).toBe("action");
    expect(resolved.actionKey).toBe("microsoft-outlook:send_email");
    expect(resolved.schema.fields.map((f) => f.name)).toEqual([
      "subject",
      "body",
      "isHtml",
      "importance",
    ]);
    expect(resolved.context?.action.displayName).toBeTruthy();
    expect(resolved.excludedFields.map((f) => f.name)).toEqual(
      expect.arrayContaining(["to", "cc", "bcc"]),
    );
  });

  it("ignores any client-supplied schema in action mode", () => {
    const resolved = resolveTransformDestination({
      destinationMode: "action",
      destinationAction: "microsoft-outlook:send_email",
      // A hostile / stale client copy. The server re-derives regardless.
      destinationSchema: { fields: [{ name: "anything", type: "string" }] },
    });
    expect(resolved.schema.fields.map((f) => f.name)).not.toContain("anything");
  });

  it("refuses a missing destination", () => {
    for (const destinationAction of [undefined, "", "   "]) {
      expect(() =>
        resolveTransformDestination({ destinationMode: "action", destinationAction }),
      ).toThrow(/Choose the step/);
    }
  });

  it("refuses an unknown destination with a recoverable message", () => {
    expect(() =>
      resolveTransformDestination({
        destinationMode: "action",
        destinationAction: "ghost:create_thing",
      }),
    ).toThrow(/isn't available anymore/);
  });

  it("refuses an AI action as a destination (no cost loops)", () => {
    for (const key of ["ai:analyze_document", "ai:transform_data"]) {
      expect(() =>
        resolveTransformDestination({
          destinationMode: "action",
          destinationAction: key,
        }),
      ).toThrow(/can't be used as a transform destination/);
    }
  });

  it("refuses a destination with nothing mappable, naming it", () => {
    const unmappable = {
      key: "demo:upload",
      provider: "demo",
      type: "upload",
      displayName: "Upload File",
      description: "Uploads a file.",
      category: "files",
      requiresIntegration: true,
      fields: [
        { name: "file", label: "File", type: "file", required: true },
        { name: "folderId", label: "Folder", type: "combobox", required: true, optionsSource: "demo:folders" },
      ],
      outputs: [],
      producesFileRef: false,
      consumesFileRef: true,
      displayOrder: null,
      isDestructive: false,
      requiresConfirmation: false,
      riskLevel: "low",
    } as unknown as ActionMeta;

    expect(() =>
      resolveTransformDestination(
        { destinationMode: "action", destinationAction: "demo:upload" },
        { lookupActionMeta: (() => unmappable) as unknown as typeof getActionMeta },
      ),
    ).toThrow(/Upload File has no fields this step can fill in automatically/);
  });

  it("throws the typed error class for every refusal", () => {
    expect(() =>
      resolveTransformDestination({ destinationMode: "action" }),
    ).toThrow(DestinationResolutionError);
  });
});

describe("destinationWarnings", () => {
  it("renders one machine-readable warning per skipped destination field", () => {
    expect(
      destinationWarnings([
        { name: "to", label: "To", reason: "unsupported_type" },
        { name: "baseId", label: "Base", reason: "provider_resource" },
      ]),
    ).toEqual([
      `${DESTINATION_EXCLUDED_WARNING_PREFIX}to:unsupported_type`,
      `${DESTINATION_EXCLUDED_WARNING_PREFIX}baseId:provider_resource`,
    ]);
  });
});
