/**
 * @jest-environment node
 *
 * Tests for the Gmail new_attachment MIME-tree walk helper.
 *
 * Pins the per-trigger metadata-extraction contract from Gmail 2.3
 * plan §6 "Walk function for attachments". Pure helper — no mocks,
 * no DB, no fetch.
 */
import { extractAttachmentMetadata } from "@/integrations/gmail/triggers/newAttachment/extractAttachmentMetadata";
import type {
  GmailMessagePart,
  UsersMessagesGetResult,
} from "@/integrations/gmail/api/usersMessagesGet";

function makeMessage(parts?: readonly GmailMessagePart[]): UsersMessagesGetResult {
  return {
    id: "msg-1",
    threadId: "thr-1",
    labelIds: [],
    snippet: "",
    internalDate: "0",
    sizeEstimate: 0,
    payload: {
      mimeType: parts ? "multipart/mixed" : "text/plain",
      headers: [],
      parts,
    },
  };
}

describe("extractAttachmentMetadata", () => {
  it("returns [] when payload.parts is undefined (metadata-only response)", () => {
    expect(extractAttachmentMetadata(makeMessage())).toEqual([]);
  });

  it("returns [] when payload.parts is an empty array", () => {
    expect(extractAttachmentMetadata(makeMessage([]))).toEqual([]);
  });

  it("ignores parts without a filename (inline / body parts)", () => {
    const result = extractAttachmentMetadata(
      makeMessage([
        {
          mimeType: "text/plain",
          filename: "",
          body: { attachmentId: "att-1", size: 100 },
        },
      ]),
    );
    expect(result).toEqual([]);
  });

  it("ignores parts without a body.attachmentId", () => {
    const result = extractAttachmentMetadata(
      makeMessage([
        {
          mimeType: "application/pdf",
          filename: "report.pdf",
          body: { size: 100 }, // no attachmentId
        },
      ]),
    );
    expect(result).toEqual([]);
  });

  it("ignores parts with missing body entirely", () => {
    const result = extractAttachmentMetadata(
      makeMessage([
        {
          mimeType: "application/pdf",
          filename: "report.pdf",
        },
      ]),
    );
    expect(result).toEqual([]);
  });

  it("extracts a single top-level attachment", () => {
    const result = extractAttachmentMetadata(
      makeMessage([
        {
          mimeType: "application/pdf",
          filename: "report.pdf",
          body: { attachmentId: "att-1", size: 4096 },
        },
      ]),
    );
    expect(result).toEqual([
      {
        attachmentId: "att-1",
        filename: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 4096,
      },
    ]);
  });

  it("walks nested multipart structures and extracts deep attachments", () => {
    const result = extractAttachmentMetadata(
      makeMessage([
        {
          mimeType: "multipart/alternative",
          filename: "",
          parts: [
            { mimeType: "text/plain", filename: "" },
            { mimeType: "text/html", filename: "" },
          ],
        },
        {
          mimeType: "multipart/mixed",
          filename: "",
          parts: [
            {
              mimeType: "application/pdf",
              filename: "deep.pdf",
              body: { attachmentId: "att-deep", size: 2048 },
            },
          ],
        },
      ]),
    );
    expect(result).toEqual([
      {
        attachmentId: "att-deep",
        filename: "deep.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048,
      },
    ]);
  });

  it("extracts multiple attachments in a single message", () => {
    const result = extractAttachmentMetadata(
      makeMessage([
        {
          mimeType: "application/pdf",
          filename: "a.pdf",
          body: { attachmentId: "att-a", size: 100 },
        },
        {
          mimeType: "image/png",
          filename: "b.png",
          body: { attachmentId: "att-b", size: 200 },
        },
      ]),
    );
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.attachmentId)).toEqual(["att-a", "att-b"]);
  });

  it("ignores inline images (no filename) even when they have an attachmentId", () => {
    const result = extractAttachmentMetadata(
      makeMessage([
        {
          mimeType: "image/png",
          filename: "", // inline image — no user-visible name
          body: { attachmentId: "inline-1", size: 500 },
        },
        {
          mimeType: "application/pdf",
          filename: "real.pdf",
          body: { attachmentId: "att-real", size: 100 },
        },
      ]),
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.filename).toBe("real.pdf");
  });

  it("treats missing body.size as 0 (Gmail occasionally omits)", () => {
    const result = extractAttachmentMetadata(
      makeMessage([
        {
          mimeType: "application/pdf",
          filename: "no-size.pdf",
          body: { attachmentId: "att-1" },
        },
      ]),
    );
    expect(result).toEqual([
      {
        attachmentId: "att-1",
        filename: "no-size.pdf",
        mimeType: "application/pdf",
        sizeBytes: 0,
      },
    ]);
  });

  it("treats missing part.mimeType as empty string", () => {
    const result = extractAttachmentMetadata(
      makeMessage([
        {
          filename: "unknown.bin",
          body: { attachmentId: "att-1", size: 10 },
        },
      ]),
    );
    expect(result[0]!.mimeType).toBe("");
  });
});
