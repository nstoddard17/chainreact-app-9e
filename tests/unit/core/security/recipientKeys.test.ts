/**
 * @jest-environment node
 *
 * Tests for the shared recipient/destination key classifier
 * (`core/security/recipientKeys.ts`, AI-REPAIR-3A). This is the single source of
 * truth used by BOTH the builder chat-fill guard and the server apply-safety
 * contract, so its behavior must stay identical to the original CS-1 word list.
 */
import { isRecipientOrDestinationKey } from "@/core/security/recipientKeys";

describe("isRecipientOrDestinationKey", () => {
  it.each(["to", "cc", "bcc", "recipient", "recipients", "attendees", "channel", "channelId", "webhookUrl", "email", "phone", "address", "destination", "target"])(
    "flags recipient/destination key %s",
    (key) => {
      expect(isRecipientOrDestinationKey(key)).toBe(true);
    },
  );

  it.each(["text", "body", "subject", "message", "customMessage", "title", "summary", "note"])(
    "does not flag normal text key %s",
    (key) => {
      expect(isRecipientOrDestinationKey(key)).toBe(false);
    },
  );
});
