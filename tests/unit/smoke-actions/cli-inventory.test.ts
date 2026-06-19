/**
 * @jest-environment node
 *
 * Action smoke harness — offline CLI inventory adapter.
 *
 * The CLI reads the handler inventory + fixtures as TEXT (it must stay offline /
 * import-free). These tests pin that the text parse finds registered actions,
 * that fixtures are discovered + classified from disk, that a malformed fixture
 * is surfaced (not dropped), that --changed maps a diff to action keys, and that
 * the command exits non-zero on a violation.
 */
import type { FsDeps } from "@/scripts/chainreact/repo";
import type { ChangedFilesResult } from "@/scripts/chainreact/git";
import { runSmokeActions } from "@/scripts/chainreact/commands/smokeActions";
import {
  changedOnlyKeys,
  parseRegisteredActions,
  scanFixtures,
} from "@/scripts/chainreact/smoke/inventory";

/** Minimal in-memory FsDeps: files map + derived directory set. */
function fakeFs(files: Record<string, string>): FsDeps {
  const dirs = new Set<string>();
  for (const path of Object.keys(files)) {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i += 1) dirs.add(parts.slice(0, i).join("/"));
  }
  return {
    exists: (p) => files[p] !== undefined || dirs.has(p),
    isDirectory: (p) => dirs.has(p),
    listDir: (p) => {
      const out = new Set<string>();
      const prefix = `${p}/`;
      for (const path of [...Object.keys(files), ...dirs]) {
        if (path.startsWith(prefix)) {
          const rest = path.slice(prefix.length).split("/")[0];
          if (rest) out.add(rest);
        }
      }
      return [...out];
    },
    readText: (p) => files[p] ?? "",
  };
}

const HANDLER_INVENTORY = `
export const ALL_HANDLERS = [
  { provider: "slack", type: "list_channels", handler: slackListChannels },
  { provider: "slack", type: "delete_message", handler: slackDeleteMessage },
  {
    provider: "google-sheets",
    type: "create_spreadsheet",
    handler: sheetsCreateSpreadsheet,
  },
  { provider: "native", type: "format_transformer", handler: nativeFormatTransformer },
];
`;

function fixtureFile(risk: string, env: string[] = []): string {
  const envLine = env.length ? `  requiredEnv: [${env.map((e) => `"${e}"`).join(", ")}],\n` : "";
  return `export default defineActionSmokeFixture({\n  risk: "${risk}",\n${envLine}});\n`;
}

const FILES: Record<string, string> = {
  "services/execution/handlers/_handlerInventory.ts": HANDLER_INVENTORY,
  "tests/fixtures/action-smoke/native/format_transformer.ts": fixtureFile("read"),
  "tests/fixtures/action-smoke/slack/list_channels.ts": fixtureFile("read", ["SMOKE_SLACK_CONNECTED"]),
  "tests/fixtures/action-smoke/slack/delete_message.ts": fixtureFile("destructive"),
  // Non-fixture sibling that must be ignored by the scanner.
  "tests/fixtures/action-smoke/slack/_helpers.ts": "export const x = 1;",
};

const okChanged = (files: string[]): (() => ChangedFilesResult) => () => ({ ok: true, files });

describe("CLI inventory: registry text parse", () => {
  it("extracts every (provider, action) from the handler inventory, including multi-line entries", () => {
    const actions = parseRegisteredActions(HANDLER_INVENTORY);
    expect(actions).toContainEqual({ provider: "google-sheets", action: "create_spreadsheet" });
    expect(actions).toContainEqual({ provider: "native", action: "format_transformer" });
    expect(actions).toHaveLength(4);
  });
});

describe("CLI inventory: fixture scan", () => {
  it("discovers fixtures by provider dir + filename and reads their risk + env", () => {
    const { descriptors, errors } = scanFixtures(fakeFs(FILES));
    expect(errors).toHaveLength(0);
    expect(descriptors).toContainEqual({
      provider: "slack",
      action: "list_channels",
      risk: "read",
      requiredEnv: ["SMOKE_SLACK_CONNECTED"],
    });
    // `_helpers.ts` is ignored.
    expect(descriptors.find((d) => d.action === "_helpers")).toBeUndefined();
  });

  it("surfaces a malformed fixture (missing risk) instead of silently dropping it", () => {
    const broken = { ...FILES, "tests/fixtures/action-smoke/slack/broken.ts": "export default {};" };
    const { errors } = scanFixtures(fakeFs(broken));
    expect(errors.join(" ")).toMatch(/slack:broken.*missing a valid risk/);
  });
});

describe("CLI inventory: runSmokeActions end-to-end", () => {
  it("produces a clean inventory (exit 0) for well-formed fixtures", () => {
    const out = runSmokeActions({ json: true }, fakeFs(FILES), okChanged([]));
    expect(out.code).toBe(0);
    const parsed = JSON.parse(out.output);
    expect(parsed.totals).toMatchObject({ registered: 4, fixtureBacked: 2, missingFixture: 1, skipped: 1 });
  });

  it("narrows to one provider with --provider", () => {
    const out = runSmokeActions({ provider: "slack", json: true }, fakeFs(FILES), okChanged([]));
    const parsed = JSON.parse(out.output);
    expect(parsed.rows.every((r: { provider: string }) => r.provider === "slack")).toBe(true);
  });

  it("exits 1 when a fixture is mis-classified (destructive action marked read)", () => {
    const bad = {
      ...FILES,
      "tests/fixtures/action-smoke/slack/delete_message.ts": fixtureFile("read"),
    };
    const out = runSmokeActions({ json: true }, fakeFs(bad), okChanged([]));
    expect(out.code).toBe(1);
    expect(out.output).toMatch(/looks destructive/);
  });

  it("falls back to the full inventory with a note when git is unavailable", () => {
    const out = runSmokeActions({ changed: true }, fakeFs(FILES), () => ({
      ok: false,
      files: [],
      error: "not a git repository",
    }));
    expect(out.output).toMatch(/showing full inventory/);
  });
});

describe("CLI inventory: --changed scoping", () => {
  it("maps a changed fixture file to its exact action key", () => {
    const registered = parseRegisteredActions(HANDLER_INVENTORY);
    const keys = changedOnlyKeys(["tests/fixtures/action-smoke/slack/list_channels.ts"], registered);
    expect(keys).not.toBeNull();
    expect([...(keys as Set<string>)]).toEqual(["slack:list_channels"]);
  });

  it("widens a changed handler file to all of that provider's registered actions", () => {
    const registered = parseRegisteredActions(HANDLER_INVENTORY);
    const keys = changedOnlyKeys(["integrations/slack/actions/channels/listChannels.ts"], registered);
    expect([...(keys as Set<string>)].sort()).toEqual(["slack:delete_message", "slack:list_channels"]);
  });

  it("returns null when nothing in the diff maps to an action", () => {
    const registered = parseRegisteredActions(HANDLER_INVENTORY);
    expect(changedOnlyKeys(["docs/readme.md"], registered)).toBeNull();
  });
});
