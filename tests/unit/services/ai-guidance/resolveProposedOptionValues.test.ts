/** @jest-environment node */
/**
 * Canonical-resolver pass for model-proposed dynamic option values (REACT-CONFIG-COVERAGE-1).
 *
 * The provider boundary is mocked via the injectable `resolveImpl` (the real implementation is the
 * SAME account-scoped options tool the builder uses). Pins scenario 6: a user-named LABEL maps to
 * the stored option value; unresolvable/ambiguous labels defer to targeted input; dependsOn parents
 * gate cascades; resolver failures fail closed.
 */
import { resolveProposedOptionValues } from "@/services/ai-guidance/planConfig/resolveProposedOptionValues";
import type { AiToolResult } from "@/services/ai/tools/types";
import type { ResolveOptionsView } from "@/services/ai/tools/options";

function ok(items: { value: string; label: string }[], hasMore = false): AiToolResult<ResolveOptionsView> {
  return { ok: true, data: { source: "s", items, hasMore, truncated: false } } as AiToolResult<ResolveOptionsView>;
}

const CHANNELS = [
  { value: "C123", label: "general" },
  { value: "C456", label: "alerts" },
];

describe("resolveProposedOptionValues", () => {
  it("maps a user-named label to the stored option value (slack channel by name)", async () => {
    const resolveImpl = jest.fn().mockResolvedValue(ok(CHANNELS));
    const [target] = await resolveProposedOptionValues({
      userId: "user-1",
      targets: [
        {
          ref: "s1",
          kind: "action",
          capabilityKey: "slack:send_channel_message",
          config: { channel: "general", text: "hi" },
        },
      ],
      resolveImpl,
    });
    expect(target!.config.channel).toBe("C123");
    expect(target!.config.text).toBe("hi");
    expect(target!.deferredFields).toHaveLength(0);
    expect(resolveImpl).toHaveBeenCalledWith(
      expect.objectContaining({ source: expect.stringContaining("slack"), userId: "user-1" }),
    );
  });

  it("keeps a value that already IS a stored option value", async () => {
    const resolveImpl = jest.fn().mockResolvedValue(ok(CHANNELS));
    const [target] = await resolveProposedOptionValues({
      userId: "u",
      targets: [
        { ref: "s1", kind: "action", capabilityKey: "slack:send_channel_message", config: { channel: "C456" } },
      ],
      resolveImpl,
    });
    expect(target!.config.channel).toBe("C456");
  });

  it("defers an unresolvable label to targeted input instead of dropping it silently or guessing", async () => {
    const resolveImpl = jest.fn().mockResolvedValue(ok(CHANNELS));
    const [target] = await resolveProposedOptionValues({
      userId: "u",
      targets: [
        { ref: "s1", kind: "action", capabilityKey: "slack:send_channel_message", config: { channel: "nonexistent" } },
      ],
      resolveImpl,
    });
    expect(target!.config.channel).toBeUndefined();
    expect(target!.deferredFields).toEqual(["channel"]);
  });

  it("defers on ambiguous labels (two options with the same label)", async () => {
    const resolveImpl = jest
      .fn()
      .mockResolvedValue(ok([{ value: "A", label: "general" }, { value: "B", label: "General" }]));
    const [target] = await resolveProposedOptionValues({
      userId: "u",
      targets: [
        { ref: "s1", kind: "action", capabilityKey: "slack:send_channel_message", config: { channel: "general" } },
      ],
      resolveImpl,
    });
    expect(target!.config.channel).toBeUndefined();
    expect(target!.deferredFields).toEqual(["channel"]);
  });

  it("defers when the resolver fails (disconnected integration / provider error)", async () => {
    const resolveImpl = jest
      .fn()
      .mockResolvedValue({ ok: false, error: { code: "INTEGRATION_DISCONNECTED", message: "x" } });
    const [target] = await resolveProposedOptionValues({
      userId: "u",
      targets: [
        { ref: "s1", kind: "action", capabilityKey: "slack:send_channel_message", config: { channel: "general" } },
      ],
      resolveImpl,
    });
    expect(target!.config.channel).toBeUndefined();
    expect(target!.deferredFields).toEqual(["channel"]);
  });

  it("maps string-array dynamic values item-by-item (gmail labels by name)", async () => {
    const resolveImpl = jest
      .fn()
      .mockResolvedValue(ok([{ value: "INBOX", label: "Inbox" }, { value: "Label_7", label: "Vendors" }]));
    const [target] = await resolveProposedOptionValues({
      userId: "u",
      targets: [
        { ref: "s0", kind: "trigger", capabilityKey: "gmail:new_email", config: { labelIds: ["Vendors"] } },
      ],
      resolveImpl,
    });
    expect(target!.config.labelIds).toEqual(["Label_7"]);
  });

  it("leaves {{...}} variable values untouched and never calls the resolver for them", async () => {
    const resolveImpl = jest.fn();
    const [target] = await resolveProposedOptionValues({
      userId: "u",
      targets: [
        {
          ref: "s1",
          kind: "action",
          capabilityKey: "slack:send_channel_message",
          config: { channel: "{{trigger.channelId}}" },
        },
      ],
      resolveImpl,
    });
    expect(target!.config.channel).toBe("{{trigger.channelId}}");
    expect(resolveImpl).not.toHaveBeenCalled();
  });

  it("respects onlyFields (edit path: merged config for deps, but only op fields resolved)", async () => {
    const resolveImpl = jest.fn().mockResolvedValue(ok(CHANNELS));
    const [target] = await resolveProposedOptionValues({
      userId: "u",
      targets: [
        {
          ref: "0",
          kind: "action",
          capabilityKey: "slack:send_channel_message",
          config: { channel: "C999-existing-unverified", text: "new text" },
          onlyFields: ["text"],
        },
      ],
      resolveImpl,
    });
    // channel is NOT in onlyFields → untouched, no resolver call for it
    expect(target!.config.channel).toBe("C999-existing-unverified");
    expect(resolveImpl).not.toHaveBeenCalled();
  });
});
