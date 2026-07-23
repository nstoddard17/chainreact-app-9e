/**
 * @jest-environment node
 *
 * CS-2 — validity + sync guard for the COMMITTED generated Linear artifacts.
 *
 * Proves: generated metas satisfy the real ActionMetaSchema; generated zod
 * schemas are `.strict()` and enforce the catalog's pinned requirements;
 * generated handlers delegate to the shared executor with the certification-
 * pinned tool + hash + bounded output (CS-3); the capability report validates;
 * the artifacts are byte-in-sync with `compileProvider(snapshot, catalog)`
 * (nobody hand-edited generated files, the emitters are deterministic); and the
 * actions ARE now registered in the meta + handler inventories (CS-3).
 */
const mockExecuteMcpTool = jest.fn(async (_input: Record<string, unknown>) => ({ output: { text: "ok" } }));
jest.mock("@/integrations/_shared/mcp/executeTool", () => ({
  executeMcpTool: (i: Record<string, unknown>) => mockExecuteMcpTool(i),
}));

import { readFileSync } from "node:fs";
import path from "node:path";
import { ActionMetaSchema } from "@/contracts/actionMeta";
import {
  McpCapabilityReportSchema,
  compileProvider,
  emitProviderArtifacts,
} from "@/core/mcpCompile";
import { linearMcpCatalog } from "@/integrations/linear/mcp-catalog";
import { findIssuesMeta } from "@/integrations/linear/actions/findIssues.meta";
import { createIssueMeta } from "@/integrations/linear/actions/createIssue.meta";
import { updateIssueMeta } from "@/integrations/linear/actions/updateIssue.meta";
import { addCommentMeta } from "@/integrations/linear/actions/addComment.meta";
import { FindIssuesConfigSchema } from "@/integrations/linear/actions/findIssues.schema";
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

  it("bounded outputs: find_issues structured from live evidence; writes stay text-only (CS-6)", () => {
    // find_issues — CERTIFIED structured output from the real captured
    // list_issues shape (mcp-evidence.json): a page + Linear pagination fields.
    expect(findIssuesMeta.outputs.map((o) => `${o.name}:${o.type}`)).toEqual([
      "issues:array",
      "hasNextPage:boolean",
      "cursor:string",
    ]);
    // save_issue / save_comment are WRITES, not auto-captured → no certified
    // result shape → text-only (never fabricated).
    for (const meta of [createIssueMeta, updateIssueMeta, addCommentMeta]) {
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

describe("closed-vocabulary + numeric bounds (CS-6C rule-17 config UX)", () => {
  it("priority renders as a labelled dropdown, not an unrestricted number", () => {
    for (const meta of [findIssuesMeta, createIssueMeta, updateIssueMeta]) {
      const priority = meta.fields.find((f) => f.name === "priority");
      expect(priority).toMatchObject({ type: "select" });
      // Named levels, values are the wire integers as strings (FieldMeta contract).
      expect((priority as { options: { value: string; label: string }[] }).options).toEqual([
        { value: "0", label: "No priority" },
        { value: "1", label: "Urgent" },
        { value: "2", label: "High" },
        { value: "3", label: "Medium" },
        { value: "4", label: "Low" },
      ]);
    }
  });

  it("priority schema coerces the picked value to a bounded wire integer and REJECTS out-of-range", () => {
    // Picker commits a string → coerced to the wire number.
    expect(FindIssuesConfigSchema.parse({ priority: "3" })).toEqual({ priority: 3 });
    // A mapped variable resolving to a number also passes.
    expect(FindIssuesConfigSchema.parse({ priority: 2 })).toEqual({ priority: 2 });
    // Out-of-range / negative / non-integer / non-numeric are rejected at parse.
    for (const bad of ["-1", "5", "1.5", "high", -1, 5]) {
      expect(() => FindIssuesConfigSchema.parse({ priority: bad })).toThrow();
    }
    // Optional — omitting is fine (Linear applies its own default).
    expect(FindIssuesConfigSchema.parse({})).toEqual({});
    // Same closed set is enforced on the write actions.
    expect(CreateIssueConfigSchema.parse({ title: "t", team: "Core", priority: "1" })).toMatchObject({ priority: 1 });
    expect(() => UpdateIssueConfigSchema.parse({ id: "LIN-1", priority: "9" })).toThrow();
  });

  it("numeric fields carry valid bounds: limit 1..250, estimate >= 0", () => {
    expect(() => FindIssuesConfigSchema.parse({ limit: 0 })).toThrow();
    expect(() => FindIssuesConfigSchema.parse({ limit: 251 })).toThrow();
    expect(FindIssuesConfigSchema.parse({ limit: 50 })).toEqual({ limit: 50 });
    expect(() => CreateIssueConfigSchema.parse({ title: "t", team: "Core", estimate: -1 })).toThrow();
    expect(CreateIssueConfigSchema.parse({ title: "t", team: "Core", estimate: 3 })).toMatchObject({ estimate: 3 });
  });
});

describe("generated handlers (executor seam)", () => {
  beforeEach(() => mockExecuteMcpTool.mockClear());

  it("delegates to the shared executor with the certified tool + pinned hash + bounded output", async () => {
    await createIssue({
      workflowId: "wf",
      userId: "u",
      accountId: "acct",
      runId: "run",
      nodeId: "n",
      config: { title: "t", team: "Core" },
      triggerEvent: null,
    } as never);
    const call = mockExecuteMcpTool.mock.calls[0]![0] as Record<string, unknown>;
    expect(call).toMatchObject({
      provider: "linear",
      serverUrl: "https://mcp.linear.app/mcp",
      tool: "save_issue", // create_issue is the create half of the save_issue dispatcher
      accountId: "acct",
      idempotent: false, // write
      output: { kind: "text" },
    });
    // pinned hash matches the certified snapshot (drift guard input).
    expect(typeof call.pinnedSchemaHash).toBe("string");
    expect((call.pinnedSchemaHash as string).length).toBeGreaterThanOrEqual(32);
    // args are the strict-parsed config — nothing extra.
    expect(call.args).toEqual({ title: "t", team: "Core" });
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
    // CS-6 — find_issues has a live-evidence-backed structured output (good);
    // the write actions remain text-only (poor) pending write-result evidence.
    const byKey = new Map(report.actions.map((a) => [a.key, a]));
    expect(byKey.get("linear:find_issues")!.outputQuality).toBe("good");
    for (const k of ["linear:create_issue", "linear:update_issue", "linear:add_comment"]) {
      expect(byKey.get(k)!.outputQuality).toBe("poor");
    }
  });

  it("registration fragments cover the 4 shipped actions", () => {
    expect(linearGeneratedActionMetas).toHaveLength(4);
    expect(linearGeneratedHandlers.map((h) => h.type)).toEqual([
      "find_issues",
      "create_issue",
      "update_issue",
      "add_comment",
    ]);
  });

  it("actions ARE registered in the meta + handler inventories (CS-3)", () => {
    const handlerInventory = readFileSync(
      path.join(repoRoot, "services", "execution", "handlers", "_handlerInventory.ts"),
      "utf8",
    );
    const metaSubRegistry = readFileSync(
      path.join(repoRoot, "services", "discovery", "providers", "linear.ts"),
      "utf8",
    );
    const metaInventory = readFileSync(
      path.join(repoRoot, "services", "discovery", "_metaInventory.ts"),
      "utf8",
    );
    // Handlers: 4 direct entries wired to the shared executor.
    expect(handlerInventory.includes("integrations/linear")).toBe(true);
    for (const type of ["find_issues", "create_issue", "update_issue", "add_comment"]) {
      expect(handlerInventory.includes(`type: "${type}"`)).toBe(true);
    }
    // Metas: meta-only sub-registry spread into the central inventory.
    expect(metaSubRegistry.includes("integrations/linear")).toBe(true);
    expect(metaInventory.includes("LINEAR_ACTION_METAS")).toBe(true);
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
