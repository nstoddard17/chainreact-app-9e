import { render, screen } from "@testing-library/react";
import { OAuthPopupComplete } from "@/features/integrations/OAuthPopupComplete";
import { buildOAuthPopupMessage } from "@/core/integrations/oauthPopupBridge";

/**
 * REACT-AGENT-GUIDED-BUILD-1 — popup completion component. Posts exactly one
 * SAME-ORIGIN message to the opener and renders fixed, secret-free copy.
 */

const CONNECTED = buildOAuthPopupMessage({
  provider: "slack",
  status: "connected",
  nonce: "attempt-nonce-1234",
});

const FAILED = buildOAuthPopupMessage({
  provider: "slack",
  status: "error",
  nonce: "attempt-nonce-1234",
  errorCode: "callback_failed",
});

afterEach(() => {
  // jsdom: window.opener is configurable; reset between tests.
  Object.defineProperty(window, "opener", { value: null, configurable: true });
});

function stubOpener(): jest.Mock {
  const postMessage = jest.fn();
  Object.defineProperty(window, "opener", {
    value: { postMessage },
    configurable: true,
  });
  return postMessage;
}

it("posts the completion message to the opener with a SAME-ORIGIN target", () => {
  const postMessage = stubOpener();
  render(<OAuthPopupComplete result={CONNECTED} />);
  expect(postMessage).toHaveBeenCalledTimes(1);
  expect(postMessage).toHaveBeenCalledWith(CONNECTED, window.location.origin);
  expect(screen.getByTestId("oauth-popup-complete-connected")).toBeInTheDocument();
});

it("posts error results too and renders the retry note", () => {
  const postMessage = stubOpener();
  render(<OAuthPopupComplete result={FAILED} />);
  expect(postMessage).toHaveBeenCalledWith(FAILED, window.location.origin);
  expect(screen.getByTestId("oauth-popup-complete-error")).toBeInTheDocument();
});

it("renders a generic note and posts NOTHING for an invalid result", () => {
  const postMessage = stubOpener();
  render(<OAuthPopupComplete result={null} />);
  expect(postMessage).not.toHaveBeenCalled();
  expect(screen.getByTestId("oauth-popup-complete-invalid")).toBeInTheDocument();
});

it("survives a missing opener (opened directly)", () => {
  render(<OAuthPopupComplete result={CONNECTED} />);
  expect(screen.getByTestId("oauth-popup-complete-connected")).toBeInTheDocument();
});
