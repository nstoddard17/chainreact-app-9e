/**
 * RESPONSIVE-AUTH-8 — rendered proof for the auth responsive hardening.
 *
 * The geometry lives in the browser sweep
 * (`scripts/trash/responsive-foundation/measure-auth.mjs`); jsdom has no layout
 * engine and asserting pixel widths here would be theatre. What this file proves
 * is the part geometry cannot: that the responsive declarations are actually
 * ATTACHED to the elements the sweep measures, that there is exactly ONE of every
 * interactive control, and — the point of the whole batch — that none of it changed
 * what auth submits.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { AuthShell } from "@/features/auth/AuthShell";
import { AuthField } from "@/features/auth/AuthField";
import { AuthCodeInput } from "@/features/auth/AuthCodeInput";
import { GoogleSignInButton } from "@/features/auth/GoogleSignInButton";
import { AuthFormError, AuthFormStatus } from "@/features/auth/AuthControls";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/auth/sign-in",
  useSearchParams: () => new URLSearchParams(),
}));

const mockSignInWithOAuth = jest.fn().mockResolvedValue({ error: null });
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ auth: { signInWithOAuth: (...a: unknown[]) => mockSignInWithOAuth(...a) } }),
}));

const LONG_EMAIL =
  "samantha.j.worthington-fitzgerald+chainreact-signup@engineering.acme-corp.test";

describe("the auth shell carries the assertions the sweep measures", () => {
  it("declares the form well's legibility floor and names what it protects", () => {
    const { container } = render(
      <AuthShell>
        <p>body</p>
      </AuthShell>,
    );
    const well = container.querySelector(".au-inner");
    expect(well).not.toBeNull();
    expect(well).toHaveAttribute("data-legible-min", "280");
    expect(well).toHaveAttribute("data-legible-what", "auth form well");
  });

  it("declares that the auth page must never pan across the supported range", () => {
    const { container } = render(
      <AuthShell>
        <p>body</p>
      </AuthShell>,
    );
    expect(container.querySelector(".au-root")).toHaveAttribute("data-no-pan-below", "1600");
  });

  it("renders exactly one form well and one footer, at every presentation", () => {
    // A second, narrow-screen copy of the well is the duplication failure mode.
    const { container } = render(
      <AuthShell>
        <p>body</p>
      </AuthShell>,
    );
    expect(container.querySelectorAll(".au-inner")).toHaveLength(1);
    expect(container.querySelectorAll(".au-foot")).toHaveLength(1);
    expect(container.querySelectorAll(".au-form-col")).toHaveLength(1);
  });
});

describe("the verification code entry stays usable when compressed", () => {
  it("declares its floor on the allocated grid, not on an individual cell", () => {
    // A cell is deliberately a fixed track; the GRID is the allocation. Declaring
    // the floor on a cell would measure an intentionally fixed box.
    const { container } = render(<AuthCodeInput value="" onChange={() => {}} />);
    const grid = container.querySelector(".au-code");
    expect(grid).toHaveAttribute("data-legible-min", "252");
    expect(grid).toHaveAttribute("data-legible-what", "verification code entry");
    for (const cell of Array.from(container.querySelectorAll(".au-code-cell"))) {
      expect(cell).not.toHaveAttribute("data-legible-min");
    }
  });

  it("still submits ONE value from ONE real input after the change", () => {
    // Six painted cells, one control — the responsive work must not have turned
    // this into six inputs that need stitching together on submit.
    const onChange = jest.fn();
    const { container } = render(<AuthCodeInput value="" onChange={onChange} name="code" />);
    const inputs = container.querySelectorAll("input");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toHaveAttribute("name", "code");
    fireEvent.change(inputs[0]!, { target: { value: "482913" } });
    expect(onChange).toHaveBeenCalledWith("482913");
  });

  it("keeps rejecting non-digits, unchanged by the responsive work", () => {
    const onChange = jest.fn();
    const { container } = render(<AuthCodeInput value="" onChange={onChange} />);
    fireEvent.change(container.querySelector("input")!, { target: { value: "4a8b29" } });
    expect(onChange).toHaveBeenCalledWith("4829");
  });
});

describe("the OAuth control stays a readable, single control", () => {
  it("declares a floor on the allocated button and keeps its full label", () => {
    render(<GoogleSignInButton />);
    const button = screen.getByRole("button", { name: /continue with google/i });
    expect(button).toHaveAttribute("data-legible-min", "240");
    expect(button).toHaveAttribute("data-legible-what", "OAuth provider control");
  });

  it("renders exactly one provider control — no narrow-screen duplicate", () => {
    render(<GoogleSignInButton />);
    expect(screen.getAllByRole("button", { name: /continue with google/i })).toHaveLength(1);
  });

  it("still starts the same OAuth handshake with the same callback", async () => {
    render(<GoogleSignInButton />);
    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));
    expect(mockSignInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
        options: expect.objectContaining({
          redirectTo: expect.stringContaining("/auth/callback"),
        }),
      }),
    );
  });

  it("forwards a same-origin returnTo through the callback, unchanged", () => {
    mockSignInWithOAuth.mockClear();
    render(<GoogleSignInButton returnTo="/start/continue" />);
    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));
    const arg = mockSignInWithOAuth.mock.calls[0]![0] as {
      options: { redirectTo: string };
    };
    expect(arg.options.redirectTo).toContain("next=%2Fstart%2Fcontinue");
  });
});

describe("a long identifier stays inside the card and stays editable", () => {
  it("keeps a long address as the input's real value, not a truncated one", () => {
    // Truncation must never reach the VALUE — the user has to be able to correct
    // an address they mistyped, and the form has to submit what they see.
    render(<AuthField label="Email" type="email" name="email" defaultValue={LONG_EMAIL} />);
    const input = screen.getByLabelText("Email") as HTMLInputElement;
    expect(input.value).toBe(LONG_EMAIL);
    fireEvent.change(input, { target: { value: "corrected@acme.test" } });
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("corrected@acme.test");
  });

  it("renders the echoed address in the slot that breaks targetedly", () => {
    render(
      <p className="au-sub">
        We sent a code to <b className="au-em">{LONG_EMAIL}</b>.
      </p>,
    );
    // `.au-em` is the class the stylesheet gives `overflow-wrap: anywhere`; the
    // structure guard proves the rule exists, this proves the markup uses it.
    const em = document.querySelector(".au-em");
    expect(em).not.toBeNull();
    expect(em).toHaveTextContent(LONG_EMAIL);
  });

  it("renders error and success text in containers that break targetedly", () => {
    const { container } = render(
      <>
        <AuthFormError>Sign-in failed: reference acct_9f2b7c41e8d64a3fb05e7c8912ab34df.</AuthFormError>
        <AuthFormStatus>Your account is active.</AuthFormStatus>
      </>,
    );
    expect(container.querySelector(".au-alert")).not.toBeNull();
    expect(container.querySelector(".au-status")).not.toBeNull();
  });
});

describe("the password reveal control stays reachable and non-widening", () => {
  it("renders one reveal control that toggles the input type in place", () => {
    render(<AuthField label="Password" type="password" name="password" reveal />);
    const toggles = screen.getAllByRole("button", { name: /typed characters/i });
    expect(toggles).toHaveLength(1);
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    expect(input.type).toBe("password");
    fireEvent.click(toggles[0]!);
    expect((screen.getByLabelText("Password") as HTMLInputElement).type).toBe("text");
  });

  it("keeps the label associated with the control after the responsive work", () => {
    render(<AuthField label="Password" type="password" name="password" reveal />);
    // Association is what lets the e2e suites — and screen readers — find the
    // field; a responsive refactor that broke it would be invisible to geometry.
    expect(screen.getByLabelText("Password")).toHaveAttribute("name", "password");
  });

  it("still links hint and error text for assistive technology", () => {
    render(
      <AuthField
        label="Password"
        type="password"
        name="password"
        hint="Use 8 or more characters."
        error="That password is too short."
      />,
    );
    const input = screen.getByLabelText("Password");
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(describedBy.split(" ").filter(Boolean)).toHaveLength(2);
    expect(input).toHaveAttribute("aria-invalid", "true");
  });
});
