/**
 * Tests for features/marketing/MarketingHero (Slice 4.HOMEPAGE-V2-1).
 *
 * Covers the hero's contract — single h1, prompt textarea is accessibly
 * labeled, prompt submit funnels to /auth/sign-up (no preserved-prompt
 * promise), "Start building" CTA points at sign-up.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { MarketingHero } from "@/features/marketing/MarketingHero";

beforeEach(() => {
  mockPush.mockReset();
});

describe("MarketingHero", () => {
  it("renders the editorial h1 headline", () => {
    render(<MarketingHero />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toMatch(/Automations,/i);
    expect(h1.textContent).toMatch(/small businesses/i);
  });

  it("prompt textarea has an accessible label", () => {
    render(<MarketingHero />);
    expect(
      screen.getByRole("textbox", { name: /describe what you want to automate/i }),
    ).toBeInTheDocument();
  });

  it("submitting the prompt funnels to /auth/sign-up (no preserved-prompt promise)", async () => {
    const user = userEvent.setup();
    render(<MarketingHero />);
    const form = screen.getByTestId("marketing-hero-prompt") as HTMLFormElement;
    // Submit via the form's submit button (matches the design's "→" send button).
    const submit = screen.getByRole("button", { name: /get started/i });
    await user.click(submit);
    expect(mockPush).toHaveBeenCalledWith("/auth/sign-up");
    // Sanity: we did NOT navigate anywhere implying a preserved prompt.
    expect(mockPush).toHaveBeenCalledTimes(1);
    // Form still in the document — we don't reload, we route.
    expect(form).toBeInTheDocument();
  });

  it("'Start building' CTA links to /auth/sign-up", () => {
    render(<MarketingHero />);
    expect(screen.getByTestId("marketing-hero-start")).toHaveAttribute(
      "href",
      "/auth/sign-up",
    );
  });
});
