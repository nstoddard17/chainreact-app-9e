"use client";

import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { EyeGlyph, EyeOffGlyph } from "./AuthGlyphs";

type NativeProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className">;

/**
 * The one labelled input used by every auth form (Slice AUTH-DESIGN-1).
 *
 * Styling comes from the handoff's `Field` + `.inp`. The accessibility wiring
 * around it is ours, and is the reason this exists as a primitive rather than
 * per-form markup:
 *   - a real `<label htmlFor>` — never a placeholder-as-label;
 *   - `hint` and `error` are linked with `aria-describedby`, so a screen reader
 *     hears the requirement/failure when it lands on the field;
 *   - `aria-invalid` is set from `error`, which also drives the red border;
 *   - `extra` renders the right-hand slot on the label row (the design puts
 *     "Forgot password?" there).
 *
 * The visible label text is load-bearing for the Playwright suites, which
 * resolve fields with `getByLabel(/email|password/i)` — keep "Email" and
 * "Password" as the accessible names.
 */
export function AuthField({
  label,
  hint,
  error,
  extra,
  reveal = false,
  fieldClassName,
  ...inputProps
}: NativeProps & {
  label: string;
  /** Persistent helper text below the input. */
  hint?: ReactNode;
  /** Field-level validation message; also flips the input to the invalid style. */
  error?: string | null;
  /** Right-hand slot on the label row (e.g. the "Forgot password?" link). */
  extra?: ReactNode;
  /** Adds the show/hide toggle. Only meaningful for `type="password"`. */
  reveal?: boolean;
  fieldClassName?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const [shown, setShown] = useState(false);

  const describedBy = [hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  const type = reveal && shown ? "text" : inputProps.type;

  return (
    <div className="au-fld">
      <div className="au-fld-top">
        <label className="au-fld-l" htmlFor={id}>
          {label}
        </label>
        {extra}
      </div>

      <div
        className={
          "au-inp" +
          (reveal ? " au-inp--action" : "") +
          (fieldClassName ? ` ${fieldClassName}` : "")
        }
      >
        <input
          {...inputProps}
          id={id}
          type={type}
          aria-invalid={error ? true : undefined}
          {...(describedBy ? { "aria-describedby": describedBy } : {})}
        />
        {reveal && (
          <button
            type="button"
            className="au-eye"
            onClick={() => setShown((s) => !s)}
            /*
             * Deliberately avoids the word "password": the e2e suites select the
             * password INPUT with `getByLabel(/password/i)`, and an accessible
             * name like "Show password" would make that locator ambiguous and
             * fail Playwright's strict mode. This name still describes the
             * action accurately for screen-reader users.
             */
            aria-label={shown ? "Hide typed characters" : "Show typed characters"}
            aria-pressed={shown}
          >
            {shown ? <EyeOffGlyph size={16} /> : <EyeGlyph size={16} />}
          </button>
        )}
      </div>

      {hint ? (
        <span className="au-fld-hint" id={hintId}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="au-fld-err" id={errorId}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
