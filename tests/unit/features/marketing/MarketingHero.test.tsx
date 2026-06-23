/**
 * Tests for features/marketing/MarketingHero (Slice 4.HOMEPAGE-V2-1,
 * ANON-BUILDER-1).
 *
 * Covers the hero's contract — single h1, prompt textarea is accessibly
 * labeled, prompt submit parks the typed prompt + sends the visitor into the
 * local-only builder at /start (NO login), "Start building" CTA points at
 * sign-up.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { MarketingHero } from "@/features/marketing/MarketingHero";
import { readAnonPrompt } from "@/lib/anonymousBuilder";

beforeEach(() => {
  mockPush.mockReset();
  window.sessionStorage.clear();
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

  it("submitting a typed prompt parks it and navigates into the local builder", async () => {
    const user = userEvent.setup();
    render(<MarketingHero />);
    const form = screen.getByTestId("marketing-hero-prompt") as HTMLFormElement;
    const textarea = screen.getByRole("textbox", {
      name: /describe what you want to automate/i,
    });
    await user.type(textarea, "Notify #wins on a 5-star review");
    const submit = screen.getByRole("button", { name: /get started/i });
    await user.click(submit);
    // Goes into the local-only builder — NO sign-up gate to start building.
    expect(mockPush).toHaveBeenCalledWith("/start");
    expect(mockPush).toHaveBeenCalledTimes(1);
    // The typed prompt is preserved for handoff (not lost, not in the URL).
    expect(readAnonPrompt()).toBe("Notify #wins on a 5-star review");
    expect(form).toBeInTheDocument();
  });

  it("submitting with no text still enters the local builder (empty prompt)", async () => {
    const user = userEvent.setup();
    render(<MarketingHero />);
    const submit = screen.getByRole("button", { name: /get started/i });
    await user.click(submit);
    expect(mockPush).toHaveBeenCalledWith("/start");
    expect(readAnonPrompt()).toBe("");
  });

  it("'Start building' CTA links to /auth/sign-up", () => {
    render(<MarketingHero />);
    expect(screen.getByTestId("marketing-hero-start")).toHaveAttribute(
      "href",
      "/auth/sign-up",
    );
  });
});
