/**
 * @jest-environment node
 *
 * CS-2 — validity + sync guard for the COMMITTED generated Linear artifacts.
 *
 * Proves: generated metas satisfy the real ActionMetaSchema; generated zod
 * schemas are `.strict()` and enforce the catalog's pinned requirements;
 * generated handlers fail closed on the executor seam (CS-3 ships the real
 * executor); the capability report validates; the artifacts are byte-in-sync
 * with `compileProvider(snapshot, catalog)` (nobody hand-edited generated
 * files, the emitters are deterministic); and NOTHING is registered yet
 * (rule 14 — orphans are not shipped surface).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { ActionMetaSchema } from "@/contracts/actionMeta";
import {
  McpCapabilityReportSchema,
  compileProvider,
  emitProviderArtifacts,
} from "@/core/mcpCompile";
import { McpExecutorNotAvailableError } from "@/integrations/_shared/mcp/executeTool";
import { linearMcpCatalog } from "@/integrations/linear/mcp-catalog";
import { findIssuesMeta } from "@/integrations/linear/actions/findIssues.meta";
import { createIssueMeta } from "@/integrations/linear/actions/createIssue.meta";
import { updateIssueMeta } from "@/integrations/linear/actions/updateIssue.meta";
import { addCommentMeta } from "@/integrations/linear/actions/addComment.meta";
import { CreateIssueConfigSchema } from "@/integrations/linear/actions/createIssue.schema";
import { UpdateIssueConfigSchema } from "@/integrations/linear/actions/updateIssue.schema";
import { AddCommentConfigSchema } from "@/integrations/linear/actions/addComment.schema";
import { createIssue } from "@/integrations/linear/actions/createIssue";
import {
  linearGeneratedActionMetas,
  linearGeneratedHandlers,
} from "@/integrations/linear/actions/_generated";

const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
const linearDir = path.join(repoRoot, "integrations", "linear");

const ALL_METAS = [findIssuesMeta, createIssueMeta, updateIssueMeta, addCommentMeta];

describe("generated Linear metas", () => {
  it("every generated meta parses against the real ActionMetaSchema", () => {
    for (const meta of ALL_METAS) {
      expect(() => ActionMetaSchema.parse(meta)).not.toThrow();
    }
    expect(ALL_METAS.map((m) => m.key)).toEqual([
      "linear:find_issues",
      "linear:create_issue",
      "linear:update_issue",
      "linear:add_comment",
    ]);
  });

  it("split dispatcher: create has no id and pins title+team; update pins id", () => {
    expect(createIssueMeta.fields.find((f) => f.name === "id")).toBeUndefined();
    expect(createIssueMeta.fields.find((f) => f.name === "title")).toMatchObject({ required: true });
    expect(createIssueMeta.fields.find((f) => f.name === "team")).toMatchObject({ required: true });
    expect(updateIssueMeta.fields.find((f) => f.name === "id")).toMatchObject({ required: true });
  });

  it("no raw JSON editors anywhere; power-user knobs are Advanced", () => {
    for (const meta of ALL_METAS) {
      expect(meta.fields.every((f) => f.type !== "json")).toBe(true);
    }
    expect(findIssuesMeta.fields.find((f) => f.name === "cursor")).toMatchObject({ advanced: true });
    expect(createIssueMeta.fields.find((f) => f.name === "links")).toMatchObject({
      advanced: true,
      type: "object-list",
    });
  });

  it("comment node is issue-scoped: body+issueId required, other parents omitted", () => {
    const names = addCommentMeta.fields.map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(["issueId", "body", "parentId"]));
    expect(names).not.toEqual(expect.arrayContaining(["projectId"]));
    expect(addCommentMeta.fields.find((f) => f.name === "issueId")).toMatchObject({ required: true });
    expect(addCommentMeta.fields.find((f) => f.name === "body")).toMatchObject({ required: true });
  });

  it("bounded outputs only (text default until live structured evidence exists)", () => {
    for (const meta of ALL_METAS) {
      expect(meta.outputs).toEqual([expect.objectContaining({ name: "text", type: "string" })]);
    }
  });
});

describe("generated strict schemas", () => {
  it("reject unknown keys and enforce pinned requirements", () => {
    expect(() =>
      CreateIssueConfigSchema.parse({ title: "t", team: "Core", evil: 1 }),
    ).toThrow();
    expect(() => CreateIssueConfigSchema.parse({ title: "t" })).toThrow(); // team pinned
    expect(() => CreateIssueConfigSchema.parse({ title: "t", team: "Core", id: "x" })).toThrow(); // id omitted on create
    expect(CreateIssueConfigSchema.parse({ title: "t", team: "Core" })).toMatchObject({
      title: "t",
    });
    expect(() => UpdateIssueConfigSchema.parse({ state: "Done" })).toThrow(); // id pinned
    expect(UpdateIssueConfigSchema.parse({ id: "LIN-123", state: "Done" })).toMatchObject({
      id: "LIN-123",
    });
    expect(() => AddCommentConfigSchema.parse({ body: "hi" })).toThrow(); // issueId pinned
    expect(AddCommentConfigSchema.parse({ issueId: "LIN-1", body: "hi" })).toMatchObject({
      issueId: "LIN-1",
    });
  });
});

describe("generated handlers (executor seam)", () => {
  it("fail closed until CS-3 registers the real executor", async () => {
    await expect(
      createIssue({
        workflowId: "wf",
        userId: "u",
        accountId: "acct",
        runId: "run",
        nodeId: "n",
        config: { title: "t", team: "Core" },
        triggerEvent: null,
      } as never),
    ).rejects.toBeInstanceOf(McpExecutorNotAvailableError);
  });
});

describe("capability report + registration fragments", () => {
  it("mcp-capabilities.json validates and covers exactly the shipped actions, unverified", () => {
    const report = McpCapabilityReportSchema.parse(
      JSON.parse(readFileSync(path.join(linearDir, "mcp-capabilities.json"), "utf8")),
    );
    expect(report.actions.map((a) => a.key).sort()).toEqual(
      ALL_METAS.map((m) => m.key).sort(),
    );
    expect(report.actions.every((a) => a.verified === false)).toBe(true);
    expect(report.actions.every((a) => a.outputQuality === "poor")).toBe(true); // text-only until live capture
  });

  it("registration fragments exist but NOTHING is registered yet (rule 14)", () => {
    expect(linearGeneratedActionMetas).toHaveLength(4);
    expect(linearGeneratedHandlers.map((h) => h.type)).toEqual([
      "find_issues",
      "create_issue",
      "update_issue",
      "add_comment",
    ]);
    const handlerInventory = readFileSync(
      path.join(repoRoot, "services", "execution", "handlers", "_handlerInventory.ts"),
      "utf8",
    );
    const metaInventory = readFileSync(
      path.join(repoRoot, "services", "discovery", "_metaInventory.ts"),
      "utf8",
    );
    expect(handlerInventory.includes("integrations/linear")).toBe(false);
    expect(metaInventory.includes("integrations/linear")).toBe(false);
  });
});

describe("determinism / sync guard", () => {
  it("committed artifacts are byte-identical to a fresh compile of snapshot+catalog", () => {
    const snapshot = JSON.parse(readFileSync(path.join(linearDir, "mcp-snapshot.json"), "utf8"));
    const compiled = compileProvider(snapshot, linearMcpCatalog);
    for (const file of emitProviderArtifacts(compiled)) {
      const committed = readFileSync(path.join(linearDir, file.path), "utf8");
      expect(committed.replace(/\r\n/g, "\n")).toBe(file.content);
    }
  });
});
