/**
 * @jest-environment node
 *
 * Slice 3.FACEBOOK-4 builder-shape test — Facebook `send_message`. Pins the
 * page → conversation cascade, the message textarea, the runtime field name
 * (`recipientId`, NOT `conversationId`), and that persisted config parses —
 * including the `conversationId:psid` resolver value shape.
 */
import { facebookSendMessageMeta } from "@/integrations/facebook/actions/sendMessage.meta";
import { SendMessageConfigSchema } from "@/integrations/facebook/actions/sendMessage.schema";

describe("facebook send_message meta — Builder shape (page → conversation cascade)", () => {
  it("declares pageId + recipientId + message (runtime field name preserved)", () => {
    expect(facebookSendMessageMeta.fields.map((f) => f.name)).toEqual([
      "pageId",
      "recipientId",
      "message",
    ]);
  });

  it("conversation picker wires facebook:conversations dependsOn pageId", () => {
    const page = facebookSendMessageMeta.fields.find((f) => f.name === "pageId")!;
    const recipient = facebookSendMessageMeta.fields.find((f) => f.name === "recipientId")!;
    expect(page.optionsSource).toBe("facebook:pages");
    expect(recipient.optionsSource).toBe("facebook:conversations");
    expect(recipient.dependsOn).toBe("pageId");
    expect(recipient.required).toBe(true);
  });

  it("message is a required textarea", () => {
    const f = facebookSendMessageMeta.fields.find((x) => x.name === "message")!;
    expect(f.type).toBe("textarea");
    expect(f.required).toBe(true);
  });

  it("recipientId output (PSID) is marked sensitive", () => {
    expect(
      facebookSendMessageMeta.outputs.find((o) => o.name === "recipientId")!.sensitive,
    ).toBe(true);
  });

  it("description does NOT mention Messenger / App Review", () => {
    const all = [
      facebookSendMessageMeta.description,
      facebookSendMessageMeta.riskDescription ?? "",
      ...facebookSendMessageMeta.fields.flatMap((f) => [f.label, f.description ?? ""]),
    ].join(" ");
    expect(all).not.toMatch(/app review/i);
    expect(all).not.toMatch(/advanced access/i);
    expect(all).not.toMatch(/messenger platform review/i);
  });

  it("persisted config parses with the conversationId:psid resolver value shape", () => {
    expect(() =>
      SendMessageConfigSchema.parse({
        pageId: "123",
        recipientId: "t_456:7890",
        message: "Thanks for reaching out!",
      }),
    ).not.toThrow();
  });

  it("persisted config also parses with a raw PSID", () => {
    expect(() =>
      SendMessageConfigSchema.parse({
        pageId: "123",
        recipientId: "7890",
        message: "Hi",
      }),
    ).not.toThrow();
  });

  it("risk: medium", () => {
    expect(facebookSendMessageMeta.riskLevel).toBe("medium");
    expect(facebookSendMessageMeta.isDestructive).toBe(false);
  });
});
