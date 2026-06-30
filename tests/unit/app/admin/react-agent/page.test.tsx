/**
 * @jest-environment node
 *
 * Tests for app/admin/react-agent/page.tsx (INTERNAL-FEEDBACK-1).
 *
 * Business rule: the internal React Agent dashboard is gated to ChainReact
 * internal admins. Denial UX by caller:
 *   - signed out → redirect to /auth/sign-in;
 *   - signed in but not an internal admin (incl. customer account owners) →
 *     notFound() (the surface is undiscoverable, not a 403);
 *   - internal admin → render the dashboard shell.
 *
 * The gate seam `loadInternalAdmin` is mocked here (its own branch behavior is
 * proven in gate.test.ts); this test proves the PAGE maps each state to the
 * correct Next.js navigation outcome.
 */

const mockRedirect = jest.fn((path: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;${path}` });
});
const mockNotFound = jest.fn(() => {
  throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_NOT_FOUND" });
});
jest.mock("next/navigation", () => ({
  redirect: (path: string) => mockRedirect(path),
  notFound: () => mockNotFound(),
}));

const mockLoadInternalAdmin = jest.fn();
jest.mock("@/app/api/internal/react-agent/_shared", () => ({
  loadInternalAdmin: () => mockLoadInternalAdmin(),
}));

jest.mock("@/components/app-shell/AppShell", () => ({
  AppShell: Object.assign(
    ({ children }: { children: unknown }) => children,
    { displayName: "AppShell" },
  ),
}));
jest.mock("@/features/admin/react-agent/ReactAgentFeedbackDashboard", () => ({
  ReactAgentFeedbackDashboard: Object.assign(() => null, {
    displayName: "ReactAgentFeedbackDashboard",
  }),
}));

import ReactAgentFeedbackPage from "@/app/admin/react-agent/page";
import { AppShell as AppShellRef } from "@/components/app-shell/AppShell";
import { ReactAgentFeedbackDashboard as DashboardRef } from "@/features/admin/react-agent/ReactAgentFeedbackDashboard";

function findElement(
  node: unknown,
  predicate: (el: { type: unknown; props: Record<string, unknown> }) => boolean,
): { type: unknown; props: Record<string, unknown> } | null {
  if (!node || typeof node !== "object") return null;
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (el.type !== undefined && el.props !== undefined) {
    if (predicate(el as { type: unknown; props: Record<string, unknown> })) {
      return el as { type: unknown; props: Record<string, unknown> };
    }
    const children = el.props.children;
    const kids = Array.isArray(children) ? children : [children];
    for (const c of kids) {
      const found = findElement(c, predicate);
      if (found) return found;
    }
  }
  return null;
}

beforeEach(() => {
  mockRedirect.mockClear();
  mockNotFound.mockClear();
  mockLoadInternalAdmin.mockReset();
});

describe("ReactAgentFeedbackPage — internal-admin gate", () => {
  it("redirects a signed-out visitor to sign-in", async () => {
    mockLoadInternalAdmin.mockResolvedValue({ status: "anonymous" });
    await expect(ReactAgentFeedbackPage()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(mockRedirect).toHaveBeenCalledWith("/auth/sign-in");
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it("notFound()s a signed-in customer account admin who is not an internal admin", async () => {
    mockLoadInternalAdmin.mockResolvedValue({ status: "denied" });
    await expect(ReactAgentFeedbackPage()).rejects.toThrow(/NEXT_NOT_FOUND/);
    expect(mockNotFound).toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("renders the dashboard shell for an internal admin", async () => {
    mockLoadInternalAdmin.mockResolvedValue({
      status: "ok",
      userId: "u1",
      email: "marcus@x.io",
    });
    const result = await ReactAgentFeedbackPage();
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockNotFound).not.toHaveBeenCalled();
    // Shell wrapped with the admin's email, dashboard rendered inside.
    const shell = findElement(result, (e) => e.type === AppShellRef);
    expect(shell).not.toBeNull();
    expect(shell?.props.userEmail).toBe("marcus@x.io");
    expect(findElement(result, (e) => e.type === DashboardRef)).not.toBeNull();
  });
});
