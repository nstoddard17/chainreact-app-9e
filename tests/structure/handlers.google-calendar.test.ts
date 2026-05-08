/**
 * Structure test: all 5 Google Calendar action handlers are registered
 * in services/execution/handlers/_registry.ts and reachable via
 * getActionHandler.
 */
import {
  getActionHandler,
  listRegisteredHandlers,
} from "@/services/execution/handlers/_registry";

describe("Google Calendar action handler registration", () => {
  const expectedTypes = [
    "create_event",
    "list_events",
    "update_event",
    "delete_event",
    "add_attendees",
  ] as const;

  it.each(expectedTypes)(
    "google-calendar:%s is registered and resolvable via getActionHandler",
    (type) => {
      const handler = getActionHandler("google-calendar", type);
      expect(handler).toBeDefined();
      expect(typeof handler).toBe("function");
    },
  );

  it("listRegisteredHandlers includes all 5 google-calendar entries", () => {
    const calendar = listRegisteredHandlers().filter(
      (h) => h.provider === "google-calendar",
    );
    expect(calendar).toHaveLength(5);
    expect(calendar.map((h) => h.type).sort()).toEqual(
      [...expectedTypes].sort(),
    );
  });

  it("does not return a handler for an unregistered google-calendar type", () => {
    expect(getActionHandler("google-calendar", "nonexistent")).toBeUndefined();
  });
});
