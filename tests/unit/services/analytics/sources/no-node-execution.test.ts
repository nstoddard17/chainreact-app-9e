import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Architecture guard (Slice ANALYTICS-SOURCES-1) — the non-negotiable rule:
 * analytics sources must NEVER execute trigger/action nodes or the workflow
 * engine. They are read-only aggregation. This pins that the source layer does
 * not import any execution/engine/node-dispatch path, so a future provider
 * adapter can't quietly wire widget config to connector execution.
 */

const SOURCE_FILES = [
  "services/analytics/sources/types.ts",
  "services/analytics/sources/registry.ts",
  "services/analytics/sources/querySource.ts",
  "services/analytics/sources/cache.ts",
  "services/analytics/sources/internal/index.ts",
  "services/analytics/sources/github/index.ts",
  "services/analytics/sources/github/api.ts",
  "services/analytics/sources/github/buckets.ts",
  "services/analytics/sources/slack/index.ts",
  "services/analytics/sources/slack/api.ts",
  "services/analytics/sources/slack/buckets.ts",
  "services/analytics/sources/google-calendar/index.ts",
  "services/analytics/sources/google-calendar/api.ts",
  "services/analytics/sources/google-calendar/buckets.ts",
  "services/analytics/sources/gmail/index.ts",
  "services/analytics/sources/gmail/api.ts",
  "services/analytics/sources/gmail/buckets.ts",
  "services/analytics/sources/stripe/index.ts",
  "services/analytics/sources/stripe/api.ts",
  "services/analytics/sources/stripe/buckets.ts",
  "services/analytics/sources/microsoft-outlook/index.ts",
  "services/analytics/sources/microsoft-outlook/api.ts",
  "services/analytics/sources/microsoft-outlook/buckets.ts",
  "services/analytics/sources/microsoft-outlook-calendar/index.ts",
  "services/analytics/sources/microsoft-outlook-calendar/api.ts",
  "services/analytics/sources/microsoft-outlook-calendar/buckets.ts",
  "services/analytics/sources/notion/index.ts",
  "services/analytics/sources/notion/api.ts",
  "services/analytics/sources/notion/buckets.ts",
  "services/analytics/sources/trello/index.ts",
  "services/analytics/sources/trello/api.ts",
  "services/analytics/sources/trello/buckets.ts",
  "services/analytics/sources/airtable/index.ts",
  "services/analytics/sources/airtable/api.ts",
  "services/analytics/sources/airtable/buckets.ts",
  "services/analytics/sources/monday/index.ts",
  "services/analytics/sources/monday/api.ts",
  "services/analytics/sources/monday/buckets.ts",
  "services/analytics/sources/hubspot/index.ts",
  "services/analytics/sources/hubspot/api.ts",
  "services/analytics/sources/hubspot/buckets.ts",
  "services/analytics/sources/shopify/index.ts",
  "services/analytics/sources/shopify/api.ts",
  "services/analytics/sources/shopify/buckets.ts",
  "services/analytics/sources/mailchimp/index.ts",
  "services/analytics/sources/mailchimp/api.ts",
  "services/analytics/sources/mailchimp/buckets.ts",
  "services/analytics/sources/dropbox/index.ts",
  "services/analytics/sources/dropbox/api.ts",
  "services/analytics/sources/dropbox/buckets.ts",
  "services/analytics/sources/microsoft-onedrive/index.ts",
  "services/analytics/sources/microsoft-onedrive/api.ts",
  "services/analytics/sources/microsoft-onedrive/buckets.ts",
  "services/analytics/sources/google-drive/index.ts",
  "services/analytics/sources/google-drive/api.ts",
  "services/analytics/sources/google-drive/buckets.ts",
  "services/analytics/sources/discord/index.ts",
  "services/analytics/sources/discord/api.ts",
  "services/analytics/sources/discord/buckets.ts",
  "services/analytics/sources/microsoft-teams/index.ts",
  "services/analytics/sources/microsoft-teams/api.ts",
  "services/analytics/sources/microsoft-teams/buckets.ts",
  "services/analytics/sources/_shared/googleWorkspaceFiles.ts",
  "services/analytics/sources/_shared/googleWorkspaceBuckets.ts",
  "services/analytics/sources/_shared/googleWorkspaceAdapter.ts",
  "services/analytics/sources/google-docs/index.ts",
  "services/analytics/sources/google-sheets/index.ts",
  "services/analytics/sources/microsoft-onenote/index.ts",
  "services/analytics/sources/microsoft-onenote/api.ts",
  "services/analytics/sources/microsoft-onenote/buckets.ts",
  "services/analytics/sources/facebook/index.ts",
  "services/analytics/sources/facebook/api.ts",
  "services/analytics/sources/facebook/buckets.ts",
  "services/analytics/sources/microsoft-excel/index.ts",
  "services/analytics/sources/microsoft-excel/api.ts",
  "services/analytics/sources/microsoft-excel/buckets.ts",
];

// Substrings that would indicate workflow-node / engine execution wiring.
const FORBIDDEN = [
  "services/execution",
  "executeAction",
  "executeNode",
  "executeWorkflow",
  "runWorkflow",
  "AdvancedExecutionEngine",
  "WorkflowExecutionService",
  "nodeExecutionService",
  "/engine",
  "triggerLifecycle",
];

describe("analytics sources never execute workflow nodes", () => {
  it.each(SOURCE_FILES)("%s imports no execution/engine path", (file) => {
    const content = readFileSync(resolve(process.cwd(), file), "utf8");
    for (const needle of FORBIDDEN) {
      expect(content.includes(needle)).toBe(false);
    }
  });

  it("the only async capability an adapter exposes is read-only query()", () => {
    // Compile-time the AnalyticsSourceAdapter interface has no execute/mutate
    // member; this asserts the registered adapter surface at runtime too.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { internalAnalyticsSource } = require("@/services/analytics/sources/internal");
    const keys = Object.keys(internalAnalyticsSource);
    expect(keys).toEqual(
      expect.arrayContaining(["providerKey", "displayName", "connectedApp", "metrics", "query"]),
    );
    expect(keys).not.toContain("execute");
    expect(typeof internalAnalyticsSource.query).toBe("function");
  });
});
