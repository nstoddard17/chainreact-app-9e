/**
 * @jest-environment node
 *
 * Tests for Facebook registry wiring — Slice 3.FACEBOOK-2. The handler
 * registry exposes exactly the 8 Facebook actions, each a function, with no
 * duplicates.
 */
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";

describe("facebook handler registry wiring", () => {
  const facebook = () =>
    listRegisteredHandlers().filter((h) => h.provider === "facebook");

  it("registers exactly 8 Facebook action handlers", () => {
    expect(facebook()).toHaveLength(8);
  });

  it("exposes the 8 expected (provider,type) keys with no duplicates", () => {
    const keys = facebook().map((h) => `${h.provider}:${h.type}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual([
      "facebook:comment_on_post",
      "facebook:create_post",
      "facebook:delete_post",
      "facebook:get_page_insights",
      "facebook:send_message",
      "facebook:update_post",
      "facebook:upload_photo",
      "facebook:upload_video",
    ]);
  });
});
