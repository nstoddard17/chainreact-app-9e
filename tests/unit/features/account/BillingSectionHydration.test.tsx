/**
 * BILLING-CHECKOUT-PROD-1 — deterministic billing-period text (React #418 guard).
 *
 * `BillingSection` lives inside the "use client" AccountSettings subtree, which Next renders
 * TWICE: once on the server (SSR) and once in the browser (hydration). It used to derive the
 * current usage period from `new Date()` DURING RENDER, so each pass read its own clock.
 * Whenever the two passes straddled a period boundary the server emitted one reset date and
 * the client hydrated a different one — a server/client text mismatch, which React reports in
 * production as minified error #418.
 *
 * The fix pins the instant on the server (`billing.usageNowIso`) and ships it in the RSC
 * payload, so both passes compute from the same value. These tests simulate the two passes by
 * rendering the SAME props under two different system clocks that straddle a boundary.
 */
import { render } from "@testing-library/react";
import { BillingSection, type AccountBillingView } from "@/features/account/AccountSections";

jest.mock("@/lib/api/personalBilling", () => ({
  getPersonalBillingState: jest.fn(() => new Promise(() => {})),
  setPersonalCancelAtPeriodEnd: jest.fn(),
}));
jest.mock("@/features/account/CheckoutChoiceButton", () => ({
  CheckoutChoiceButton: () => <button data-testid="ccb">Upgrade</button>,
}));

const PERIOD_START = "2026-07-26T00:00:00Z";
/** The period rolls over on 2026-08-26, so these two instants straddle the boundary. */
const SERVER_RENDER_AT = new Date("2026-08-25T23:59:00Z");
const CLIENT_HYDRATE_AT = new Date("2026-08-26T00:01:00Z");

const billing: AccountBillingView = {
  usage: { tasksUsed: 12, tasksLimit: 100, periodStartedAt: PERIOD_START },
  memberLimit: null,
  memberCount: null,
  folderLimit: 10,
  frozen: false,
};

const account = { name: "Personal", type: "personal" as const, role: "owner" as const };

/**
 * Render the section with the system clock pinned to `clock`, returning the section's full
 * rendered text — the same thing React compares when it hydrates server-rendered markup.
 */
function renderAtClock(clock: Date, view: AccountBillingView): string {
  jest.useFakeTimers().setSystemTime(clock);
  try {
    const { container, unmount } = render(
      <BillingSection active={account} billing={view} />,
    );
    const text = container.textContent ?? "";
    unmount();
    return text;
  } finally {
    jest.useRealTimers();
  }
}

describe("billing reset-date text is identical on the server and client passes", () => {
  it("renders the same reset date even when the two passes straddle the period boundary", () => {
    const pinned: AccountBillingView = {
      ...billing,
      usageNowIso: SERVER_RENDER_AT.toISOString(),
    };

    const serverPass = renderAtClock(SERVER_RENDER_AT, pinned);
    const clientPass = renderAtClock(CLIENT_HYDRATE_AT, pinned);

    expect(serverPass).toContain("resets August 26, 2026");
    // The load-bearing assertion: hydration must reproduce the server's text exactly.
    expect(clientPass).toBe(serverPass);
  });

  it("still renders the server's date when the client clock has moved well past it", () => {
    const pinned: AccountBillingView = {
      ...billing,
      usageNowIso: SERVER_RENDER_AT.toISOString(),
    };
    const late = renderAtClock(new Date("2026-09-30T00:00:00Z"), pinned);
    expect(late).toContain("resets August 26, 2026");
  });

  it("fails over the ORIGINAL defect: without the server-pinned instant the passes disagree", () => {
    // This is the pre-fix behavior (no `usageNowIso` → each render reads its own clock).
    // It documents precisely what #418 was reporting, and keeps the guard above meaningful:
    // if the fix is reverted, the first test's equality assertion breaks.
    const serverPass = renderAtClock(SERVER_RENDER_AT, billing);
    const clientPass = renderAtClock(CLIENT_HYDRATE_AT, billing);

    expect(serverPass).toContain("resets August 26, 2026");
    expect(clientPass).toContain("resets September 26, 2026");
    expect(clientPass).not.toBe(serverPass);
  });

  it("ignores a malformed pinned instant rather than rendering an invalid date", () => {
    const text = renderAtClock(SERVER_RENDER_AT, {
      ...billing,
      usageNowIso: "not-a-date",
    });
    expect(text).not.toContain("Invalid Date");
    expect(text).toContain("resets August 26, 2026");
  });
});

describe("the reset date does not depend on the viewer's time zone", () => {
  it("formats in UTC, so a client in a behind-UTC zone shows the server's date", () => {
    // The date is formatted with an explicit `timeZone: "UTC"`, so an instant just after
    // midnight UTC cannot render as the previous day for a US viewer.
    const pinned: AccountBillingView = {
      ...billing,
      usageNowIso: "2026-08-26T00:30:00Z",
    };
    expect(renderAtClock(new Date("2026-08-26T00:30:00Z"), pinned)).toContain(
      "resets September 26, 2026",
    );
  });
});
