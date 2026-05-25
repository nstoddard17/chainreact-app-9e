/**
 * @jest-environment node
 *
 * Schema tests for integrations/slack/actions/files/getFileInfo.schema.ts
 * (Slack 2.4 Commit 4).
 */
import { SlackGetFileInfoConfigSchema } from "@/integrations/slack/actions/files/getFileInfo.schema";

describe("SlackGetFileInfoConfigSchema — happy path", () => {
  it("accepts a valid F-prefixed file id", () => {
    expect(
      SlackGetFileInfoConfigSchema.safeParse({ fileId: "F12345" }).success,
    ).toBe(true);
  });

  it("accepts includeComments=true", () => {
    expect(
      SlackGetFileInfoConfigSchema.safeParse({
        fileId: "F12345",
        includeComments: true,
      }).success,
    ).toBe(true);
  });

  it("accepts includeComments=false", () => {
    expect(
      SlackGetFileInfoConfigSchema.safeParse({
        fileId: "F12345",
        includeComments: false,
      }).success,
    ).toBe(true);
  });
});

describe("SlackGetFileInfoConfigSchema — required + format", () => {
  it("rejects when fileId is missing", () => {
    expect(
      SlackGetFileInfoConfigSchema.safeParse({ includeComments: true }).success,
    ).toBe(false);
  });

  it("rejects lowercase / wrong-prefix file ids", () => {
    for (const id of ["f12345", "Fabc", "C12345", "U12345"]) {
      expect(
        SlackGetFileInfoConfigSchema.safeParse({ fileId: id }).success,
      ).toBe(false);
    }
  });

  it("rejects includeComments as a non-boolean", () => {
    expect(
      SlackGetFileInfoConfigSchema.safeParse({
        fileId: "F12345",
        includeComments: "yes",
      }).success,
    ).toBe(false);
  });
});

describe("SlackGetFileInfoConfigSchema — strict mode (V1 rot rejection)", () => {
  it("rejects a workspace selector field (V1 rot)", () => {
    expect(
      SlackGetFileInfoConfigSchema.safeParse({
        fileId: "F12345",
        workspace: "T0001",
      }).success,
    ).toBe(false);
  });

  it("rejects an asUser toggle (V1 rot — bot-token only in V2)", () => {
    expect(
      SlackGetFileInfoConfigSchema.safeParse({
        fileId: "F12345",
        asUser: true,
      }).success,
    ).toBe(false);
  });

  it("rejects V1's fileIdManual / fileSource dual-source picker", () => {
    expect(
      SlackGetFileInfoConfigSchema.safeParse({
        fileId: "F12345",
        fileIdManual: "F99999",
      }).success,
    ).toBe(false);
    expect(
      SlackGetFileInfoConfigSchema.safeParse({
        fileId: "F12345",
        fileSource: "manual",
      }).success,
    ).toBe(false);
  });
});
