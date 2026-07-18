"use client";

import { useEffect, useRef } from "react";

/**
 * Optional onboarding video modal (5.ONBOARD-1 Batch 4).
 *
 * The imported design has NO video surface, so this is a minimal in-system
 * modal following the house hand-rolled dialog pattern (FolderFormDialog):
 * fixed overlay, role=dialog + aria-modal, Escape + overlay-click close,
 * focus moved in on open. Native <video controls> = full keyboard support.
 *
 * Honesty contract: watching is OPTIONAL forever — `onWatched` fires once at
 * ended/≥90% purely to persist `video_watched_at`; it never completes a
 * checklist step and never blocks anything.
 */
export function OnboardingVideoModal({
  videoUrl,
  captionsUrl,
  onWatched,
  onClose,
}: {
  videoUrl: string;
  captionsUrl: string | null;
  onWatched: () => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const watchedRef = useRef(false);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const markWatched = () => {
    if (watchedRef.current) return;
    watchedRef.current = true;
    onWatched();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      data-testid="onboarding-video-overlay"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="See how ChainReact works"
        data-testid="onboarding-video-modal"
        className="w-full max-w-xl overflow-hidden rounded-[14px] bg-card shadow-[inset_0_0_0_1px_hsl(var(--border))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">
            See how it works
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            data-testid="onboarding-video-close"
            aria-label="Close video"
            className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            ✕
          </button>
        </div>
        {/* Captions: <track> renders only when a captions file is configured.
            crossOrigin lets same-CDN caption files load under CORS. */}
        <video
          data-testid="onboarding-video-player"
          className="aspect-video w-full bg-black"
          src={videoUrl}
          controls
          preload="metadata"
          crossOrigin="anonymous"
          onEnded={markWatched}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration > 0 && v.currentTime / v.duration >= 0.9) {
              markWatched();
            }
          }}
        >
          {captionsUrl && (
            <track
              kind="captions"
              src={captionsUrl}
              srcLang="en"
              label="English"
              default
            />
          )}
        </video>
      </div>
    </div>
  );
}
