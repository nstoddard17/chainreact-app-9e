/**
 * Scoped stylesheet for the auth surface (Slice AUTH-DESIGN-1).
 *
 * Ported from the single `AuthStyles()` block in the `Auth.html` Anthropic
 * Design handoff (`src/auth-app.jsx`). Rendered ONCE by {@link AuthShell}, the
 * same way the marketing components carry their own `<style>` blocks rather
 * than growing `app/globals.css`.
 *
 * Every class is `au-` prefixed and every color reads a `--au-*` token from the
 * `[data-auth-surface]` block in `app/globals.css`, so nothing here can leak
 * into the app shell, builder, or marketing surfaces.
 *
 * Additions beyond the handoff (the design only styled `input:focus`):
 *   - `:focus-visible` rings on every interactive control (a11y requirement —
 *     keyboard users must be able to see where they are).
 *   - `.au-fld-err` / `.au-alert` / `.au-status` message styling, which the
 *     static design had no states for.
 *   - `:disabled` styling for in-flight submits.
 */
export function AuthSurfaceStyles() {
  return (
    <style>{`
      .au-root { display: grid; grid-template-columns: minmax(0,1fr) 1.05fr; min-height: 100svh; }
      @media (max-width: 900px) { .au-root { grid-template-columns: 1fr; } }

      /* ---------- left: the form column ---------- */
      .au-form-col { display: flex; flex-direction: column; min-width: 0; background: var(--au-bg); position: relative; }
      .au-head { display: flex; align-items: center; justify-content: space-between; padding: 24px 40px; gap: 16px; flex-wrap: wrap; }
      .au-brand { display: inline-flex; border-radius: 8px; color: var(--au-text); }
      .au-ctx { display: inline-flex; align-items: center; gap: 9px; padding: 6px 14px 6px 12px; background: var(--au-panel); border: 1px solid var(--au-border); border-radius: 999px; font-size: 12.5px; color: var(--au-muted); }
      .au-ctx-app { display: inline-flex; align-items: center; gap: 6px; color: var(--au-text); font-weight: 600; }
      .au-ctx-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--au-accent); box-shadow: 0 0 0 3px var(--au-accent-soft); }

      .au-body { flex: 1; display: flex; align-items: center; justify-content: center; padding: 20px 24px 8px; }
      @media (min-width: 560px) { .au-body { padding: 20px 40px 8px; } }
      @media (max-height: 820px) { .au-body { align-items: flex-start; } }
      .au-inner { width: 100%; max-width: 380px; }

      .au-eyebrow { font-family: var(--font-mono), ui-monospace, monospace; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--au-accent); margin-bottom: 12px; }
      .au-title { font-size: 27px; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 8px; line-height: 1.12; color: var(--au-text); }
      .au-sub { font-size: 14px; color: var(--au-muted); line-height: 1.5; margin: 0 0 26px; text-wrap: pretty; }

      /* ---------- OAuth ---------- */
      .au-social { display: flex; flex-direction: column; gap: 10px; }
      .au-sso { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; padding: 11px 14px; background: var(--au-panel); border: 1px solid var(--au-border); border-radius: 10px; font-size: 13.5px; font-weight: 500; color: var(--au-text); transition: border-color .15s ease, background .15s ease, transform .08s ease; }
      .au-sso:hover:not(:disabled) { border-color: var(--au-border-strong); background: var(--au-panel-2); }
      .au-sso:active:not(:disabled) { transform: translateY(1px); }
      .au-sso:disabled { opacity: .6; cursor: not-allowed; }

      .au-divider { display: flex; align-items: center; gap: 14px; margin: 20px 0; color: var(--au-muted-2); font-size: 11.5px; }
      .au-divider::before, .au-divider::after { content: ""; height: 1px; flex: 1; background: var(--au-border); }

      /* ---------- fields ---------- */
      .au-fields { display: flex; flex-direction: column; gap: 15px; }
      .au-fld { display: flex; flex-direction: column; gap: 7px; }
      .au-fld-top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
      .au-fld-l { font-size: 12.5px; font-weight: 500; color: var(--au-text-2); }
      .au-fld-link { font-size: 12.5px; color: var(--au-muted); background: none; border: 0; padding: 0; border-radius: 4px; }
      .au-fld-link:hover { color: var(--au-accent); }
      .au-fld-hint { font-size: 11.5px; color: var(--au-muted-2); margin-top: 1px; }
      .au-fld-err { font-size: 11.5px; color: var(--au-danger); margin-top: 1px; }

      .au-inp { position: relative; }
      .au-inp input { width: 100%; padding: 11px 13px; background: var(--au-panel); border: 1px solid var(--au-border); border-radius: 10px; color: var(--au-text); font-size: 14px; outline: none; transition: border-color .15s ease, box-shadow .15s ease; }
      .au-inp input::placeholder { color: var(--au-muted-2); }
      .au-inp input:focus { border-color: color-mix(in oklab, var(--au-accent) 60%, var(--au-border)); box-shadow: 0 0 0 3px var(--au-accent-soft); }
      .au-inp input:disabled { opacity: .6; cursor: not-allowed; }
      .au-inp input[aria-invalid="true"] { border-color: var(--au-danger); }
      .au-inp input[aria-invalid="true"]:focus { box-shadow: 0 0 0 3px var(--au-danger-soft); }
      .au-inp--action input { padding-right: 44px; }
      .au-inp-code input { font-family: var(--font-mono), ui-monospace, monospace; letter-spacing: .35em; }

      .au-eye { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; background: transparent; border: 0; color: var(--au-muted); border-radius: 7px; }
      .au-eye:hover { color: var(--au-text); background: var(--au-panel-2); }

      /* ---------- primary action ---------- */
      .au-submit { display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%; margin-top: 4px; padding: 12px 16px; background: var(--au-accent); color: var(--au-on-accent); border: 1px solid transparent; border-radius: 10px; font-size: 14.5px; font-weight: 600; transition: filter .15s ease, transform .08s ease; }
      .au-submit:hover:not(:disabled) { filter: brightness(1.08); }
      .au-submit:active:not(:disabled) { transform: translateY(1px); }
      .au-submit:disabled { opacity: .55; cursor: not-allowed; }

      /* ---------- 6-digit verification code (AUTH-EMAIL-OTP-1) ----------
         The design draws six boxes; we paint six presentational cells and lay
         ONE real input across them (see AuthCodeInput.tsx). The input keeps its
         own text and caret transparent so the cells do the drawing — the active
         cell ring IS the caret indicator, which is why focus stays obvious
         without a blinking bar drifting out of alignment. */
      .au-code { position: relative; display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
      @media (min-width: 400px) { .au-code { gap: 10px; } }
      .au-code-cell { display: flex; align-items: center; justify-content: center; aspect-ratio: 1 / 1.15; background: var(--au-panel); border: 1px solid var(--au-border); border-radius: 10px; font-family: var(--font-mono), ui-monospace, monospace; font-size: 20px; font-weight: 600; color: var(--au-text); transition: border-color .15s ease, box-shadow .15s ease; }
      @media (min-width: 400px) { .au-code-cell { font-size: 22px; } }
      .au-code-cell-filled { border-color: color-mix(in oklab, var(--au-accent) 45%, var(--au-border)); }
      .au-code-cell-active { border-color: var(--au-accent); box-shadow: 0 0 0 3px var(--au-accent-soft); }
      .au-code-cell-invalid { border-color: var(--au-danger); }
      .au-code[data-disabled="true"] .au-code-cell { opacity: .6; }
      .au-code-input {
        position: absolute; inset: 0; width: 100%; height: 100%;
        background: transparent; border: 0; outline: none; padding: 0;
        font-family: var(--font-mono), ui-monospace, monospace; font-size: 20px;
        letter-spacing: 1em; text-indent: .5em;
        color: transparent; caret-color: transparent;
      }
      .au-code-input::selection { background: transparent; }
      .au-code-input:disabled { cursor: not-allowed; }
      /* The overlay input spans all six cells, so the generic auth focus ring
         would draw one box around the whole group and hide WHICH digit you're
         on. Focus is shown by .au-code-cell-active instead — a solid accent
         border plus ring on the single active cell. The extra qualifiers exist
         to out-specify the generic au-root input focus-visible rule above. */
      .au-root .au-code .au-code-input:focus-visible { outline: none; }

      /* ---------- messages ---------- */
      .au-alert { display: flex; gap: 9px; align-items: flex-start; margin: 0; padding: 10px 12px; background: var(--au-danger-soft); border: 1px solid color-mix(in oklab, var(--au-danger) 34%, transparent); border-radius: 10px; font-size: 12.5px; line-height: 1.45; color: var(--au-text); }
      .au-status { margin: 0; padding: 12px 14px; background: color-mix(in oklab, var(--au-success) 12%, transparent); border: 1px solid color-mix(in oklab, var(--au-success) 32%, transparent); border-radius: 10px; font-size: 13px; line-height: 1.5; color: var(--au-text-2); }
      .au-note { margin: 0; padding: 10px 12px; background: var(--au-panel); border: 1px solid var(--au-border); border-radius: 10px; font-size: 12px; line-height: 1.45; color: var(--au-muted); }

      /* ---------- swap / back / badge ---------- */
      .au-swap { text-align: center; font-size: 13px; color: var(--au-muted); margin: 22px 0 0; }
      .au-swap-btn { background: none; border: 0; padding: 0 0 0 6px; color: var(--au-accent); font-weight: 600; font-size: 13px; border-radius: 4px; }
      .au-swap-btn:hover:not(:disabled) { color: var(--au-accent-strong); text-decoration: underline; }
      .au-swap-btn:disabled { color: var(--au-muted-2); cursor: not-allowed; }
      .au-swap-muted { color: var(--au-muted-2); padding-left: 6px; }
      .au-swap-tight { margin-top: 8px; }

      .au-back { display: inline-flex; align-items: center; gap: 5px; margin-bottom: 26px; padding: 6px 12px 6px 8px; background: var(--au-panel); border: 1px solid var(--au-border); border-radius: 999px; font-size: 12.5px; color: var(--au-muted); transition: border-color .15s ease, color .15s ease; }
      .au-back:hover { color: var(--au-text); border-color: var(--au-border-strong); }
      .au-badge { width: 46px; height: 46px; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-bottom: 18px; background: var(--au-accent-soft); border: 1px solid color-mix(in oklab, var(--au-accent) 30%, var(--au-border)); color: var(--au-accent); }
      .au-em { color: var(--au-text); font-weight: 600; }

      .au-foot { padding: 22px 24px; font-size: 11.5px; color: var(--au-muted-2); text-align: center; line-height: 1.5; }
      @media (min-width: 560px) { .au-foot { padding: 22px 40px; } }
      .au-foot a { color: var(--au-muted); text-decoration: underline; text-underline-offset: 2px; }
      .au-foot a:hover { color: var(--au-text); }

      /* a11y: the handoff had no focus-visible treatment. Every control gets a
         clearly visible ring, on top of whatever hover styling it already has. */
      .au-form-col a:focus-visible,
      .au-form-col button:focus-visible,
      .au-root input:focus-visible {
        outline: 2px solid var(--au-accent);
        outline-offset: 2px;
      }

      /* ---------- right: brand showcase ---------- */
      .au-show { position: relative; overflow: hidden; background: radial-gradient(120% 120% at 80% 10%, #10151d 0%, #05070a 55%, #030405 100%); display: flex; flex-direction: column; justify-content: flex-end; padding: 56px; color: #f5f5f5; }
      @media (max-width: 900px) { .au-show { display: none; } }
      .au-show-grid { position: absolute; inset: 0; background-image: radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px); background-size: 26px 26px; mask-image: radial-gradient(ellipse 90% 80% at 60% 30%, #000 20%, transparent 78%); }
      .au-show-glow { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(circle at 72% 26%, color-mix(in oklab, var(--au-accent) 26%, transparent), transparent 46%), radial-gradient(circle at 30% 88%, color-mix(in oklab, var(--au-accent) 12%, transparent), transparent 46%); }
      .au-show-storm { position: absolute; inset: 0; pointer-events: none; }
      .au-show-clouds { position: absolute; inset: 0; background: radial-gradient(ellipse 60% 70% at 20% 20%, rgba(60,70,90,0.4), transparent 70%), radial-gradient(ellipse 55% 60% at 80% 15%, rgba(40,55,80,0.4), transparent 70%); animation: au-drift 26s ease-in-out infinite; }
      @keyframes au-drift { 0%,100% { transform: translateX(0); } 50% { transform: translateX(24px); } }
      .au-show-flash { position: absolute; inset: 0; background: radial-gradient(circle at 72% 26%, rgba(180,220,255,0.5), transparent 40%); mix-blend-mode: screen; opacity: 0; animation: au-flash 8.5s ease-out infinite; animation-delay: 2s; }
      @keyframes au-flash { 0%,90%,100% { opacity: 0; } 91% { opacity: .8; } 92% { opacity: .15; } 93% { opacity: .6; } 95% { opacity: 0; } }

      .au-show-mark { position: absolute; top: 15%; left: 50%; transform: translateX(-50%); z-index: 1; }
      .au-show-orbit { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); border: 1px solid rgba(125,211,252,0.16); border-radius: 50%; pointer-events: none; }
      .au-show-orbit-1 { width: 260px; height: 260px; animation: au-breathe 5s ease-in-out infinite; }
      .au-show-orbit-2 { width: 380px; height: 380px; border-color: rgba(125,211,252,0.08); animation: au-breathe 5s ease-in-out infinite reverse; }
      @keyframes au-breathe { 0%,100% { opacity: .5; transform: translate(-50%,-50%) scale(1); } 50% { opacity: 1; transform: translate(-50%,-50%) scale(1.05); } }

      .au-show-content { position: relative; z-index: 2; max-width: 460px; }
      .au-show-tagline { margin-bottom: 30px; }
      .au-show-tag-k { font-family: var(--font-mono), ui-monospace, monospace; font-size: 11.5px; letter-spacing: 0.12em; text-transform: uppercase; color: #7dd3fc; }
      .au-show-tag-h { font-size: 30px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.15; margin: 10px 0 0; color: #fff; text-wrap: balance; }

      .au-show-card { padding: 20px 22px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); border-radius: 14px; backdrop-filter: blur(8px); animation: au-fade .6s ease; }
      @keyframes au-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      .au-show-card-k { display: block; font-family: var(--font-mono), ui-monospace, monospace; font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: #7dd3fc; margin-bottom: 12px; }
      .au-show-card-text { font-size: 15.5px; line-height: 1.55; color: #e8eaed; margin: 0; text-wrap: pretty; }

      .au-show-stats { display: grid; grid-template-columns: repeat(3,1fr); margin-top: 26px; border-top: 1px solid rgba(255,255,255,0.09); padding-top: 22px; }
      .au-show-stat { border-right: 1px solid rgba(255,255,255,0.09); padding-right: 16px; }
      .au-show-stat:last-child { border-right: 0; }
      .au-show-stat-v { font-family: var(--font-mono), ui-monospace, monospace; font-size: 22px; font-weight: 600; color: #fff; letter-spacing: -0.01em; }
      .au-show-stat-k { font-size: 11.5px; color: #9aa0aa; margin-top: 3px; }

      .au-show-dots { display: flex; gap: 7px; margin-top: 24px; }
      .au-show-dot { width: 22px; height: 4px; border-radius: 99px; background: rgba(255,255,255,0.16); transition: background .3s ease; }
      .au-show-dot-on { background: #7dd3fc; }

      @media (prefers-reduced-motion: reduce) {
        .au-show-clouds, .au-show-flash, .au-show-orbit { animation: none; }
      }
      @media (max-height: 720px) {
        .au-show-mark { transform: translateX(-50%) scale(.62); top: 6%; }
        .au-show-orbit { display: none; }
      }
      @media (max-height: 560px) { .au-show-mark { display: none; } }
    `}</style>
  );
}
