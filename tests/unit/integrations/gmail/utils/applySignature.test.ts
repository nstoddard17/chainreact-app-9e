/**
 * @jest-environment node
 *
 * Tests for the Gmail applySignature helper extracted from
 * sendEmail.ts in Gmail 2.1 Commit 3. Shared between send_email,
 * create_draft, create_draft_reply, reply_to_email.
 */
import { applySignature } from "@/integrations/gmail/utils/applySignature";

describe("applySignature", () => {
  it("returns undefined when body is undefined", () => {
    expect(applySignature(undefined, "sig", false)).toBeUndefined();
    expect(applySignature(undefined, "sig", true)).toBeUndefined();
  });

  it("returns the body unchanged when signature is undefined", () => {
    expect(applySignature("plain body", undefined, false)).toBe("plain body");
    expect(applySignature("<p>html</p>", undefined, true)).toBe("<p>html</p>");
  });

  it("returns the body unchanged when signature is an empty string", () => {
    expect(applySignature("plain", "", false)).toBe("plain");
    expect(applySignature("<p>html</p>", "", true)).toBe("<p>html</p>");
  });

  it("appends signature to textBody with V1-faithful `\\n\\n` separator", () => {
    expect(applySignature("Hello", "— sig", false)).toBe("Hello\n\n— sig");
  });

  it("appends signature to htmlBody with `<br><br>` separator", () => {
    expect(applySignature("<p>Hi</p>", "<p>— sig</p>", true)).toBe(
      "<p>Hi</p><br><br><p>— sig</p>",
    );
  });

  it("does NOT HTML-ify a textBody even when the signature contains HTML-looking bytes (G-R6 regression)", () => {
    // The function is a pure string append. The isHtml flag controls
    // the SEPARATOR only — never the content's interpretation.
    expect(applySignature("Hello", "<p>look</p>", false)).toBe(
      "Hello\n\n<p>look</p>",
    );
  });
});
