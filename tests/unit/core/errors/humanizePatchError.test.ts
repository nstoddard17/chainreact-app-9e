/**
 * Tests for core/errors/humanizePatchError (Slice 4.PROVIDER-CATALOG-INTEGRITY-1).
 *
 * User-facing patch-error copy must avoid raw provider:type keys, "registered",
 * and "V2"; the raw message is retained only as `devDetail`.
 */
import { humanizePatchError } from "@/core/errors/humanizePatchError";

const RAW_TRIGGER = {
  code: "UNKNOWN_TRIGGER",
  message: "'gmail:gmail:new_email' is not a registered trigger. The agent cannot use a trigger that V2 does not expose.",
};
const RAW_ACTION = {
  code: "UNKNOWN_ACTION",
  message: "'acme:do_thing' is not a registered action. The agent cannot use an action that V2 does not expose.",
};

describe("humanizePatchError", () => {
  it("UNKNOWN_TRIGGER → friendly copy with no raw key / 'registered' / 'V2'", () => {
    const { message, devDetail } = humanizePatchError(RAW_TRIGGER);
    expect(message).toBe(
      "This trigger isn't available yet. The agent can only use triggers the system currently supports.",
    );
    expect(message).not.toMatch(/V2|registered|gmail:/);
    // Raw key retained for dev only.
    expect(devDetail).toBe(RAW_TRIGGER.message);
  });

  it("UNKNOWN_TRIGGER with a subject weaves in the friendly node name (no doubled key)", () => {
    const { message } = humanizePatchError(RAW_TRIGGER, { subject: "Gmail 'New Email'" });
    expect(message).toBe(
      "Gmail 'New Email' isn't available as a trigger yet. The agent can only use triggers the system currently supports.",
    );
    expect(message).not.toMatch(/V2|registered|gmail:gmail/);
  });

  it("UNKNOWN_ACTION → friendly action copy", () => {
    const { message } = humanizePatchError(RAW_ACTION, { subject: "Acme 'Do Thing'" });
    expect(message).toBe(
      "Acme 'Do Thing' isn't available as an action yet. The agent can only use actions the system currently supports.",
    );
    expect(message).not.toMatch(/V2|registered/);
  });

  it("UNKNOWN_NODE → friendly missing-node copy", () => {
    const { message } = humanizePatchError({ code: "UNKNOWN_NODE", message: "node 'action1' is not in the workflow." });
    expect(message).toBe(
      "The plan tried to update a node that's no longer in this workflow. Please try again.",
    );
    expect(message).not.toMatch(/action1/);
  });

  it("MISSING_REQUIRED_FIELD with field + node labels → friendly copy, no raw key", () => {
    const e = { code: "MISSING_REQUIRED_FIELD", message: "Required field 'text' is missing on slack:send_channel_message." };
    const { message, devDetail } = humanizePatchError(e, { fieldLabel: "Message", nodeLabel: "Send Channel Message" });
    expect(message).toBe("Required field “Message” is missing on “Send Channel Message.”");
    // No raw field key / provider:type key in the user-facing copy…
    expect(message).not.toMatch(/'text'|\btext\b|slack:send_channel_message/);
    // …but the raw message is retained for dev only.
    expect(devDetail).toBe(e.message);
  });

  it("MISSING_REQUIRED_FIELD with no labels → generic safe copy (never the raw key)", () => {
    const e = { code: "MISSING_REQUIRED_FIELD", message: "Required field 'text' is missing on slack:send_channel_message." };
    const { message } = humanizePatchError(e);
    expect(message).toBe("A required field is missing.");
    expect(message).not.toMatch(/'text'|slack:send_channel_message/);
  });

  it("INVALID_CONFIG with field + node labels → friendly type copy, no raw key", () => {
    const e = { code: "INVALID_CONFIG", message: "Field 'text' on slack:send_channel_message expects type 'textarea'." };
    const { message } = humanizePatchError(e, { fieldLabel: "Message", nodeLabel: "Send Channel Message" });
    expect(message).toBe("The value for “Message” on “Send Channel Message” isn’t the right type.");
    expect(message).not.toMatch(/'text'|slack:send_channel_message|textarea/);
  });

  it("passes genuinely un-humanized codes through unchanged (message === devDetail)", () => {
    const e = { code: "DUPLICATE_EDGE_ID", message: "Two edges share the id 'e1'." };
    const { message, devDetail } = humanizePatchError(e);
    expect(message).toBe(e.message);
    expect(devDetail).toBe(e.message);
  });
});
