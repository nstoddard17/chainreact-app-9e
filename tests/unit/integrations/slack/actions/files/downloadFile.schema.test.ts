/**
 * @jest-environment node
 *
 * Schema tests for integrations/slack/actions/files/downloadFile.schema.ts
 * (Slack 2.4 Commit 4).
 */
import { SlackDownloadFileConfigSchema } from "@/integrations/slack/actions/files/downloadFile.schema";

describe("SlackDownloadFileConfigSchema — happy path", () => {
  it("accepts a valid F-prefixed file id", () => {
    expect(
      SlackDownloadFileConfigSchema.safeParse({ fileId: "F12345" }).success,
    ).toBe(true);
  });

  it("accepts a long F-prefixed file id", () => {
    expect(
      SlackDownloadFileConfigSchema.safeParse({ fileId: "F0ABCDEF1234567890" })
        .success,
    ).toBe(true);
  });
});

describe("SlackDownloadFileConfigSchema — required + format", () => {
  it("rejects when fileId is missing", () => {
    expect(SlackDownloadFileConfigSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an empty fileId", () => {
    expect(
      SlackDownloadFileConfigSchema.safeParse({ fileId: "" }).success,
    ).toBe(false);
  });

  it("rejects a lowercase prefix (must be F)", () => {
    expect(
      SlackDownloadFileConfigSchema.safeParse({ fileId: "f12345" }).success,
    ).toBe(false);
  });

  it("rejects a non-F prefix (C/G/D/U are not file ids)", () => {
    for (const id of ["C12345", "G12345", "D12345", "U12345"]) {
      expect(SlackDownloadFileConfigSchema.safeParse({ fileId: id }).success).toBe(
        false,
      );
    }
  });

  it("rejects a fileId with lowercase alphanumerics", () => {
    expect(
      SlackDownloadFileConfigSchema.safeParse({ fileId: "Fabc123" }).success,
    ).toBe(false);
  });
});

describe("SlackDownloadFileConfigSchema — strict mode (V1 rot rejection)", () => {
  it("rejects a workspace selector field (V1 rot)", () => {
    expect(
      SlackDownloadFileConfigSchema.safeParse({
        fileId: "F12345",
        workspace: "T0001",
      }).success,
    ).toBe(false);
  });

  it("rejects an asUser toggle (V1 rot — bot-token only in V2)", () => {
    expect(
      SlackDownloadFileConfigSchema.safeParse({
        fileId: "F12345",
        asUser: true,
      }).success,
    ).toBe(false);
  });

  it("rejects a fileIdManual field (V1 had a dual-source picker)", () => {
    expect(
      SlackDownloadFileConfigSchema.safeParse({
        fileId: "F12345",
        fileIdManual: "F99999",
      }).success,
    ).toBe(false);
  });

  it("rejects a fileSource discriminator (V1 rot)", () => {
    expect(
      SlackDownloadFileConfigSchema.safeParse({
        fileId: "F12345",
        fileSource: "manual",
      }).success,
    ).toBe(false);
  });
});
