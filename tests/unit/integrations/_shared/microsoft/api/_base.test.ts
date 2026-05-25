/**
 * @jest-environment node
 *
 * Tests for the shared Microsoft Graph base-URL helper. Tiny module —
 * one function, one env override; tests guard the env override path
 * because the e2e mock relies on it.
 */
import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";

afterEach(() => {
  delete process.env.MICROSOFT_GRAPH_API_BASE;
});

describe("graphApiBase", () => {
  it("defaults to https://graph.microsoft.com when MICROSOFT_GRAPH_API_BASE is unset", () => {
    expect(graphApiBase()).toBe("https://graph.microsoft.com");
  });

  it("returns MICROSOFT_GRAPH_API_BASE verbatim when set (e2e override)", () => {
    process.env.MICROSOFT_GRAPH_API_BASE = "http://127.0.0.1:9876";
    expect(graphApiBase()).toBe("http://127.0.0.1:9876");
  });

  it("does not normalize trailing slashes (callers control path joining)", () => {
    process.env.MICROSOFT_GRAPH_API_BASE = "https://graph.example.test/";
    expect(graphApiBase()).toBe("https://graph.example.test/");
  });
});
