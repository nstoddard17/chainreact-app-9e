import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { ArrowGlyph } from "./AuthGlyphs";

/**
 * Small shared controls for the auth surface (Slice AUTH-DESIGN-1), ported from
 * the handoff's `.af-submit` / `.af-divider` / message styling.
 *
 * These are presentational only — no state, no data access. Pending/disabled
 * decisions stay in the form components that own the request.
 */

/**
 * Primary submit. `pending` both swaps the label and disables the control, so a
 * second submit can't be fired while a request is in flight (the browser also
 * won't re-submit a disabled button). Pass `disabled` for the additional
 * gates the forms already apply (e.g. an unsolved captcha).
 */
export function AuthSubmit({
  pending,
  disabled,
  pendingLabel = "Working…",
  children,
  ...rest
}: {
  pending: boolean;
  disabled?: boolean;
  pendingLabel?: string;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "disabled" | "type">) {
  return (
    <button {...rest} type="submit" className="au-submit" disabled={pending || disabled}>
      {pending ? pendingLabel : children}
      {pending ? null : <ArrowGlyph size={16} />}
    </button>
  );
}

/** "or with email" rule between the OAuth block and the credential form. */
export function AuthDivider({ children }: { children: ReactNode }) {
  return (
    <div className="au-divider">
      <span>{children}</span>
    </div>
  );
}

/**
 * Form-level failure. `role="alert"` so it is announced as soon as it appears —
 * these messages are the result of a submit the user just made.
 */
export function AuthFormError({
  children,
  ...rest
}: { children: ReactNode } & Omit<HTMLAttributes<HTMLParagraphElement>, "children">) {
  return (
    <p {...rest} role="alert" className="au-alert">
      {children}
    </p>
  );
}

/**
 * Form-level success that replaces the form (e.g. "check your inbox").
 * `role="status"` — polite, because the user is not being asked to act.
 */
export function AuthFormStatus({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="au-status">
      {children}
    </p>
  );
}
