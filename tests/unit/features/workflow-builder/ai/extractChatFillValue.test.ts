/**
 * Tests for AI-CONFIG-ASSIST CS-3 deterministic value extraction.
 */
import { extractChatFillValue } from "@/features/workflow-builder/ai/extractChatFillValue";

describe("extractChatFillValue", () => {
  it("uses a quoted span and preserves its exact text", () => {
    expect(extractChatFillValue('put "hello from ChainReact" in the message')).toEqual({
      kind: "value",
      value: "hello from ChainReact",
    });
  });

  it("preserves exact spacing inside quotes", () => {
    expect(extractChatFillValue('set "  spaced value  " please')).toEqual({
      kind: "value",
      value: "  spaced value  ",
    });
  });

  it("supports curly quotes", () => {
    expect(extractChatFillValue("put “hi there” in it")).toEqual({ kind: "value", value: "hi there" });
  });

  it("treats a plain message as the whole value (trimmed)", () => {
    expect(extractChatFillValue("hello from ChainReact")).toEqual({
      kind: "value",
      value: "hello from ChainReact",
    });
    expect(extractChatFillValue("   hello   ")).toEqual({ kind: "value", value: "hello" });
  });

  it("flags an imperative-without-quotes message as ambiguous", () => {
    expect(extractChatFillValue("put hello in the message field")).toEqual({ kind: "ambiguous" });
    expect(extractChatFillValue("set the value to hello")).toEqual({ kind: "ambiguous" });
  });

  it("flags empty / whitespace / empty-quotes as ambiguous", () => {
    expect(extractChatFillValue("")).toEqual({ kind: "ambiguous" });
    expect(extractChatFillValue("    ")).toEqual({ kind: "ambiguous" });
    expect(extractChatFillValue('put "" in it')).toEqual({ kind: "ambiguous" });
  });
});
