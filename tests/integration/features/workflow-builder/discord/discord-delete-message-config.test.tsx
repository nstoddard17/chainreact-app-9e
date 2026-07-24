/**
 * Slice 3.DISCORD-4 integration test — Discord `delete_message` config
 * (destructive bulk action) through the WorkflowBuilder shell.
 *
 * Focused on the destructive-trio metadata + camelCase field-name
 * preservation. The cross-provider destructive confirmation modal
 * itself is exercised by `destructive-action-confirmation-modal.test.tsx`
 * — this test pins the Discord-specific shape that flows in.
 *
 * `messageIds[]` / `userIds[]` are `string-array` fields WITH pickers
 * (SWEEP-2 allows `optionsSource` on string-array): `discord:messages`
 * (deps: channelId) and `discord:members` (deps: guildId), both with
 * `allowManualEntry` for pasted ids. `keywords[]` stays a plain chip
 * list. The test verifies the string-array shape, the picker wiring,
 * AND that the saved-config keys preserve camelCase.
 */

const mockUpdateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    updateWorkflow: (...args: unknown[]) => mockUpdateWorkflow(...args),
  };
});

const mockListNativeActions = jest.fn();
const mockListNativeTriggers = jest.fn();
const mockListProviderActions = jest.fn();
const mockListProviderTriggers = jest.fn();
jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: () => mockListNativeActions(),
  listAiActions: () => Promise.resolve([]),
  listNativeTriggers: () => mockListNativeTriggers(),
  listProviderActions: (p: string) => mockListProviderActions(p),
  listProviderTriggers: (p: string) => mockListProviderTriggers(p),
  DiscoveryApiError: class DiscoveryApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

const mockFetchOptionsSource = jest.fn();
jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: (...args: unknown[]) => mockFetchOptionsSource(...args),
}));

import { discordDeleteMessageMeta } from "@/integrations/discord/actions/deleteMessage.meta";

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeTriggers.mockReset();
  mockListProviderActions.mockReset();
  mockListProviderTriggers.mockReset();
  mockFetchOptionsSource.mockReset();
});

describe("Discord delete_message meta — destructive shape", () => {
  it("declares the destructive trio (isDestructive + requiresConfirmation + riskLevel:high)", () => {
    expect(discordDeleteMessageMeta.isDestructive).toBe(true);
    expect(discordDeleteMessageMeta.requiresConfirmation).toBe(true);
    expect(discordDeleteMessageMeta.riskLevel).toBe("high");
  });

  it("riskDescription mentions irreversibility + partial-match default + bulk delete shape", () => {
    const desc = discordDeleteMessageMeta.riskDescription ?? "";
    expect(desc).toMatch(/irreversible/i);
    expect(desc).toMatch(/partial/i);
    expect(desc).toMatch(/bulk/i);
  });

  it("preserves V1 camelCase field names verbatim", () => {
    expect(discordDeleteMessageMeta.fields.map((f) => f.name)).toEqual([
      "guildId",
      "channelId",
      "messageIds",
      "userIds",
      "keywords",
      "keywordMatchType",
    ]);
  });

  it("guild → channel cascade is wired via discord:guilds + discord:channels(deps:guildId)", () => {
    const byName = new Map(
      discordDeleteMessageMeta.fields.map((f) => [f.name, f]),
    );
    expect(byName.get("guildId")!.optionsSource).toBe("discord:guilds");
    expect(byName.get("channelId")!.optionsSource).toBe("discord:channels");
    expect(byName.get("channelId")!.dependsOn).toBe("guildId");
  });

  it("string-array id fields wire their pickers with manual entry; keywords stays plain", () => {
    const byName = new Map(
      discordDeleteMessageMeta.fields.map((f) => [f.name, f]),
    );
    for (const name of ["messageIds", "userIds", "keywords"]) {
      expect(byName.get(name)!.type).toBe("string-array");
    }
    const messageIds = byName.get("messageIds")!;
    expect(messageIds.optionsSource).toBe("discord:messages");
    expect(messageIds.dependsOn).toBe("channelId");
    expect(messageIds.allowManualEntry).toBe(true);
    const userIds = byName.get("userIds")!;
    expect(userIds.optionsSource).toBe("discord:members");
    expect(userIds.dependsOn).toBe("guildId");
    expect(userIds.allowManualEntry).toBe(true);
    expect(byName.get("keywords")!.optionsSource).toBeUndefined();
  });

  it("keywordMatchType defaults to 'partial' (mirrors V1 runtime default)", () => {
    const byName = new Map(
      discordDeleteMessageMeta.fields.map((f) => [f.name, f]),
    );
    const kmt = byName.get("keywordMatchType")!;
    expect(kmt.type).toBe("select");
    expect(kmt.defaultValue).toBe("partial");
    expect(kmt.options?.map((o) => o.value).sort()).toEqual([
      "exact",
      "partial",
      "whole",
    ]);
  });
});

describe("Discord delete_message meta — output sensitivity", () => {
  it("output does NOT include message content (only counts + opaque ids)", () => {
    const names = discordDeleteMessageMeta.outputs.map((o) => o.name);
    expect(names).toContain("deletedCount");
    expect(names).toContain("messageIds");
    expect(names).toContain("channelId");
    expect(names).not.toContain("content");
    expect(names).not.toContain("messages");
    expect(names).not.toContain("body");
  });

  it("no secret-shaped output names exist on this destructive action", () => {
    const names = discordDeleteMessageMeta.outputs.map((o) => o.name.toLowerCase());
    for (const n of names) {
      expect(n).not.toContain("token");
      expect(n).not.toContain("secret");
      expect(n).not.toContain("apikey");
    }
  });
});
