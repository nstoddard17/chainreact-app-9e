/** @jest-environment node */
/**
 * CONFIG-UX sweep (Group D) — Google Docs builder-metadata pins.
 *
 * Guards the sweep's metadata-only changes on share_document:
 *   - `message` renders only while the sendNotification toggle is on;
 *   - `publicPermission` / `allowDiscovery` render only while makePublic
 *     is on (both booleans — valueTruthy gates on real sibling values);
 *   - `transferOwnership` moves to the Advanced tab (schema superRefine
 *     guardrails unchanged);
 *   - `sendNotification` stays required with NO default (Q11);
 *   - `shareWith` copy leads with the conditional requirement.
 *
 * update_document's searchText required-when-visible pin lives in
 * `discoveryRegistry.test.ts` + the builder integration test.
 */

import { googleDocsShareDocumentMeta } from "@/integrations/google-docs/actions/shareDocument.meta";
import type { FieldMeta } from "@/contracts/actionMeta";

function field(name: string): FieldMeta {
  const f = googleDocsShareDocumentMeta.fields.find((x) => x.name === name);
  if (!f) throw new Error(`Missing field '${name}'.`);
  return f;
}

describe("google-docs:share_document conditional visibility (CONFIG-UX sweep)", () => {
  it("message is gated on the sendNotification toggle (boolean controller, valueTruthy)", () => {
    const f = field("message");
    expect(f.visibleWhen).toEqual({
      field: "sendNotification",
      valueTruthy: true,
    });
    // Controller is a real boolean sibling and not itself gated.
    expect(field("sendNotification").type).toBe("boolean");
    expect(field("sendNotification").visibleWhen).toBeUndefined();
  });

  it("publicPermission + allowDiscovery are gated on the makePublic toggle", () => {
    expect(field("publicPermission").visibleWhen).toEqual({
      field: "makePublic",
      valueTruthy: true,
    });
    expect(field("allowDiscovery").visibleWhen).toEqual({
      field: "makePublic",
      valueTruthy: true,
    });
    expect(field("makePublic").type).toBe("boolean");
    expect(field("makePublic").visibleWhen).toBeUndefined();
    // publicPermission keeps its least-privilege default + enum values.
    expect(field("publicPermission").defaultValue).toBe("reader");
  });

  it("transferOwnership is an Advanced-tab toggle keeping its false default + irreversibility warning", () => {
    const f = field("transferOwnership");
    expect(f.advanced).toBe(true);
    expect(f.defaultValue).toBe(false);
    expect(f.description!.toLowerCase()).toContain("irreversible");
  });

  it("sendNotification stays required with NO default (Q11)", () => {
    const f = field("sendNotification");
    expect(f.required).toBe(true);
    expect(f.defaultValue).toBeUndefined();
    expect(f.visibleWhen).toBeUndefined();
  });

  it("shareWith copy leads with the conditional requirement", () => {
    expect(field("shareWith").description!.startsWith("Required unless")).toBe(
      true,
    );
  });
});
