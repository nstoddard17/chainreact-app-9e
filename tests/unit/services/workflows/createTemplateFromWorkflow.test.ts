/**
 * @jest-environment node
 *
 * services/workflows/createTemplateFromWorkflow (CS-XT-4) — the sanitizer-enforcing
 * template create helper. Proves it runs the workflow definition through the export
 * sanitizer so a template NEVER carries a token/email/secret/provider-label/owner-id,
 * passes a sanitized definition + EXPORT_SCHEMA_VERSION to the repo, and reads ONLY the
 * workflow's name + draftDefinition (no integrations / credential lookups).
 */

const mockCreate = jest.fn();
jest.mock("@/repositories/workflowTemplates", () => ({
  createTemplateServiceRole: (...a: unknown[]) => mockCreate(...a),
}));

import {
  createTemplateFromWorkflow,
  buildSanitizedTemplateDefinition,
} from "@/services/workflows/createTemplateFromWorkflow";
import { EXPORT_SCHEMA_VERSION, REDACTION_MARKER } from "@/services/workflows/exportWorkflow";
import type { WorkflowRecord } from "@/repositories/workflows";

function workflow(): WorkflowRecord {
  return {
    id: "wf-1",
    accountId: "acct-1",
    createdByUserId: "user-1",
    name: "Lead intake",
    state: "draft",
    disabledReason: null,
    disabledContext: null,
    activeRevisionId: null,
    draftDefinition: {
      nodes: [
        {
          id: "n1",
          kind: "action",
          provider: "slack",
          type: "post",
          position: { x: 0, y: 0 },
          config: {
            channel: "C1",
            botToken: (["xoxb", "planted", "secret", "123456"].join("-")),
            contact: "vp@acme.com",
            connectedByUserId: "owner-leak-99",
            integrationId: "intg-leak-1",
            note: `ping ${["ghp", "AbCd1234EfGh5678Zzzz"].join("_")} on failure`,
          },
        },
      ],
      edges: [],
    },
    deletedAt: null,
    folderId: null,
    deletedByUserId: null,
    purgeAfter: null,
    deletedFromFolderId: null,
    deleteOperationId: null,
    createdAt: "2026-06-07T00:00:00Z",
    updatedAt: "2026-06-07T00:00:00Z",
  } as WorkflowRecord;
}

beforeEach(() => jest.clearAllMocks());

describe("buildSanitizedTemplateDefinition", () => {
  it("redacts tokens / emails / secret-shaped strings and owner/integration ids", () => {
    const def = buildSanitizedTemplateDefinition(workflow());
    const blob = JSON.stringify(def);
    expect(blob).not.toMatch((new RegExp(["xoxb", "planted", "secret"].join("-"))));
    expect(blob).not.toMatch(/vp@acme\.com/);
    expect(blob).not.toMatch(/owner-leak-99/);
    expect(blob).not.toMatch(/intg-leak-1/);
    // defense-in-depth: a token pasted into an innocuous free-text field is still redacted
    expect(blob).not.toMatch(new RegExp(["ghp", "AbCd1234EfGh"].join("_")));
    // structural fields survive (graph is still usable)
    expect(def.nodes[0]!.provider).toBe("slack");
    expect(def.nodes[0]!.config.channel).toBe("C1");
    // sensitive values became the redaction marker
    expect(def.nodes[0]!.config.botToken).toBe(REDACTION_MARKER);
    expect(blob).toContain(REDACTION_MARKER);
  });

  it("drops unexpected (non-whitelisted) node fields via the strict schema", () => {
    const wf = workflow();
    // a leaked owner id smuggled onto the node itself
    (wf.draftDefinition.nodes[0] as Record<string, unknown>).ownerUserId = "leak-123";
    const def = buildSanitizedTemplateDefinition(wf);
    expect(JSON.stringify(def)).not.toMatch(/leak-123/);
    expect(def.nodes[0]).not.toHaveProperty("ownerUserId");
  });
});

describe("createTemplateFromWorkflow", () => {
  it("persists a SANITIZED definition + EXPORT_SCHEMA_VERSION, defaulting the name", async () => {
    mockCreate.mockResolvedValue({ id: "tpl-1" });
    await createTemplateFromWorkflow({ workflow: workflow(), createdByUserId: "user-1" });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const arg = mockCreate.mock.calls[0]![0];
    expect(arg.accountId).toBe("acct-1");
    expect(arg.name).toBe("Lead intake");
    expect(arg.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(JSON.stringify(arg.definition)).not.toMatch((new RegExp(["xoxb", "planted", "secret"].join("-"))));
    expect(JSON.stringify(arg.definition)).not.toMatch(/vp@acme\.com/);
  });

  it("honors a name + description override", async () => {
    mockCreate.mockResolvedValue({ id: "tpl-2" });
    await createTemplateFromWorkflow({
      workflow: workflow(),
      name: "My Template",
      description: "reusable intake",
      createdByUserId: null,
    });
    const arg = mockCreate.mock.calls[0]![0];
    expect(arg.name).toBe("My Template");
    expect(arg.description).toBe("reusable intake");
    expect(arg.createdByUserId).toBeNull();
  });
});
