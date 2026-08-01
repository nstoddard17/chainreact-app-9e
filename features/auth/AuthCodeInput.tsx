"use client";

import { useId, useRef, useState, type ClipboardEvent, type ReactNode, type RefObject } from "react";

export const CODE_LENGTH = 6;

/**
 * Supabase email OTP length is project-configurable (6–10 digits) and NOT
 * guaranteed to match across environments — production sends 6 today while
 * chainreact-dev sends 8 (SUPABASE-HOSTED-DEV-AUTH-OTP-LENGTH-1). The email
 * confirmation flow therefore accepts the whole range instead of assuming 6.
 * TOTP authenticator codes remain exactly 6 (RFC 6238) and keep CODE_LENGTH.
 */
export const EMAIL_OTP_MIN_LENGTH = 6;
export const EMAIL_OTP_MAX_LENGTH = 10;

/** Strip everything that isn't a digit and clamp to the given length. */
export function sanitizeCode(raw: string, maxLength: number = CODE_LENGTH): string {
  return raw.replace(/\D/g, "").slice(0, maxLength);
}

/**
 * Six-digit verification code entry (Slice AUTH-EMAIL-OTP-1).
 *
 * The design draws six separate boxes. We render six PRESENTATIONAL cells over
 * ONE real `<input>` rather than six inputs, which the brief explicitly allows
 * and which is materially better:
 *   - one labelled control, one value — nothing to stitch together on submit,
 *     and screen readers announce a single "Verification code" field instead of
 *     six anonymous boxes;
 *   - caret movement, Backspace, Left/Right arrows, Home/End, undo and native
 *     text selection all work because they are the browser's own behaviour, not
 *     six focus-juggling handlers approximating it;
 *   - `autoComplete="one-time-code"` lets iOS/Android offer the SMS/email code,
 *     which only works on a single field.
 *
 * The input is laid across the grid and is NOT hidden — it takes focus and full
 * keyboard input, the cells simply paint the digits for it. Its own text and
 * caret are transparent: a centred caret would drift out of alignment with the
 * boxes, so the highlighted cell IS the caret indicator. That highlight is
 * derived from the real `selectionStart`, so arrow keys visibly move it.
 *
 * Numeric-only is enforced on the VALUE (not just the keyboard), so a pasted or
 * IME-composed non-digit can never reach the form.
 */
/**
 * Variable-length email OTP entry (SUPABASE-HOSTED-DEV-AUTH-OTP-LENGTH-1).
 *
 * ONE robust input, no fixed slots: the emailed code's length depends on the
 * Supabase project (6–10 digits), so presentational cells would either lie
 * about the expected length or reflow mid-typing. The value is kept as a
 * STRING throughout — leading zeroes survive — and sanitized to digits with a
 * hard clamp at {@link EMAIL_OTP_MAX_LENGTH}. No `maxLength` attribute: the
 * browser would truncate a formatted paste ("12 34 56 78") BEFORE our
 * sanitizer strips the separators; sanitizing in onChange loses nothing.
 * Paste therefore needs no special handling — the native insert fires
 * onChange and gets sanitized like typed input. Submission gating (6–10,
 * explicit button, no auto-submit) is the caller's job. The code is never
 * logged and never leaves the form except as the form field value.
 */
export function AuthOtpField({
  value,
  onChange,
  disabled = false,
  invalid = false,
  name = "code",
  label = "Verification code",
  hint,
  inputRef,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  name?: string;
  label?: string;
  hint?: ReactNode;
  /** Lets the parent re-focus the field after a rejected code. */
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const id = useId();
  const hintId = `${id}-hint`;

  return (
    <div className="au-fld">
      <label className="au-fld-l" htmlFor={id}>
        {label}
      </label>
      <div className="au-inp au-otp" data-legible-min="220" data-legible-what="verification code entry">
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          placeholder="••••••"
          value={value}
          disabled={disabled}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={hint ? hintId : undefined}
          onChange={(e) => onChange(sanitizeCode(e.target.value, EMAIL_OTP_MAX_LENGTH))}
        />
      </div>
      {hint ? (
        <span className="au-fld-hint" id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function AuthCodeInput({
  value,
  onChange,
  disabled = false,
  invalid = false,
  name = "code",
  label = "Verification code",
  hint,
  inputRef,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  name?: string;
  label?: string;
  hint?: ReactNode;
  /** Lets the parent re-focus the field after a rejected code. */
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localRef;
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);

  const cells = Array.from({ length: CODE_LENGTH }, (_, i) => value[i] ?? "");
  // The highlighted cell tracks the real caret, clamped into range.
  const activeIndex = Math.min(Math.max(caret, 0), CODE_LENGTH - 1);

  function syncCaret() {
    const el = ref.current;
    if (el) setCaret(el.selectionStart ?? el.value.length);
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = sanitizeCode(e.clipboardData.getData("text") ?? "");
    if (!pasted) return;
    // A full-length paste replaces the whole code no matter which segment the
    // caret is in — otherwise pasting into a partially-filled field would
    // silently truncate the code the user just copied out of their email.
    if (pasted.length >= CODE_LENGTH) {
      e.preventDefault();
      onChange(pasted);
      requestAnimationFrame(() => {
        const el = ref.current;
        if (el) el.setSelectionRange(CODE_LENGTH, CODE_LENGTH);
        setCaret(CODE_LENGTH);
      });
    }
    // Shorter pastes fall through to the native insert, then get sanitized by
    // onChange like any other input.
  }

  return (
    <div className="au-fld">
      <label className="au-fld-l" htmlFor={id}>
        {label}
      </label>

      {/*
        RESPONSIVE-AUTH-8 — the code grid is allocated (six `1fr` tracks across
        the full field width), so it carries its own floor. 252px = six 36px
        cells plus five 8px gaps: below that the cells stop being reliable touch
        targets even though nothing has overflowed anything.
      */}
      <div
        className="au-code"
        data-disabled={disabled ? "true" : undefined}
        data-legible-min="252"
        data-legible-what="verification code entry"
      >
        {cells.map((digit, i) => (
          <div
            key={i}
            aria-hidden
            className={
              "au-code-cell" +
              (digit ? " au-code-cell-filled" : "") +
              (invalid ? " au-code-cell-invalid" : "") +
              (focused && i === activeIndex ? " au-code-cell-active" : "")
            }
          >
            {digit}
          </div>
        ))}
        <input
          ref={ref}
          id={id}
          name={name}
          className="au-code-input"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={CODE_LENGTH}
          value={value}
          disabled={disabled}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={hint ? hintId : undefined}
          onChange={(e) => onChange(sanitizeCode(e.target.value))}
          onPaste={handlePaste}
          onSelect={syncCaret}
          onKeyUp={syncCaret}
          onClick={syncCaret}
          onFocus={() => {
            setFocused(true);
            syncCaret();
          }}
          onBlur={() => setFocused(false)}
        />
      </div>

      {hint ? (
        <span className="au-fld-hint" id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}
