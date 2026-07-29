import { act, renderHook, waitFor } from "@testing-library/react";
import { buildOAuthPopupMessage } from "@/core/integrations/oauthPopupBridge";
import { useGuidedConnect } from "@/features/workflow-builder/hooks/useGuidedConnect";

/**
 * REACT-AGENT-GUIDED-BUILD-1 — the popup connect controller.
 *
 * Locks the security contract of the completion listener (origin + nonce
 * validation), the refresh-on-complete behavior, the popup-blocked fallback,
 * and cancel detection when the popup closes without completing.
 */

const mockStartOAuth = jest.fn();
jest.mock("@/lib/api/integrations", () => ({
  startOAuth: (...a: unknown[]) => mockStartOAuth(...a),
}));

interface FakePopup {
  closed: boolean;
  close: jest.Mock;
}

let openedPopups: FakePopup[];
let openSpy: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  openedPopups = [];
  mockStartOAuth.mockReset();
  mockStartOAuth.mockResolvedValue({ redirectUrl: "https://provider.example/authorize?x=1" });
  openSpy = jest.spyOn(window, "open").mockImplementation(() => {
    const popup: FakePopup = { closed: false, close: jest.fn() };
    popup.close.mockImplementation(() => {
      popup.closed = true;
    });
    openedPopups.push(popup);
    return popup as unknown as Window;
  });
});

afterEach(() => {
  openSpy.mockRestore();
  jest.useRealTimers();
});

function sentNonce(): string {
  const call = mockStartOAuth.mock.calls[0]![1] as {
    returnContext: { surface: string; nonce: string };
  };
  return call.returnContext.nonce;
}

function dispatchCompletion(data: unknown, origin: string = window.location.origin): void {
  window.dispatchEvent(new MessageEvent("message", { data, origin }));
}

async function launch(refresh = jest.fn()) {
  const view = renderHook(() => useGuidedConnect({ onRefreshConnections: refresh }));
  act(() => view.result.current.connect("slack"));
  // startOAuth resolves on a microtask; flush it.
  await act(async () => {
    await Promise.resolve();
  });
  return { ...view, refresh };
}

it("sends the allow-listed return context and opens a popup", async () => {
  const { result } = await launch();
  expect(mockStartOAuth).toHaveBeenCalledWith("slack", {
    returnContext: { surface: "builder_popup", nonce: expect.stringMatching(/^[0-9a-f]{32}$/) },
  });
  expect(openedPopups).toHaveLength(1);
  expect(result.current.attempt).toEqual({ provider: "slack", status: "waiting" });
});

it("a valid same-origin completion message refreshes connections and completes", async () => {
  const { result, refresh } = await launch();
  const msg = buildOAuthPopupMessage({
    provider: "slack",
    status: "connected",
    nonce: sentNonce(),
  });
  act(() => dispatchCompletion(msg));
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(result.current.attempt).toEqual({ provider: "slack", status: "completed" });
  expect(openedPopups[0]!.close).toHaveBeenCalled();
});

it("REJECTS a completion message from a foreign origin", async () => {
  const { result, refresh } = await launch();
  const msg = buildOAuthPopupMessage({
    provider: "slack",
    status: "connected",
    nonce: sentNonce(),
  });
  act(() => dispatchCompletion(msg, "https://evil.example"));
  expect(refresh).not.toHaveBeenCalled();
  expect(result.current.attempt).toEqual({ provider: "slack", status: "waiting" });
});

it("REJECTS a completion message with the wrong nonce", async () => {
  const { result, refresh } = await launch();
  const msg = buildOAuthPopupMessage({
    provider: "slack",
    status: "connected",
    nonce: "0000000000000000000000000000dead",
  });
  act(() => dispatchCompletion(msg));
  expect(refresh).not.toHaveBeenCalled();
  expect(result.current.attempt).toEqual({ provider: "slack", status: "waiting" });
});

it("an error completion surfaces failed + the stable code (retry available)", async () => {
  const { result } = await launch();
  const msg = buildOAuthPopupMessage({
    provider: "slack",
    status: "error",
    nonce: sentNonce(),
    errorCode: "access_denied",
  });
  act(() => dispatchCompletion(msg));
  expect(result.current.attempt).toEqual({
    provider: "slack",
    status: "failed",
    errorCode: "access_denied",
  });
});

it("popup closed WITHOUT completing → refresh, then canceled after the grace window", async () => {
  const { result, refresh } = await launch();
  act(() => {
    openedPopups[0]!.closed = true;
  });
  // Close-watch interval fires → refresh; grace timer then marks canceled.
  act(() => {
    jest.advanceTimersByTime(600);
  });
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(result.current.attempt).toEqual({ provider: "slack", status: "waiting" });
  act(() => {
    jest.advanceTimersByTime(1600);
  });
  expect(result.current.attempt).toEqual({ provider: "slack", status: "canceled" });
});

it("a late completion message within the grace window still wins over cancel", async () => {
  const { result, refresh } = await launch();
  const msg = buildOAuthPopupMessage({
    provider: "slack",
    status: "connected",
    nonce: sentNonce(),
  });
  act(() => {
    openedPopups[0]!.closed = true;
  });
  act(() => {
    jest.advanceTimersByTime(600);
  });
  act(() => dispatchCompletion(msg));
  act(() => {
    jest.advanceTimersByTime(5000);
  });
  expect(result.current.attempt).toEqual({ provider: "slack", status: "completed" });
  expect(refresh).toHaveBeenCalledTimes(2); // close fallback + completion
});

it("a blocked popup surfaces popup_blocked (no dead waiting state)", async () => {
  openSpy.mockImplementation(() => null);
  const { result } = await launch();
  expect(result.current.attempt).toEqual({ provider: "slack", status: "popup_blocked" });
});

it("a failed connect POST surfaces failed with the stable connect code", async () => {
  mockStartOAuth.mockRejectedValueOnce(new Error("forbidden"));
  const { result } = await launch();
  await waitFor(() =>
    expect(result.current.attempt).toEqual({
      provider: "slack",
      status: "failed",
      errorCode: "connect_failed",
    }),
  );
});
